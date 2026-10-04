// Quartz event backend (macOS). Posting events needs the Accessibility permission for LogiMX
// (System Settings > Privacy & Security > Accessibility); the UI walks the person through it.
#import <AppKit/AppKit.h>
#include <ApplicationServices/ApplicationServices.h>

#include <chrono>
#include <thread>

#include "../platform/platform.h"
#include "injector.h"
#include "keymap_mac.h"

namespace actions {

namespace {

std::string upper(const std::string& s) {
    std::string n = s;
    for (auto& c : n) c = static_cast<char>(toupper(static_cast<unsigned char>(c)));
    if (n.rfind("KEY_", 0) != 0 && n.rfind("BTN_", 0) != 0) n = "KEY_" + n;
    return n;
}

uint64_t modifierFlag(const std::string& n) {
    if (n == "KEY_LEFTSHIFT" || n == "KEY_RIGHTSHIFT") return kCGEventFlagMaskShift;
    if (n == "KEY_LEFTCTRL" || n == "KEY_RIGHTCTRL") return kCGEventFlagMaskControl;
    if (n == "KEY_LEFTALT" || n == "KEY_RIGHTALT") return kCGEventFlagMaskAlternate;
    if (n == "KEY_LEFTMETA" || n == "KEY_RIGHTMETA") return kCGEventFlagMaskCommand;
    if (n == "KEY_FN") return kCGEventFlagMaskSecondaryFn;
    return 0;
}

CGPoint pointer() {
    CGEventRef e = CGEventCreate(nullptr);
    CGPoint p = CGEventGetLocation(e);
    CFRelease(e);
    return p;
}

// mouse buttons by their Linux names: (button number, down type, up type)
bool mouseButton(const std::string& n, CGMouseButton& b, CGEventType& down, CGEventType& up) {
    if (n == "BTN_LEFT") { b = kCGMouseButtonLeft; down = kCGEventLeftMouseDown; up = kCGEventLeftMouseUp; return true; }
    if (n == "BTN_RIGHT") { b = kCGMouseButtonRight; down = kCGEventRightMouseDown; up = kCGEventRightMouseUp; return true; }
    down = kCGEventOtherMouseDown;
    up = kCGEventOtherMouseUp;
    if (n == "BTN_MIDDLE") { b = kCGMouseButtonCenter; return true; }
    if (n == "BTN_SIDE" || n == "BTN_BACK") { b = static_cast<CGMouseButton>(3); return true; }
    if (n == "BTN_EXTRA" || n == "BTN_FORWARD") { b = static_cast<CGMouseButton>(4); return true; }
    return false;
}

void postMouse(CGMouseButton b, CGEventType type, int clickState) {
    CGEventRef e = CGEventCreateMouseEvent(nullptr, type, pointer(), b);
    if (!e) return;
    CGEventSetIntegerValueField(e, kCGMouseEventClickState, clickState);
    CGEventPost(kCGHIDEventTap, e);
    CFRelease(e);
}

void postMedia(int type, bool down) {
    @autoreleasepool {
        NSEvent* ev = [NSEvent otherEventWithType:NSEventTypeSystemDefined
                                         location:NSZeroPoint
                                    modifierFlags:(down ? 0xa00 : 0xb00)
                                        timestamp:0
                                     windowNumber:0
                                          context:nil
                                          subtype:8
                                            data1:((type << 16) | ((down ? 0xa : 0xb) << 8))
                                            data2:-1];
        CGEventPost(kCGHIDEventTap, [ev CGEvent]);
    }
}

}  // namespace

Injector::Injector() {}

Injector::~Injector() { releaseAll(); }

void Injector::press(const std::vector<std::string>& keys) {
    std::lock_guard<std::mutex> lk(m_);
    for (auto& k : keys) {
        std::string n = upper(k);
        int c = code(n);
        if (c < 0) continue;
        CGMouseButton b; CGEventType down, up;
        if (mouseButton(n, b, down, up)) { postMouse(b, down, 1); held_.insert(c); continue; }
        if (n == "KEY_MICMUTE") { platform::micToggle(); continue; }
        int media = macMediaKey(n);
        if (media >= 0) { postMedia(media, true); held_.insert(c); continue; }
        const MacKey* mk = macKey(n);
        if (!mk) continue;
        flags_ |= modifierFlag(n);
        CGEventRef e = CGEventCreateKeyboardEvent(nullptr, static_cast<CGKeyCode>(mk->code), true);
        CGEventSetFlags(e, static_cast<CGEventFlags>(flags_));
        CGEventPost(kCGHIDEventTap, e);
        CFRelease(e);
        held_.insert(c);
    }
}

void Injector::release(const std::vector<std::string>& keys) {
    std::lock_guard<std::mutex> lk(m_);
    for (auto it = keys.rbegin(); it != keys.rend(); ++it) {
        std::string n = upper(*it);
        int c = code(n);
        if (c < 0 || !held_.count(c)) continue;
        held_.erase(c);
        CGMouseButton b; CGEventType down, up;
        if (mouseButton(n, b, down, up)) { postMouse(b, up, 1); continue; }
        int media = macMediaKey(n);
        if (media >= 0) { postMedia(media, false); continue; }
        const MacKey* mk = macKey(n);
        if (!mk) continue;
        flags_ &= ~modifierFlag(n);
        CGEventRef e = CGEventCreateKeyboardEvent(nullptr, static_cast<CGKeyCode>(mk->code), false);
        CGEventSetFlags(e, static_cast<CGEventFlags>(flags_));
        CGEventPost(kCGHIDEventTap, e);
        CFRelease(e);
    }
}

void Injector::releaseAll() {
    std::vector<std::string> names;
    {
        std::lock_guard<std::mutex> lk(m_);
        for (int c : held_) {
            for (auto& k : kMacKeys) if (code(std::string(k.name)) == c) { names.push_back(std::string(k.name)); break; }
            for (auto& k : kMacMediaKeys) if (code(std::string(k.name)) == c) { names.push_back(std::string(k.name)); break; }
            for (const char* b : {"BTN_LEFT", "BTN_RIGHT", "BTN_MIDDLE", "BTN_SIDE", "BTN_EXTRA"}) if (code(b) == c) { names.push_back(b); break; }
        }
    }
    release(names);
    std::lock_guard<std::mutex> lk(m_);
    held_.clear();
    flags_ = 0;
}

// hires units are 1/120 of a detent: whole detents go out as lines, the rest as pixels
void Injector::scroll(int dy, int dx, bool hires) {
    std::lock_guard<std::mutex> lk(m_);
    int k = hires ? 1 : 120;
    dy *= k;
    dx *= k;
    bool lines = dy % 120 == 0 && dx % 120 == 0;
    int32_t wy = lines ? dy / 120 : dy / 10, wx = lines ? dx / 120 : dx / 10;
    if (!wy && !wx) { wy = dy > 0 ? 1 : dy < 0 ? -1 : 0; wx = dx > 0 ? 1 : dx < 0 ? -1 : 0; }
    CGEventRef e = CGEventCreateScrollWheelEvent2(nullptr, lines ? kCGScrollEventUnitLine : kCGScrollEventUnitPixel, 2, wy, wx, 0);
    if (!e) return;
    CGEventSetFlags(e, static_cast<CGEventFlags>(flags_));
    CGEventPost(kCGHIDEventTap, e);
    CFRelease(e);
}

void Injector::click(const std::string& button, int count) {
    CGMouseButton b; CGEventType down, up;
    if (!mouseButton(upper(button), b, down, up)) return;
    for (int i = 0; i < count; ++i) {
        {
            std::lock_guard<std::mutex> lk(m_);
            postMouse(b, down, i + 1);
            postMouse(b, up, i + 1);
        }
        if (count > 1) std::this_thread::sleep_for(std::chrono::milliseconds(40));
    }
}

// Typed as Unicode characters, so the text comes out right whatever the keyboard layout is.
void Injector::typeText(const std::string& text) {
    @autoreleasepool {
        NSString* s = [NSString stringWithUTF8String:text.c_str()];
        if (!s) return;
        for (NSUInteger i = 0; i < s.length; ++i) {
            UniChar ch = [s characterAtIndex:i];
            if (ch == '\r') continue;
            for (bool down : {true, false}) {
                CGEventRef e = CGEventCreateKeyboardEvent(nullptr, ch == '\n' ? kVK_Return : 0, down);
                if (ch != '\n') CGEventKeyboardSetUnicodeString(e, 1, &ch);
                CGEventPost(kCGHIDEventTap, e);
                CFRelease(e);
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(4));
        }
    }
}

}  // namespace actions
