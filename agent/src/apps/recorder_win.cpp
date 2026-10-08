// Records a key chord on Windows with a low-level keyboard hook. The hook sees Alt+Tab, the
// Windows key and the like before the shell does, and swallows them while recording so they
// do not act. (Ctrl+Alt+Del and Win+L stay with the system, as they must.)
#include <windows.h>

#include <algorithm>
#include <chrono>
#include <set>

#include "../actions/keymap_win.h"
#include "recorder.h"

namespace apps {

namespace {

struct Session {
    Recorder::Update onUpdate;
    std::vector<std::string> mods;
    std::string key;
    std::set<DWORD> down;   // keys physically down (autorepeat sends more downs)
    bool finished = false, cancelled = false, sawEvent = false;
};
Session* gSession = nullptr;

std::string nameFor(const KBDLLHOOKSTRUCT* k) {
    bool ext = (k->flags & LLKHF_EXTENDED) != 0;
    if (k->vkCode == VK_RETURN) return ext ? "KEY_KPENTER" : "KEY_ENTER";
    for (auto& w : actions::kWinKeys)
        if (w.vk == k->vkCode) return std::string(w.name);
    return "";
}

bool isModifier(const std::string& k) {
    static const char* mods[] = {"KEY_LEFTCTRL", "KEY_RIGHTCTRL", "KEY_LEFTSHIFT", "KEY_RIGHTSHIFT",
                                 "KEY_LEFTALT",  "KEY_RIGHTALT",  "KEY_LEFTMETA",  "KEY_RIGHTMETA"};
    for (const char* m : mods)
        if (k == m) return true;
    return false;
}

LRESULT CALLBACK hook(int code, WPARAM wp, LPARAM lp) {
    if (code != HC_ACTION || !gSession || gSession->finished) return CallNextHookEx(nullptr, code, wp, lp);
    auto* k = reinterpret_cast<KBDLLHOOKSTRUCT*>(lp);
    if (k->flags & LLKHF_INJECTED) return CallNextHookEx(nullptr, code, wp, lp);   // our own SendInput
    Session& s = *gSession;
    s.sawEvent = true;
    bool press = wp == WM_KEYDOWN || wp == WM_SYSKEYDOWN;
    std::string name = nameFor(k);
    if (press) {
        if (s.down.count(k->vkCode)) return 1;   // autorepeat
        s.down.insert(k->vkCode);
        if (name.empty()) return 1;
        if (name == "KEY_ESC" && s.mods.empty() && s.key.empty()) { s.cancelled = s.finished = true; return 1; }
        if (isModifier(name)) {
            if (std::find(s.mods.begin(), s.mods.end(), name) == s.mods.end()) s.mods.push_back(name);
        } else {
            s.key = name;
        }
        std::vector<std::string> chord = s.mods;
        if (!s.key.empty()) chord.push_back(s.key);
        s.onUpdate(chord);
    } else {
        s.down.erase(k->vkCode);
        // finished once the non-modifier key is out, or everything has been let go
        if (!s.key.empty() || s.down.empty()) s.finished = true;
    }
    return 1;   // swallowed: the chord is being recorded, not used
}

}  // namespace

Recorder::~Recorder() {
    cancel();
    if (thread_.joinable()) thread_.join();
}

bool Recorder::start(const Update& onUpdate, const Done& onDone) {
    cancel();
    if (thread_.joinable()) thread_.join();
    stop_.store(false);
    active_.store(true);
    thread_ = std::thread([this, onUpdate, onDone] { loop(onUpdate, onDone); });
    return true;
}

void Recorder::cancel() { stop_.store(true); }

void Recorder::loop(const Update& onUpdate, const Done& onDone) {
    Session s;
    s.onUpdate = onUpdate;
    gSession = &s;
    HHOOK h = SetWindowsHookExW(WH_KEYBOARD_LL, hook, GetModuleHandleW(nullptr), 0);
    if (!h) { gSession = nullptr; active_.store(false); onDone({}, false); return; }
    // never hold the keyboard indefinitely: give it back after a quiet spell
    const int kIdleGiveUpMs = 15000, kTickMs = 15;
    int idleMs = 0;
    bool timedOut = false;
    while (!stop_.load() && !s.finished) {
        // the hook runs inside this thread's message processing, so keep pumping
        MsgWaitForMultipleObjects(0, nullptr, FALSE, kTickMs, QS_ALLINPUT);
        MSG m;
        while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); }
        idleMs = s.sawEvent ? 0 : idleMs + kTickMs;
        s.sawEvent = false;
        if (idleMs >= kIdleGiveUpMs) {
            timedOut = !s.mods.empty() || !s.key.empty();
            s.cancelled = !timedOut;
            break;
        }
    }
    UnhookWindowsHookEx(h);
    gSession = nullptr;
    active_.store(false);
    std::vector<std::string> chord;
    if (!s.cancelled && (s.finished || timedOut)) {
        chord = s.mods;
        if (!s.key.empty()) chord.push_back(s.key);
    }
    onDone(chord, timedOut);
}

}  // namespace apps
