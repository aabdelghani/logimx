#include "recorder.h"

#include <X11/Xlib.h>
#include <unistd.h>

#include <algorithm>
#include <cstring>
#include <map>

#include "../actions/keycodes.gen.h"

namespace apps {

namespace {

// X11 keycodes are the evdev codes offset by 8 on Linux, so the name table the injector
// already carries is enough; no keysym translation is involved.
const std::map<uint16_t, std::string>& codeNames() {
    static const std::map<uint16_t, std::string> m = [] {
        std::map<uint16_t, std::string> out;
        for (auto& [name, code] : kKeyCodes)
            if (!out.count(code)) out.emplace(code, std::string(name));
        return out;
    }();
    return m;
}

bool isModifier(const std::string& k) {
    static const char* mods[] = {"KEY_LEFTCTRL", "KEY_RIGHTCTRL", "KEY_LEFTSHIFT", "KEY_RIGHTSHIFT",
                                 "KEY_LEFTALT",  "KEY_RIGHTALT",  "KEY_LEFTMETA",  "KEY_RIGHTMETA"};
    for (const char* m : mods)
        if (k == m) return true;
    return false;
}

}  // namespace

Recorder::~Recorder() {
    cancel();
    if (thread_.joinable()) thread_.join();
}

bool Recorder::start(Update onUpdate, Done onDone) {
    cancel();
    if (thread_.joinable()) thread_.join();
    if (!getenv("DISPLAY")) return false;
    Display* probe = XOpenDisplay(nullptr);
    if (!probe) return false;
    XCloseDisplay(probe);
    stop_.store(false);
    active_.store(true);
    thread_ = std::thread([this, onUpdate, onDone] { loop(onUpdate, onDone); });
    return true;
}

void Recorder::cancel() { stop_.store(true); }

void Recorder::loop(Update onUpdate, Done onDone) {
    Display* dpy = XOpenDisplay(nullptr);
    if (!dpy) { active_.store(false); onDone({}); return; }
    Window root = DefaultRootWindow(dpy);
    // GrabModeAsync on both so the rest of the session keeps running while we hold the keyboard
    if (XGrabKeyboard(dpy, root, True, GrabModeAsync, GrabModeAsync, CurrentTime) != GrabSuccess) {
        XCloseDisplay(dpy);
        active_.store(false);
        onDone({});
        return;
    }
    std::vector<std::string> mods;
    std::string key;
    int held = 0;
    bool cancelled = false, finished = false;
    // Never hold the keyboard indefinitely: if the caller walks away, give it back rather than
    // leaving the session unable to type.
    const int kIdleGiveUpMs = 15000, kTickMs = 15;
    int idleMs = 0;
    while (!stop_.load() && !finished) {
        bool sawEvent = XPending(dpy) > 0;
        while (XPending(dpy)) {
            XEvent e;
            XNextEvent(dpy, &e);
            if (e.type != KeyPress && e.type != KeyRelease) continue;
            auto it = codeNames().find(static_cast<uint16_t>(e.xkey.keycode - 8));
            if (it == codeNames().end()) continue;
            const std::string& name = it->second;
            if (e.type == KeyPress) {
                if (name == "KEY_ESC" && mods.empty() && key.empty()) { cancelled = true; finished = true; break; }
                ++held;
                if (isModifier(name)) {
                    if (std::find(mods.begin(), mods.end(), name) == mods.end()) mods.push_back(name);
                } else {
                    key = name;
                }
                std::vector<std::string> chord = mods;
                if (!key.empty()) chord.push_back(key);
                onUpdate(chord);
            } else {
                if (held > 0) --held;
                // finished once the non-modifier key is out, or everything has been let go
                if (!key.empty() || held == 0) finished = true;
            }
        }
        if (finished) break;
        idleMs = sawEvent ? 0 : idleMs + kTickMs;
        if (idleMs >= kIdleGiveUpMs) { cancelled = true; break; }
        usleep(kTickMs * 1000);
    }
    XUngrabKeyboard(dpy, CurrentTime);
    XFlush(dpy);
    XCloseDisplay(dpy);
    active_.store(false);
    std::vector<std::string> chord;
    if (!cancelled) {
        chord = mods;
        if (!key.empty()) chord.push_back(key);
    }
    onDone(chord);
}

}  // namespace apps
