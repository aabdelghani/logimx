// Focused application on Windows: the foreground window's process, by exe name
#include <windows.h>

#include <chrono>
#include <set>

#include "../platform/win_util.h"
#include "tracker.h"

namespace apps {

// Electron reads the pointer itself here
bool pointerPosition(int&, int&) { return false; }
bool warpPointer(int x, int y) { return SetCursorPos(x, y) != 0; }

std::vector<std::string> runningWindowClasses() {
    struct Ctx { std::vector<std::string> out; std::set<std::string> seen; } ctx;
    EnumWindows([](HWND w, LPARAM p) -> BOOL {
        auto* c = reinterpret_cast<Ctx*>(p);
        if (!IsWindowVisible(w) || GetWindow(w, GW_OWNER) || (GetWindowLongW(w, GWL_EXSTYLE) & WS_EX_TOOLWINDOW)) return TRUE;
        if (GetWindowTextLengthW(w) == 0) return TRUE;
        DWORD pid = 0;
        GetWindowThreadProcessId(w, &pid);
        std::string stem = platform::processStem(pid);
        if (!stem.empty() && c->seen.insert(stem).second) c->out.push_back(stem);
        return TRUE;
    }, reinterpret_cast<LPARAM>(&ctx));
    return ctx.out;
}

// Electron's skipTaskbar works on Windows; nothing to ask the shell for
bool skipTaskbar(unsigned long) { return false; }

Tracker::~Tracker() { stop(); }

void Tracker::start() {
    backend_ = "windows";
    thread_ = std::thread([this] {
        HWND last = nullptr;
        while (!stop_) {
            HWND w = GetForegroundWindow();
            if (w != last) {
                last = w;
                DWORD pid = 0;
                if (w) GetWindowThreadProcessId(w, &pid);
                std::string stem = pid ? platform::processStem(pid) : "";
                // a moment with no foreground window (switching, the desktop) keeps the profile
                if (!stem.empty()) { pid_ = static_cast<int>(pid); set(stem); }
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }
    });
}

void Tracker::stop() {
    stop_ = true;
    if (thread_.joinable()) thread_.join();
}

void Tracker::set(const std::string& cls) {
    if (cls == current_) return;
    current_ = cls;
    if (cb_) cb_(cls);
}

// the Linux-only loops are not used here
void Tracker::x11Loop() {}
void Tracker::gnomeLoop() {}
void Tracker::swayLoop() {}

}  // namespace apps
