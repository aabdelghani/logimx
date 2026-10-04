// Small Windows helpers shared by the Windows backends
#pragma once
#ifdef _WIN32
#include <windows.h>

#include <string>

namespace platform {

inline std::wstring wide(const std::string& s) {
    if (s.empty()) return {};
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0);
    std::wstring w(static_cast<size_t>(n), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), w.data(), n);
    return w;
}

inline std::string narrow(const std::wstring& w) {
    if (w.empty()) return {};
    int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), nullptr, 0, nullptr, nullptr);
    std::string s(static_cast<size_t>(n), '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), s.data(), n, nullptr, nullptr);
    return s;
}

// The exe name of a process without its folder and ".exe": "chrome", "Code". This is the
// "window class" the tracker reports on Windows and the one profiles match on.
inline std::string processStem(DWORD pid) {
    std::string out;
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!h) return out;
    wchar_t buf[MAX_PATH * 2];
    DWORD n = sizeof(buf) / sizeof(buf[0]);
    if (QueryFullProcessImageNameW(h, 0, buf, &n)) {
        std::wstring p(buf, n);
        size_t slash = p.find_last_of(L"\\/");
        if (slash != std::wstring::npos) p = p.substr(slash + 1);
        if (p.size() > 4 && _wcsicmp(p.c_str() + p.size() - 4, L".exe") == 0) p.resize(p.size() - 4);
        out = narrow(p);
    }
    CloseHandle(h);
    return out;
}

}  // namespace platform
#endif
