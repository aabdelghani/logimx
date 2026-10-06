// Windows: known folders, Start-menu shortcuts, ShellExecute, Core Audio, SPI mouse speed
#include <windows.h>
#include <endpointvolume.h>
#include <mmdeviceapi.h>
#include <objbase.h>
#include <sddl.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <tlhelp32.h>

#include <algorithm>
#include <fstream>
#include <set>

#include "platform.h"
#include "steam.h"
#include "win_util.h"

namespace platform {

const char* name() { return "windows"; }

namespace {

std::string knownFolder(REFKNOWNFOLDERID id) {
    PWSTR p = nullptr;
    std::string out;
    if (SUCCEEDED(SHGetKnownFolderPath(id, KF_FLAG_CREATE, nullptr, &p)) && p) out = narrow(p);
    CoTaskMemFree(p);
    std::replace(out.begin(), out.end(), '\\', '/');
    return out;
}

std::string ensure(const std::string& dir) {
    std::error_code ec;
    std::filesystem::create_directories(fsPath(dir), ec);
    return dir;
}

// COM for the calling thread for the length of one call (engine actions run on HID threads)
struct ComScope {
    HRESULT hr;
    ComScope() : hr(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)) {}
    ~ComScope() { if (SUCCEEDED(hr)) CoUninitialize(); }
};

void shellOpen(const std::wstring& target, const std::wstring& args = L"") {
    ComScope com;
    SHELLEXECUTEINFOW sei{};
    sei.cbSize = sizeof(sei);
    sei.fMask = SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI;
    sei.lpVerb = L"open";
    sei.lpFile = target.c_str();
    sei.lpParameters = args.empty() ? nullptr : args.c_str();
    sei.nShow = SW_SHOWNORMAL;
    ShellExecuteExW(&sei);
}

}  // namespace

std::string homeDir() { return knownFolder(FOLDERID_Profile); }

std::string hostName() {
    wchar_t buf[256];
    DWORD n = 256;
    return GetComputerNameExW(ComputerNameDnsHostname, buf, &n) ? narrow(std::wstring(buf, n)) : "";
}
std::string configDir() { return ensure(knownFolder(FOLDERID_RoamingAppData) + "/LogiMX/agent"); }
std::string stateDir() { return ensure(knownFolder(FOLDERID_LocalAppData) + "/LogiMX/agent"); }

std::string ipcEndpoint() {
    wchar_t user[256];
    DWORD n = 256;
    std::string u = GetUserNameW(user, &n) ? narrow(std::wstring(user, n ? n - 1 : 0)) : "user";
    for (auto& c : u)
        if (!isalnum(static_cast<unsigned char>(c)) && c != '-' && c != '_' && c != '.') c = '_';
    return "\\\\.\\pipe\\logimx-" + u;
}

static void (*gStop)() = nullptr;
void onStop(void (*fn)()) {
    gStop = fn;
    SetConsoleCtrlHandler([](DWORD) -> BOOL { if (gStop) gStop(); return TRUE; }, TRUE);
}

void runCommand(const std::string& cmd) {
    if (cmd.empty()) return;
    std::wstring line = L"cmd.exe /d /c " + wide(cmd);
    STARTUPINFOW si{};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi{};
    if (CreateProcessW(nullptr, line.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW | DETACHED_PROCESS, nullptr, nullptr, &si, &pi)) {
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
    }
}

void openTarget(const std::string& t) {
    std::string target = t;
    if (target.empty()) return;
    if (target == "~" || target.rfind("~/", 0) == 0) target = homeDir() + target.substr(1);
    shellOpen(wide(target));
}

void launchApp(const std::string& id) {
    if (id.empty()) return;
    if (id.rfind("steam:", 0) == 0) { shellOpen(L"steam://rungameid/" + wide(id.substr(6))); return; }
    shellOpen(wide(id));   // a Start-menu shortcut or an exe path
}

// ---------------------------------------------------------------- applications

namespace {

// where a shortcut points: the exe's name without ".exe" (what the tracker reports)
std::string shortcutTarget(IShellLinkW* link, const std::wstring& lnk) {
    IPersistFile* pf = nullptr;
    std::string out;
    if (SUCCEEDED(link->QueryInterface(IID_IPersistFile, reinterpret_cast<void**>(&pf)))) {
        if (SUCCEEDED(pf->Load(lnk.c_str(), STGM_READ))) {
            wchar_t path[MAX_PATH] = {0};
            if (SUCCEEDED(link->GetPath(path, MAX_PATH, nullptr, SLGP_RAWPATH)) && path[0]) {
                std::wstring p = path;
                size_t slash = p.find_last_of(L"\\/");
                if (slash != std::wstring::npos) p = p.substr(slash + 1);
                if (p.size() > 4 && _wcsicmp(p.c_str() + p.size() - 4, L".exe") == 0) {
                    p.resize(p.size() - 4);
                    out = narrow(p);
                }
            }
        }
        pf->Release();
    }
    return out;
}

void scanStartMenu(const std::string& root, json& out, std::set<std::string>& seen, IShellLinkW* link) {
    std::error_code ec;
    std::filesystem::recursive_directory_iterator it(fsPath(root), std::filesystem::directory_options::skip_permission_denied, ec), end;
    for (; !ec && it != end; it.increment(ec)) {
        if (!it->is_regular_file(ec)) continue;
        auto p = it->path();
        std::wstring ext = p.extension().wstring();
        if (_wcsicmp(ext.c_str(), L".lnk") != 0) continue;
        std::string name = fsString(p.stem());
        std::string lc = name;
        for (auto& c : lc) c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
        if (lc.find("uninstall") != std::string::npos || lc.find("readme") != std::string::npos || lc.find("help") == 0) continue;
        if (seen.count(lc)) continue;
        seen.insert(lc);
        std::string exe = link ? shortcutTarget(link, p.wstring()) : "";
        out.push_back({{"id", fsString(p)}, {"name", name}, {"icon", ""}, {"wm_class", exe.empty() ? name : exe}});
    }
}

}  // namespace

