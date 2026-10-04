// SendInput backend (Windows)
#include <windows.h>

#include <chrono>
#include <cstdlib>
#include <thread>

#include "../platform/platform.h"
#include "../platform/win_util.h"
#include "injector.h"
#include "keymap_win.h"

namespace actions {

namespace {

// mouse buttons by their Linux names: (down flag, up flag, xbutton data)
struct WinButton { const char* name; DWORD down, up, data; };
constexpr WinButton kButtons[] = {
    {"BTN_LEFT", MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, 0},
    {"BTN_RIGHT", MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, 0},
    {"BTN_MIDDLE", MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, 0},
    {"BTN_SIDE", MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, XBUTTON1},
    {"BTN_BACK", MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, XBUTTON1},
    {"BTN_EXTRA", MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, XBUTTON2},
    {"BTN_FORWARD", MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, XBUTTON2},
};

std::string upper(const std::string& s) {
    std::string n = s;
    for (auto& c : n) c = static_cast<char>(toupper(static_cast<unsigned char>(c)));
    if (n.rfind("KEY_", 0) != 0 && n.rfind("BTN_", 0) != 0) n = "KEY_" + n;
    return n;
}

const WinButton* button(const std::string& name) {
    std::string n = upper(name);
    for (auto& b : kButtons)
        if (n == b.name) return &b;
    return nullptr;
}

void sendMouse(DWORD flags, DWORD data) {
    INPUT in{};
    in.type = INPUT_MOUSE;
    in.mi.dwFlags = flags;
    in.mi.mouseData = data;
    SendInput(1, &in, sizeof(INPUT));
}

// one key, down or up; false when Windows has no key for that name
bool sendKey(const std::string& name, bool down) {
    std::string n = upper(name);
    if (const WinButton* b = button(n)) { sendMouse(down ? b->down : b->up, b->data); return true; }
    // keys with no virtual-key code that the system still has a function for
    if (n == "KEY_MICMUTE") { if (down) platform::micToggle(); return true; }
    // display brightness has no key code on Windows: built-in screens take it through WMI
    // (external monitors do not offer it there)
    if (n == "KEY_BRIGHTNESSUP" || n == "KEY_BRIGHTNESSDOWN") {
        if (down) {
            const char* step = n == "KEY_BRIGHTNESSUP" ? "10" : "-10";
            platform::runCommand(std::string("powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command \"$b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1; if ($b) { $v = [math]::Max(0, [math]::Min(100, $b.CurrentBrightness + (") + step + ")));"
                                 " Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Brightness = [byte]$v; Timeout = 0} | Out-Null }\"");
        }
        return true;
    }
    const WinKey* k = winKey(n);
    if (!k) return false;
    INPUT in{};
    in.type = INPUT_KEYBOARD;
    in.ki.wVk = k->vk;
    in.ki.wScan = static_cast<WORD>(MapVirtualKeyW(k->vk, MAPVK_VK_TO_VSC));
    in.ki.dwFlags = (k->extended ? KEYEVENTF_EXTENDEDKEY : 0) | (down ? 0 : KEYEVENTF_KEYUP);
    SendInput(1, &in, sizeof(INPUT));
    return true;
}

}  // namespace

Injector::Injector() {}

Injector::~Injector() { releaseAll(); }

void Injector::press(const std::vector<std::string>& keys) {
    std::lock_guard<std::mutex> lk(m_);
    for (auto& k : keys) {
        int c = code(k);
        if (c < 0 || !sendKey(k, true)) continue;
        held_.insert(c);
    }
}

void Injector::release(const std::vector<std::string>& keys) {
    std::lock_guard<std::mutex> lk(m_);
    for (auto it = keys.rbegin(); it != keys.rend(); ++it) {
        int c = code(*it);
        if (c < 0) continue;
        sendKey(*it, false);
        held_.erase(c);
    }
}

void Injector::releaseAll() {
    std::lock_guard<std::mutex> lk(m_);
    // held_ keeps Linux codes; release by name through the shared table
    for (int c : held_) {
        for (auto& k : kWinKeys)
            if (code(std::string(k.name)) == c) { sendKey(std::string(k.name), false); break; }
        for (auto& b : kButtons)
            if (code(b.name) == c) { sendKey(b.name, false); break; }
    }
    held_.clear();
}

// Linux and Windows agree on the direction (positive = up / right) and Windows' wheel unit is
// 1/120 of a detent, the same as the hi-res units the engine works in.
void Injector::scroll(int dy, int dx, bool hires) {
    std::lock_guard<std::mutex> lk(m_);
    int k = hires ? 1 : WHEEL_DELTA;
    if (dy) sendMouse(MOUSEEVENTF_WHEEL, static_cast<DWORD>(dy * k));
    if (dx) sendMouse(MOUSEEVENTF_HWHEEL, static_cast<DWORD>(dx * k));
}

void Injector::click(const std::string& name, int count) {
    const WinButton* b = button(name);
    if (!b) return;
    for (int i = 0; i < count; ++i) {
        {
            std::lock_guard<std::mutex> lk(m_);
            sendMouse(b->down, b->data);
            sendMouse(b->up, b->data);
        }
        if (count > 1) std::this_thread::sleep_for(std::chrono::milliseconds(40));
    }
}

// Typed as Unicode characters, so the text comes out right whatever the keyboard layout is.
void Injector::typeText(const std::string& text) {
    std::wstring w = platform::wide(text);
    for (wchar_t ch : w) {
        if (ch == L'\r') continue;
        if (ch == L'\n') { sendKey("KEY_ENTER", true); sendKey("KEY_ENTER", false); }
        else {
            INPUT in[2] = {};
            for (int i = 0; i < 2; ++i) {
                in[i].type = INPUT_KEYBOARD;
                in[i].ki.wScan = ch;
                in[i].ki.dwFlags = KEYEVENTF_UNICODE | (i ? KEYEVENTF_KEYUP : 0);
            }
            SendInput(2, in, sizeof(INPUT));
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(4));
    }
}

}  // namespace actions
