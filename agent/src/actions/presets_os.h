// The preset catalogue (tables.gen.h) is written with GNOME's shortcuts. On Windows and macOS
// the same presets are kept, by the same names, so a configuration moves between computers,
// but the keys they press are the ones that system uses. Each entry replaces the fields given.
#pragma once
#include "nlohmann/json.hpp"

namespace actions {

#if defined(_WIN32)
inline const char* kOsPresetsJson = R"json({
  "overview":        {"label": "Task view", "keys": ["KEY_LEFTMETA", "KEY_TAB"]},
  "workspace_next":  {"label": "Next desktop", "keys": ["KEY_LEFTCTRL", "KEY_LEFTMETA", "KEY_RIGHT"]},
  "workspace_prev":  {"label": "Previous desktop", "keys": ["KEY_LEFTCTRL", "KEY_LEFTMETA", "KEY_LEFT"]},
  "redo":            {"keys": ["KEY_LEFTCTRL", "KEY_Y"]},
  "screenshot_area": {"keys": ["KEY_LEFTMETA", "KEY_LEFTSHIFT", "KEY_S"]},
  "lock":            {"type": "command", "cmd": "rundll32.exe user32.dll,LockWorkStation", "keys": null},
  "emoji":           {"label": "Emoji (Windows panel)", "keys": ["KEY_LEFTMETA", "KEY_DOT"]},
  "terminal":        {"type": "command", "cmd": "where wt >nul 2>&1 && start \"\" wt || start \"\" cmd", "keys": null},
  "minimize":        {"keys": ["KEY_LEFTMETA", "KEY_DOWN"]},
  "workspaces_wheel": {"label": "Switch desktops",
                      "plus": {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_LEFTMETA", "KEY_RIGHT"]},
                      "minus": {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_LEFTMETA", "KEY_LEFT"]}},
  "gesture_navigation": {
    "click": {"type": "keystroke", "keys": ["KEY_LEFTMETA", "KEY_TAB"]},
    "up":    {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_LEFTMETA", "KEY_LEFT"]},
    "down":  {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_LEFTMETA", "KEY_RIGHT"]}},
  "gesture_windows": {
    "click": {"type": "keystroke", "keys": ["KEY_LEFTMETA", "KEY_TAB"]},
    "down":  {"type": "keystroke", "keys": ["KEY_LEFTMETA", "KEY_DOWN"]}}
})json";
#elif defined(__APPLE__)
inline const char* kOsPresetsJson = R"json({
  "overview":        {"label": "Mission Control", "keys": ["KEY_LEFTCTRL", "KEY_UP"]},
  "show_desktop":    {"keys": ["KEY_LEFTMETA", "KEY_F3"]},
  "app_switcher":    {"keys": ["KEY_LEFTMETA", "KEY_TAB"]},
  "workspace_next":  {"label": "Next space", "keys": ["KEY_LEFTCTRL", "KEY_RIGHT"]},
  "workspace_prev":  {"label": "Previous space", "keys": ["KEY_LEFTCTRL", "KEY_LEFT"]},
  "copy":            {"keys": ["KEY_LEFTMETA", "KEY_C"]},
  "paste":           {"keys": ["KEY_LEFTMETA", "KEY_V"]},
  "undo":            {"keys": ["KEY_LEFTMETA", "KEY_Z"]},
  "redo":            {"keys": ["KEY_LEFTMETA", "KEY_LEFTSHIFT", "KEY_Z"]},
  "zoom_in":         {"keys": ["KEY_LEFTMETA", "KEY_EQUAL"]},
  "zoom_out":        {"keys": ["KEY_LEFTMETA", "KEY_MINUS"]},
  "screenshot":      {"keys": ["KEY_LEFTMETA", "KEY_LEFTSHIFT", "KEY_3"]},
  "screenshot_area": {"keys": ["KEY_LEFTMETA", "KEY_LEFTSHIFT", "KEY_4"]},
  "lock":            {"keys": ["KEY_LEFTCTRL", "KEY_LEFTMETA", "KEY_Q"]},
  "calculator":      {"type": "command", "cmd": "open -a Calculator", "keys": null},
  "emoji":           {"label": "Emoji (Character Viewer)", "keys": ["KEY_LEFTCTRL", "KEY_LEFTMETA", "KEY_SPACE"]},
  "context_menu":    {"type": "button", "button": "BTN_RIGHT", "keys": null},
  "terminal":        {"type": "command", "cmd": "open -a Terminal", "keys": null},
  "close_window":    {"keys": ["KEY_LEFTMETA", "KEY_W"]},
  "maximize":        {"label": "Full screen", "keys": ["KEY_LEFTCTRL", "KEY_LEFTMETA", "KEY_F"]},
  "minimize":        {"keys": ["KEY_LEFTMETA", "KEY_M"]},
  "tile_left":       {"keys": ["KEY_FN", "KEY_LEFTCTRL", "KEY_LEFT"]},
  "tile_right":      {"keys": ["KEY_FN", "KEY_LEFTCTRL", "KEY_RIGHT"]},
  "zoom_wheel":      {"label": "Zoom (Cmd + scroll)", "modifiers": ["KEY_LEFTMETA"]},
  "workspaces_wheel": {"label": "Switch spaces",
                      "plus": {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_RIGHT"]},
                      "minus": {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_LEFT"]}},
  "gesture_navigation": {
    "click": {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_UP"]},
    "up":    {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_UP"]},
    "down":  {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_DOWN"]},
    "left":  {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_LEFT"]},
    "right": {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_RIGHT"]}},
  "gesture_windows": {
    "click": {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_UP"]},
    "up":    {"type": "keystroke", "keys": ["KEY_LEFTCTRL", "KEY_LEFTMETA", "KEY_F"]},
    "down":  {"type": "keystroke", "keys": ["KEY_LEFTMETA", "KEY_M"]},
    "left":  {"type": "keystroke", "keys": ["KEY_FN", "KEY_LEFTCTRL", "KEY_LEFT"]},
    "right": {"type": "keystroke", "keys": ["KEY_FN", "KEY_LEFTCTRL", "KEY_RIGHT"]}}
})json";
#else
inline const char* kOsPresetsJson = "{}";
#endif

// Overlay the OS's entries onto the catalogue: a field set to null is removed.
inline void applyOsPresets(nlohmann::json& catalogue) {
    nlohmann::json os = nlohmann::json::parse(kOsPresetsJson);
    nlohmann::json& all = catalogue["all"];
    for (auto& [name, patch] : os.items()) {
        if (!all.contains(name)) continue;
        for (auto& [field, value] : patch.items()) {
            if (value.is_null()) all[name].erase(field);
            else all[name][field] = value;
        }
    }
}

}  // namespace actions
