// Linux input key names -> macOS virtual key codes (kVK_*), and the media keys macOS handles
// as system-defined events rather than key codes (NX_KEYTYPE_*).
#pragma once
#ifdef __APPLE__
#include <Carbon/Carbon.h>

#include <string_view>

namespace actions {

struct MacKey { std::string_view name; int code; };

inline constexpr MacKey kMacKeys[] = {
    {"KEY_A", kVK_ANSI_A}, {"KEY_B", kVK_ANSI_B}, {"KEY_C", kVK_ANSI_C}, {"KEY_D", kVK_ANSI_D}, {"KEY_E", kVK_ANSI_E},
    {"KEY_F", kVK_ANSI_F}, {"KEY_G", kVK_ANSI_G}, {"KEY_H", kVK_ANSI_H}, {"KEY_I", kVK_ANSI_I}, {"KEY_J", kVK_ANSI_J},
    {"KEY_K", kVK_ANSI_K}, {"KEY_L", kVK_ANSI_L}, {"KEY_M", kVK_ANSI_M}, {"KEY_N", kVK_ANSI_N}, {"KEY_O", kVK_ANSI_O},
    {"KEY_P", kVK_ANSI_P}, {"KEY_Q", kVK_ANSI_Q}, {"KEY_R", kVK_ANSI_R}, {"KEY_S", kVK_ANSI_S}, {"KEY_T", kVK_ANSI_T},
    {"KEY_U", kVK_ANSI_U}, {"KEY_V", kVK_ANSI_V}, {"KEY_W", kVK_ANSI_W}, {"KEY_X", kVK_ANSI_X}, {"KEY_Y", kVK_ANSI_Y},
    {"KEY_Z", kVK_ANSI_Z},
    {"KEY_1", kVK_ANSI_1}, {"KEY_2", kVK_ANSI_2}, {"KEY_3", kVK_ANSI_3}, {"KEY_4", kVK_ANSI_4}, {"KEY_5", kVK_ANSI_5},
    {"KEY_6", kVK_ANSI_6}, {"KEY_7", kVK_ANSI_7}, {"KEY_8", kVK_ANSI_8}, {"KEY_9", kVK_ANSI_9}, {"KEY_0", kVK_ANSI_0},
    {"KEY_MINUS", kVK_ANSI_Minus}, {"KEY_EQUAL", kVK_ANSI_Equal}, {"KEY_LEFTBRACE", kVK_ANSI_LeftBracket},
    {"KEY_RIGHTBRACE", kVK_ANSI_RightBracket}, {"KEY_BACKSLASH", kVK_ANSI_Backslash}, {"KEY_SEMICOLON", kVK_ANSI_Semicolon},
    {"KEY_APOSTROPHE", kVK_ANSI_Quote}, {"KEY_GRAVE", kVK_ANSI_Grave}, {"KEY_COMMA", kVK_ANSI_Comma},
    {"KEY_DOT", kVK_ANSI_Period}, {"KEY_SLASH", kVK_ANSI_Slash}, {"KEY_102ND", kVK_ISO_Section},
    {"KEY_ENTER", kVK_Return}, {"KEY_TAB", kVK_Tab}, {"KEY_SPACE", kVK_Space}, {"KEY_BACKSPACE", kVK_Delete},
    {"KEY_ESC", kVK_Escape}, {"KEY_CAPSLOCK", kVK_CapsLock}, {"KEY_DELETE", kVK_ForwardDelete}, {"KEY_INSERT", kVK_Help},
    {"KEY_HELP", kVK_Help},
    {"KEY_LEFTSHIFT", kVK_Shift}, {"KEY_RIGHTSHIFT", kVK_RightShift}, {"KEY_LEFTCTRL", kVK_Control},
    {"KEY_RIGHTCTRL", kVK_RightControl}, {"KEY_LEFTALT", kVK_Option}, {"KEY_RIGHTALT", kVK_RightOption},
    {"KEY_LEFTMETA", kVK_Command}, {"KEY_RIGHTMETA", kVK_RightCommand}, {"KEY_FN", kVK_Function},
    {"KEY_HOME", kVK_Home}, {"KEY_END", kVK_End}, {"KEY_PAGEUP", kVK_PageUp}, {"KEY_PAGEDOWN", kVK_PageDown},
    {"KEY_LEFT", kVK_LeftArrow}, {"KEY_RIGHT", kVK_RightArrow}, {"KEY_UP", kVK_UpArrow}, {"KEY_DOWN", kVK_DownArrow},
    {"KEY_F1", kVK_F1}, {"KEY_F2", kVK_F2}, {"KEY_F3", kVK_F3}, {"KEY_F4", kVK_F4}, {"KEY_F5", kVK_F5}, {"KEY_F6", kVK_F6},
    {"KEY_F7", kVK_F7}, {"KEY_F8", kVK_F8}, {"KEY_F9", kVK_F9}, {"KEY_F10", kVK_F10}, {"KEY_F11", kVK_F11}, {"KEY_F12", kVK_F12},
    {"KEY_F13", kVK_F13}, {"KEY_F14", kVK_F14}, {"KEY_F15", kVK_F15}, {"KEY_F16", kVK_F16}, {"KEY_F17", kVK_F17},
    {"KEY_F18", kVK_F18}, {"KEY_F19", kVK_F19}, {"KEY_F20", kVK_F20},
    // macOS has no Print Screen, Scroll Lock or Pause: the nearest keys a Mac keyboard sends
    {"KEY_SYSRQ", kVK_F13}, {"KEY_PRINT", kVK_F13}, {"KEY_SCROLLLOCK", kVK_F14}, {"KEY_PAUSE", kVK_F15},
    {"KEY_NUMLOCK", kVK_ANSI_KeypadClear},
    {"KEY_KP0", kVK_ANSI_Keypad0}, {"KEY_KP1", kVK_ANSI_Keypad1}, {"KEY_KP2", kVK_ANSI_Keypad2}, {"KEY_KP3", kVK_ANSI_Keypad3},
    {"KEY_KP4", kVK_ANSI_Keypad4}, {"KEY_KP5", kVK_ANSI_Keypad5}, {"KEY_KP6", kVK_ANSI_Keypad6}, {"KEY_KP7", kVK_ANSI_Keypad7},
    {"KEY_KP8", kVK_ANSI_Keypad8}, {"KEY_KP9", kVK_ANSI_Keypad9}, {"KEY_KPDOT", kVK_ANSI_KeypadDecimal},
    {"KEY_KPASTERISK", kVK_ANSI_KeypadMultiply}, {"KEY_KPPLUS", kVK_ANSI_KeypadPlus}, {"KEY_KPMINUS", kVK_ANSI_KeypadMinus},
    {"KEY_KPSLASH", kVK_ANSI_KeypadDivide}, {"KEY_KPENTER", kVK_ANSI_KeypadEnter}, {"KEY_KPEQUAL", kVK_ANSI_KeypadEquals},
};

// NX_KEYTYPE_* (IOKit/hidsystem/ev_keymap.h): posted as system-defined events
struct MacMediaKey { std::string_view name; int type; };
inline constexpr MacMediaKey kMacMediaKeys[] = {
    {"KEY_VOLUMEUP", 0}, {"KEY_VOLUMEDOWN", 1}, {"KEY_BRIGHTNESSUP", 2}, {"KEY_BRIGHTNESSDOWN", 3}, {"KEY_MUTE", 7},
    {"KEY_PLAYPAUSE", 16}, {"KEY_NEXTSONG", 17}, {"KEY_PREVIOUSSONG", 18}, {"KEY_FASTFORWARD", 19}, {"KEY_REWIND", 20},
    {"KEY_KBDILLUMUP", 21}, {"KEY_KBDILLUMDOWN", 22},
};

inline const MacKey* macKey(std::string_view name) {
    for (auto& k : kMacKeys)
        if (k.name == name) return &k;
    return nullptr;
}

inline int macMediaKey(std::string_view name) {
    for (auto& k : kMacMediaKeys)
        if (k.name == name) return k.type;
    return -1;
}

}  // namespace actions
#endif
