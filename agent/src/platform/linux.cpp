// Linux: XDG paths, desktop entries, gsettings / xinput, xdg-open
#include "platform.h"
#include "steam.h"

#include <dirent.h>
#include <signal.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <set>

namespace platform {

const char* name() { return "linux"; }

std::string homeDir() {
    const char* h = getenv("HOME");
    return h ? h : "/tmp";
}

std::string hostName() {
    char hn[64] = {0};
    gethostname(hn, sizeof(hn) - 1);
    return hn;
}

// The project was called openoptions before 0.4. Carry a directory over once so an upgrade
// keeps every assignment, profile, backup and battery sample.
static void migrateFromOldName(const std::string& base, const std::string& newDir) {
    std::string oldDir = base + "/openoptions";
    struct stat st{};
    if (stat(newDir.c_str(), &st) == 0) return;          // already on the new path
    if (stat(oldDir.c_str(), &st) != 0) return;          // nothing to carry over
    std::string cmd = "cp -a '" + oldDir + "' '" + newDir + "' 2>/dev/null";
    if (std::system(cmd.c_str()) != 0) { /* best effort */ }
}

static std::string xdgDir(const char* env, const char* fallback) {
    const char* x = getenv(env);
    std::string base = x && *x ? x : homeDir() + fallback;
    mkdir(base.c_str(), 0755);
    std::string dir = base + "/logimx";
    migrateFromOldName(base, dir);
    mkdir(dir.c_str(), 0755);
    return dir;
}

std::string configDir() { return xdgDir("XDG_CONFIG_HOME", "/.config"); }
std::string stateDir() { return xdgDir("XDG_STATE_HOME", "/.local/state"); }

std::string ipcEndpoint() {
    const char* rt = getenv("XDG_RUNTIME_DIR");
    std::string base = rt && *rt ? rt : "/run/user/" + std::to_string(getuid());
    return base + "/logimx.sock";
}

static void (*gStop)() = nullptr;
void onStop(void (*fn)()) {
    gStop = fn;
    signal(SIGTERM, [](int) { if (gStop) gStop(); });
    signal(SIGINT, [](int) { if (gStop) gStop(); });
}

void runCommand(const std::string& cmd) {
    if (cmd.empty()) return;
    std::string full = "(" + cmd + ") >/dev/null 2>&1 &";
    if (std::system(full.c_str()) != 0) { /* ignore */ }
}

void openTarget(const std::string& t) {
    std::string target = t;
    if (target.empty()) return;
    if (target == "~" || target.rfind("~/", 0) == 0) target = homeDir() + target.substr(1);
    std::string full = "xdg-open '" + target + "' >/dev/null 2>&1 &";
    if (std::system(full.c_str()) != 0) { /* ignore */ }
}

void launchApp(const std::string& id) {
    if (id.empty()) return;
    std::string full = "(gtk-launch '" + id + "' || gio launch /usr/share/applications/'" + id + "'.desktop) >/dev/null 2>&1 &";
    if (std::system(full.c_str()) != 0) { /* ignore */ }
}

// OS-side pointer speed (-1..1): GNOME through gsettings, otherwise libinput on X11 via xinput
void setPointerSpeed(double v, const std::string& deviceName, const std::string& nodeName) {
    char val[32];
    snprintf(val, sizeof(val), "%.2f", v);
    const char* desk = getenv("XDG_CURRENT_DESKTOP");
    std::string cmd;
    if (desk && std::string(desk).find("GNOME") != std::string::npos)
        cmd = std::string("gsettings set org.gnome.desktop.peripherals.mouse speed ") + val + " >/dev/null 2>&1";
    else if (getenv("DISPLAY"))
        cmd = std::string("for n in \"pointer:") + deviceName + "\" \"pointer:" + nodeName + " Mouse\"; do xinput --set-prop \"$n\" 'libinput Accel Speed' " + val + " >/dev/null 2>&1; done";
    if (!cmd.empty() && std::system(cmd.c_str()) != 0) { /* ignore */ }
}

Audio audioGet() { return Audio{}; }
bool audioSetVolume(int) { return false; }
bool micToggle() { return false; }

// Steam games have no desktop entry unless someone made a shortcut: read the library itself
static void scanSteamGamesLinux(json& out, std::set<std::string>& seen) {
    const std::string h = homeDir();
    scanSteamGames(out, seen, {
        h + "/.steam/steam/steamapps",
        h + "/.local/share/Steam/steamapps",
        h + "/snap/steam/common/.local/share/Steam/steamapps",
        h + "/.var/app/com.valvesoftware.Steam/data/Steam/steamapps",
    });
}

json listApplications() {
    json out = json::array();
    std::set<std::string> seen;
    std::vector<std::string> dirs = {"/usr/share/applications", "/usr/local/share/applications", "/var/lib/flatpak/exports/share/applications", "/var/lib/snapd/desktop/applications"};
    if (const char* h = getenv("HOME")) {
        dirs.insert(dirs.begin(), std::string(h) + "/.local/share/applications");
        dirs.push_back(std::string(h) + "/.local/share/flatpak/exports/share/applications");
    }
    for (auto& d : dirs) {
        DIR* dp = opendir(d.c_str());
        if (!dp) continue;
        while (dirent* e = readdir(dp)) {
            std::string fn = e->d_name;
            if (fn.size() < 9 || fn.substr(fn.size() - 8) != ".desktop") continue;
            std::string id = fn.substr(0, fn.size() - 8);
            if (seen.count(id)) continue;
            std::ifstream f(d + "/" + fn);
            std::string line, name, icon, wmclass, exec;
            bool nodisplay = false, hidden = false, inEntry = false;
            while (std::getline(f, line)) {
                if (line.rfind("[", 0) == 0) { inEntry = line == "[Desktop Entry]"; continue; }
                if (!inEntry) continue;
                if (line.rfind("Name=", 0) == 0 && name.empty()) name = line.substr(5);
                else if (line.rfind("Icon=", 0) == 0) icon = line.substr(5);
                else if (line.rfind("StartupWMClass=", 0) == 0) wmclass = line.substr(15);
                else if (line.rfind("Exec=", 0) == 0) exec = line.substr(5);
                else if (line.rfind("NoDisplay=true", 0) == 0) nodisplay = true;
                else if (line.rfind("Hidden=true", 0) == 0) hidden = true;
            }
            if (name.empty() || nodisplay || hidden || exec.empty()) continue;
            seen.insert(id);
            out.push_back({{"id", id}, {"name", name}, {"icon", icon}, {"wm_class", wmclass}});
        }
        closedir(dp);
    }
    scanSteamGamesLinux(out, seen);
    std::sort(out.begin(), out.end(), [](const json& a, const json& b) { return a["name"].get<std::string>() < b["name"].get<std::string>(); });
    return out;
}

std::string inputMonitoring() { return "granted"; }

json conflictingTools() {
    json out = json::array();
    DIR* dp = opendir("/proc");
    if (!dp) return out;
    while (dirent* e = readdir(dp)) {
        if (e->d_name[0] < '0' || e->d_name[0] > '9') continue;
        std::ifstream f(std::string("/proc/") + e->d_name + "/comm");
        std::string comm;
        std::getline(f, comm);
        if (comm == "solaar" || comm == "logid") out.push_back({{"name", comm}, {"pid", atoi(e->d_name)}});
    }
    closedir(dp);
    return out;
}
}  // namespace platform
