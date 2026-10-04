// Linux input key names -> Windows virtual-key codes, and whether the key is an extended one
// (sent with KEYEVENTF_EXTENDEDKEY so arrows, the right-hand modifiers and the navigation
// block reach applications as themselves rather than their numeric-keypad twins).
#pragma once
#ifdef _WIN32
#include <windows.h>

#include <string_view>

namespace actions {

struct WinKey { std::string_view name; WORD vk; bool extended; };

inline constexpr WinKey kWinKeys[] = {
    {"KEY_ESC", VK_ESCAPE, false},
    {"KEY_1", '1', false}, {"KEY_2", '2', false}, {"KEY_3", '3', false}, {"KEY_4", '4', false}, {"KEY_5", '5', false},
    {"KEY_6", '6', false}, {"KEY_7", '7', false}, {"KEY_8", '8', false}, {"KEY_9", '9', false}, {"KEY_0", '0', false},
    {"KEY_MINUS", VK_OEM_MINUS, false}, {"KEY_EQUAL", VK_OEM_PLUS, false}, {"KEY_BACKSPACE", VK_BACK, false}, {"KEY_TAB", VK_TAB, false},
    {"KEY_Q", 'Q', false}, {"KEY_W", 'W', false}, {"KEY_E", 'E', false}, {"KEY_R", 'R', false}, {"KEY_T", 'T', false},
    {"KEY_Y", 'Y', false}, {"KEY_U", 'U', false}, {"KEY_I", 'I', false}, {"KEY_O", 'O', false}, {"KEY_P", 'P', false},
    {"KEY_LEFTBRACE", VK_OEM_4, false}, {"KEY_RIGHTBRACE", VK_OEM_6, false}, {"KEY_ENTER", VK_RETURN, false},
    {"KEY_LEFTCTRL", VK_LCONTROL, false},
    {"KEY_A", 'A', false}, {"KEY_S", 'S', false}, {"KEY_D", 'D', false}, {"KEY_F", 'F', false}, {"KEY_G", 'G', false},
    {"KEY_H", 'H', false}, {"KEY_J", 'J', false}, {"KEY_K", 'K', false}, {"KEY_L", 'L', false},
    {"KEY_SEMICOLON", VK_OEM_1, false}, {"KEY_APOSTROPHE", VK_OEM_7, false}, {"KEY_GRAVE", VK_OEM_3, false},
    {"KEY_LEFTSHIFT", VK_LSHIFT, false}, {"KEY_BACKSLASH", VK_OEM_5, false},
    {"KEY_Z", 'Z', false}, {"KEY_X", 'X', false}, {"KEY_C", 'C', false}, {"KEY_V", 'V', false}, {"KEY_B", 'B', false},
    {"KEY_N", 'N', false}, {"KEY_M", 'M', false},
    {"KEY_COMMA", VK_OEM_COMMA, false}, {"KEY_DOT", VK_OEM_PERIOD, false}, {"KEY_SLASH", VK_OEM_2, false},
    {"KEY_RIGHTSHIFT", VK_RSHIFT, false}, {"KEY_KPASTERISK", VK_MULTIPLY, false}, {"KEY_LEFTALT", VK_LMENU, false},
    {"KEY_SPACE", VK_SPACE, false}, {"KEY_CAPSLOCK", VK_CAPITAL, false},
    {"KEY_F1", VK_F1, false}, {"KEY_F2", VK_F2, false}, {"KEY_F3", VK_F3, false}, {"KEY_F4", VK_F4, false},
    {"KEY_F5", VK_F5, false}, {"KEY_F6", VK_F6, false}, {"KEY_F7", VK_F7, false}, {"KEY_F8", VK_F8, false},
    {"KEY_F9", VK_F9, false}, {"KEY_F10", VK_F10, false}, {"KEY_F11", VK_F11, false}, {"KEY_F12", VK_F12, false},
    {"KEY_F13", VK_F13, false}, {"KEY_F14", VK_F14, false}, {"KEY_F15", VK_F15, false}, {"KEY_F16", VK_F16, false},
    {"KEY_F17", VK_F17, false}, {"KEY_F18", VK_F18, false}, {"KEY_F19", VK_F19, false}, {"KEY_F20", VK_F20, false},
    {"KEY_F21", VK_F21, false}, {"KEY_F22", VK_F22, false}, {"KEY_F23", VK_F23, false}, {"KEY_F24", VK_F24, false},
    {"KEY_NUMLOCK", VK_NUMLOCK, true}, {"KEY_SCROLLLOCK", VK_SCROLL, false},
    {"KEY_KP7", VK_NUMPAD7, false}, {"KEY_KP8", VK_NUMPAD8, false}, {"KEY_KP9", VK_NUMPAD9, false}, {"KEY_KPMINUS", VK_SUBTRACT, false},
    {"KEY_KP4", VK_NUMPAD4, false}, {"KEY_KP5", VK_NUMPAD5, false}, {"KEY_KP6", VK_NUMPAD6, false}, {"KEY_KPPLUS", VK_ADD, false},
    {"KEY_KP1", VK_NUMPAD1, false}, {"KEY_KP2", VK_NUMPAD2, false}, {"KEY_KP3", VK_NUMPAD3, false}, {"KEY_KP0", VK_NUMPAD0, false},
    {"KEY_KPDOT", VK_DECIMAL, false}, {"KEY_KPENTER", VK_RETURN, true}, {"KEY_KPSLASH", VK_DIVIDE, true},
    {"KEY_102ND", VK_OEM_102, false},
    {"KEY_RIGHTCTRL", VK_RCONTROL, true}, {"KEY_SYSRQ", VK_SNAPSHOT, true}, {"KEY_PRINT", VK_SNAPSHOT, true}, {"KEY_RIGHTALT", VK_RMENU, true},
    {"KEY_HOME", VK_HOME, true}, {"KEY_UP", VK_UP, true}, {"KEY_PAGEUP", VK_PRIOR, true}, {"KEY_LEFT", VK_LEFT, true},
    {"KEY_RIGHT", VK_RIGHT, true}, {"KEY_END", VK_END, true}, {"KEY_DOWN", VK_DOWN, true}, {"KEY_PAGEDOWN", VK_NEXT, true},
    {"KEY_INSERT", VK_INSERT, true}, {"KEY_DELETE", VK_DELETE, true}, {"KEY_PAUSE", VK_PAUSE, false},
    {"KEY_LEFTMETA", VK_LWIN, true}, {"KEY_RIGHTMETA", VK_RWIN, true}, {"KEY_COMPOSE", VK_APPS, true},
    {"KEY_MUTE", VK_VOLUME_MUTE, true}, {"KEY_VOLUMEDOWN", VK_VOLUME_DOWN, true}, {"KEY_VOLUMEUP", VK_VOLUME_UP, true},
    {"KEY_NEXTSONG", VK_MEDIA_NEXT_TRACK, true}, {"KEY_PREVIOUSSONG", VK_MEDIA_PREV_TRACK, true},
    {"KEY_PLAYPAUSE", VK_MEDIA_PLAY_PAUSE, true}, {"KEY_STOPCD", VK_MEDIA_STOP, true},
    {"KEY_CALC", VK_LAUNCH_APP2, true}, {"KEY_MAIL", VK_LAUNCH_MAIL, true}, {"KEY_COMPUTER", VK_LAUNCH_APP1, true},
    {"KEY_MEDIA", VK_LAUNCH_MEDIA_SELECT, true}, {"KEY_SLEEP", VK_SLEEP, false},
    {"KEY_BACK", VK_BROWSER_BACK, true}, {"KEY_FORWARD", VK_BROWSER_FORWARD, true}, {"KEY_REFRESH", VK_BROWSER_REFRESH, true},
    {"KEY_SEARCH", VK_BROWSER_SEARCH, true}, {"KEY_BOOKMARKS", VK_BROWSER_FAVORITES, true}, {"KEY_HOMEPAGE", VK_BROWSER_HOME, true},
    {"KEY_WWW", VK_BROWSER_HOME, true}, {"KEY_STOP", VK_BROWSER_STOP, true}, {"KEY_HELP", VK_HELP, false},
};

inline const WinKey* winKey(std::string_view name) {
    for (auto& k : kWinKeys)
        if (k.name == name) return &k;
    return nullptr;
}

}  // namespace actions
#endif