json listApplications() {
    json out = json::array();
    std::set<std::string> seen;
    {
        ComScope com;
        IShellLinkW* link = nullptr;
        CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER, IID_IShellLinkW, reinterpret_cast<void**>(&link));
        scanStartMenu(knownFolder(FOLDERID_Programs), out, seen, link);
        scanStartMenu(knownFolder(FOLDERID_CommonPrograms), out, seen, link);
        if (link) link->Release();
    }
    // Steam's install folder is in the registry
    wchar_t sp[MAX_PATH];
    DWORD sz = sizeof(sp);
    std::vector<std::string> roots;
    if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\Valve\\Steam", L"SteamPath", RRF_RT_REG_SZ, nullptr, sp, &sz) == ERROR_SUCCESS)
        roots.push_back(narrow(sp) + "/steamapps");
    std::set<std::string> steamSeen;
    scanSteamGames(out, steamSeen, roots);
    std::sort(out.begin(), out.end(), [](const json& a, const json& b) { return a["name"].get<std::string>() < b["name"].get<std::string>(); });
    return out;
}

std::string inputMonitoring() { return "granted"; }

json conflictingTools() {
    json out = json::array();
    static const wchar_t* kTools[] = {L"logioptionsplus_agent.exe", L"LogiOptionsMgr.exe", L"LogiOptions.exe", L"SetPoint.exe", L"LGHUB Agent.exe"};
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return out;
    PROCESSENTRY32W pe{};
    pe.dwSize = sizeof(pe);
    for (BOOL ok = Process32FirstW(snap, &pe); ok; ok = Process32NextW(snap, &pe)) {
        for (const wchar_t* t : kTools) {
            if (_wcsicmp(pe.szExeFile, t) != 0) continue;
            std::wstring n = pe.szExeFile;
            n.resize(n.size() - 4);
            out.push_back({{"name", narrow(n)}, {"pid", static_cast<int>(pe.th32ProcessID)}});
        }
    }
    CloseHandle(snap);
    return out;
}

// -1..1 onto the Control Panel's 1..20 scale, 10 being the default
void setPointerSpeed(double v, const std::string&, const std::string&) {
    int speed = static_cast<int>(10 + v * (v < 0 ? 9 : 10) + (v < 0 ? -0.5 : 0.5));
    speed = std::max(1, std::min(20, speed));
    SystemParametersInfoW(SPI_SETMOUSESPEED, 0, reinterpret_cast<PVOID>(static_cast<INT_PTR>(speed)), SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
}

// ---------------------------------------------------------------- audio

namespace {

IAudioEndpointVolume* endpoint(EDataFlow flow) {
    IMMDeviceEnumerator* en = nullptr;
    IMMDevice* dev = nullptr;
    IAudioEndpointVolume* vol = nullptr;
    if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), reinterpret_cast<void**>(&en)))) return nullptr;
    if (SUCCEEDED(en->GetDefaultAudioEndpoint(flow, eConsole, &dev))) {
        dev->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&vol));
        dev->Release();
    }
    en->Release();
    return vol;
}

}  // namespace

Audio audioGet() {
    ComScope com;
    Audio a;
    if (IAudioEndpointVolume* out = endpoint(eRender)) {
        float level = 0;
        BOOL mute = FALSE;
        if (SUCCEEDED(out->GetMasterVolumeLevelScalar(&level))) { a.volume = static_cast<int>(level * 100 + 0.5f); a.ok = true; }
        if (SUCCEEDED(out->GetMute(&mute))) a.muted = mute;
        out->Release();
    }
    if (IAudioEndpointVolume* in = endpoint(eCapture)) {
        BOOL mute = FALSE;
        if (SUCCEEDED(in->GetMute(&mute))) a.micMuted = mute;
        in->Release();
    }
    return a;
}

bool audioSetVolume(int percent) {
    ComScope com;
    IAudioEndpointVolume* out = endpoint(eRender);
    if (!out) return false;
    bool ok = SUCCEEDED(out->SetMasterVolumeLevelScalar(std::max(0, std::min(100, percent)) / 100.0f, nullptr));
    if (ok && percent > 0) out->SetMute(FALSE, nullptr);
    out->Release();
    return ok;
}

bool micToggle() {
    ComScope com;
    IAudioEndpointVolume* in = endpoint(eCapture);
    if (!in) return false;
    BOOL mute = FALSE;
    bool ok = SUCCEEDED(in->GetMute(&mute)) && SUCCEEDED(in->SetMute(!mute, nullptr));
    in->Release();
    return ok;
}

}  // namespace platform
