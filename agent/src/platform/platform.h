// Everything the agent needs from the operating system that is not HID or input injection:
// where files live, how to start things, the installed applications, the system pointer
// speed and the audio endpoint. One implementation per OS: linux.cpp, win.cpp, mac.mm.
#pragma once
#include <filesystem>
#include <functional>
#include <string>
#include <vector>

#include "nlohmann/json.hpp"

namespace platform {

using json = nlohmann::json;

// The agent's configuration directory (config.json, backups/), created on demand.
// Linux: $XDG_CONFIG_HOME/logimx. Windows: %APPDATA%/LogiMX/agent. macOS:
// ~/Library/Application Support/LogiMX/agent. Always '/' separated.
std::string configDir();
// Small state files (battery history). Linux: $XDG_STATE_HOME/logimx.
std::string stateDir();
std::string homeDir();
// This computer's name as people know it, written to the Easy-Switch host slot.
std::string hostName();
// Where the UI and logimxctl reach the agent: a Unix socket path, or a named pipe on Windows.
std::string ipcEndpoint();

// Call fn once when the agent is asked to stop (SIGTERM / SIGINT / console close).
void onStop(void (*fn)());

// Run a shell command line without waiting and without a window.
void runCommand(const std::string& cmd);
// Open a file, folder or URL with its default handler ("~" expands to the home folder).
void openTarget(const std::string& target);
// Start an application by the id listApplications() gave it.
void launchApp(const std::string& id);

// Installed applications: [{id, name, icon, wm_class, source?, url?}]. wm_class is what the
// focused-app tracker reports for that application, so profiles can match on it.
json listApplications();
// Other tools that also drive Logitech devices and get in each other's way: [{name, pid}]
json conflictingTools();
// macOS only lets a program open a keyboard (the MX Keys' HID++ channel) with Input Monitoring:
// "granted", "denied" or "unknown" (never asked). Elsewhere there is nothing to allow: "granted".
// Asking is the app's job (mac_input_monitoring.c): asked from the agent, macOS refuses silently.
std::string inputMonitoring();

// The OS pointer speed, -1 (slowest) .. 1 (fastest), 0 the system default.
void setPointerSpeed(double v, const std::string& deviceName, const std::string& nodeName);

// Default output volume 0..100 and mute, default input mute. -1 / false when not available
// (Linux leaves audio to the UI, which talks to PipeWire or PulseAudio itself).
struct Audio { int volume = -1; bool muted = false; bool micMuted = false; bool ok = false; };
Audio audioGet();
bool audioSetVolume(int percent);
// Flip the default microphone's mute (the Mute microphone key on systems with no key code
// for it). False when not available.
bool micToggle();

// UTF-8 strings <-> filesystem paths, the same on every OS (Windows paths are UTF-16 inside)
inline std::filesystem::path fsPath(const std::string& s) { return std::filesystem::path(std::u8string(s.begin(), s.end())); }
inline std::string fsString(const std::filesystem::path& p) { auto u = p.generic_u8string(); return std::string(u.begin(), u.end()); }

// Short name of this OS for status and logs: "linux", "windows", "macos".
const char* name();

}  // namespace platform
