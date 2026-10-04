// Records a key chord on macOS with a Quartz event tap at the head of the session's event
// stream, which sees Cmd+Tab and the like before the system acts on them and swallows them
// while recording. Needs the Accessibility permission, like the injector.
#include <ApplicationServices/ApplicationServices.h>

#include <algorithm>
#include <chrono>
#include <set>

#include "../actions/keymap_mac.h"
#include "recorder.h"

namespace apps {

namespace {

struct Session {
    Recorder::Update onUpdate;
    std::vector<std::string> mods;
    std::string key;
    std::set<int> down;
    bool finished = false, cancelled = false, sawEvent = false;
    CFMachPortRef tap = nullptr;
};

std::string nameFor(int code) {
    for (auto& k : actions::kMacKeys)
        if (k.code == code) return std::string(k.name);
    return "";
}

bool isModifier(const std::string& k) {
    static const char* mods[] = {"KEY_LEFTCTRL", "KEY_RIGHTCTRL", "KEY_LEFTSHIFT", "KEY_RIGHTSHIFT",
                                 "KEY_LEFTALT",  "KEY_RIGHTALT",  "KEY_LEFTMETA",  "KEY_RIGHTMETA"};
    for (const char* m : mods)
        if (k == m) return true;
    return false;
}

// device-dependent modifier bits (IOKit NX_DEVICE*KEYMASK): which side is down
bool modifierDown(int code, CGEventFlags f) {
    switch (code) {
        case kVK_Control: return f & 0x00000001;
        case kVK_Shift: return f & 0x00000002;
        case kVK_RightShift: return f & 0x00000004;
        case kVK_Command: return f & 0x00000008;
        case kVK_RightCommand: return f & 0x00000010;
        case kVK_Option: return f & 0x00000020;
        case kVK_RightOption: return f & 0x00000040;
        case kVK_RightControl: return f & 0x00002000;
        default: return false;
    }
}

CGEventRef onEvent(CGEventTapProxy, CGEventType type, CGEventRef ev, void* ctx) {
    Session& s = *static_cast<Session*>(ctx);
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (s.tap) CGEventTapEnable(s.tap, true);
        return ev;
    }
    if (s.finished) return ev;
    s.sawEvent = true;
    int code = static_cast<int>(CGEventGetIntegerValueField(ev, kCGKeyboardEventKeycode));
    bool press;
    if (type == kCGEventFlagsChanged) press = modifierDown(code, CGEventGetFlags(ev));
    else if (type == kCGEventKeyDown) press = true;
    else press = false;
    std::string name = nameFor(code);
    if (press) {
        if (s.down.count(code)) return nullptr;   // autorepeat
        s.down.insert(code);
        if (name.empty()) return nullptr;
        if (name == "KEY_ESC" && s.mods.empty() && s.key.empty()) { s.cancelled = s.finished = true; return nullptr; }
        if (isModifier(name)) {
            if (std::find(s.mods.begin(), s.mods.end(), name) == s.mods.end()) s.mods.push_back(name);
        } else {
            s.key = name;
        }
        std::vector<std::string> chord = s.mods;
        if (!s.key.empty()) chord.push_back(s.key);
        s.onUpdate(chord);
    } else {
        s.down.erase(code);
        if (!s.key.empty() || s.down.empty()) s.finished = true;
    }
    return nullptr;   // swallowed: the chord is being recorded, not used
}

}  // namespace

Recorder::~Recorder() {
    cancel();
    if (thread_.joinable()) thread_.join();
}

bool Recorder::start(Update onUpdate, Done onDone) {
    cancel();
    if (thread_.joinable()) thread_.join();
    if (!AXIsProcessTrusted()) return false;   // no Accessibility permission: the tap would be refused
    stop_.store(false);
    active_.store(true);
    thread_ = std::thread([this, onUpdate, onDone] { loop(onUpdate, onDone); });
    return true;
}

void Recorder::cancel() { stop_.store(true); }

void Recorder::loop(Update onUpdate, Done onDone) {
    Session s;
    s.onUpdate = onUpdate;
    CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp) | CGEventMaskBit(kCGEventFlagsChanged);
    s.tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault, mask, onEvent, &s);
    if (!s.tap) { active_.store(false); onDone({}, false); return; }
    CFRunLoopSourceRef src = CFMachPortCreateRunLoopSource(nullptr, s.tap, 0);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), src, kCFRunLoopCommonModes);
    CGEventTapEnable(s.tap, true);
    const int kIdleGiveUpMs = 15000, kTickMs = 15;
    int idleMs = 0;
    bool timedOut = false;
    while (!stop_.load() && !s.finished) {
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, kTickMs / 1000.0, false);
        idleMs = s.sawEvent ? 0 : idleMs + kTickMs;
        s.sawEvent = false;
        if (idleMs >= kIdleGiveUpMs) {
            timedOut = !s.mods.empty() || !s.key.empty();
            s.cancelled = !timedOut;
            break;
        }
    }
    CGEventTapEnable(s.tap, false);
    CFRunLoopRemoveSource(CFRunLoopGetCurrent(), src, kCFRunLoopCommonModes);
    CFRelease(src);
    CFRelease(s.tap);
    active_.store(false);
    std::vector<std::string> chord;
    if (!s.cancelled && (s.finished || timedOut)) {
        chord = s.mods;
        if (!s.key.empty()) chord.push_back(s.key);
    }
    onDone(chord, timedOut);
}

}  // namespace apps
