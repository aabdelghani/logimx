// macOS: Application Support paths, /Applications bundles, open(1), CoreAudio, mouse scaling
#import <AppKit/AppKit.h>
#include <CoreAudio/CoreAudio.h>
#include <IOKit/hidsystem/IOHIDLib.h>
#include <IOKit/hidsystem/event_status_driver.h>
#include <SystemConfiguration/SystemConfiguration.h>
#include <libproc.h>
#include <pwd.h>
#include <signal.h>
#include <spawn.h>
#include <sys/wait.h>
#include <unistd.h>

#include <algorithm>
#include <cstdlib>
#include <set>
#include <thread>

#include "platform.h"
#include "steam.h"

extern char** environ;

namespace platform {

const char* name() { return "macos"; }

std::string homeDir() {
    const char* h = getenv("HOME");
    if (h && *h) return h;
    if (passwd* pw = getpwuid(getuid())) return pw->pw_dir;
    return "/tmp";
}

std::string hostName() {
    std::string out;
    if (CFStringRef n = SCDynamicStoreCopyComputerName(nullptr, nullptr)) {
        char buf[256];
        if (CFStringGetCString(n, buf, sizeof(buf), kCFStringEncodingUTF8)) out = buf;
        CFRelease(n);
    }
    if (out.empty()) {
        char hn[64] = {0};
        gethostname(hn, sizeof(hn) - 1);
        out = hn;
    }
    return out;
}

static std::string appSupport() { return homeDir() + "/Library/Application Support/LogiMX"; }

static std::string ensure(const std::string& dir) {
    std::error_code ec;
    std::filesystem::create_directories(fsPath(dir), ec);
    return dir;
}

std::string configDir() { return ensure(appSupport() + "/agent"); }
std::string stateDir() { return ensure(appSupport() + "/agent"); }
std::string ipcEndpoint() { return appSupport() + "/logimx.sock"; }

static void (*gStop)() = nullptr;
void onStop(void (*fn)()) {
    gStop = fn;
    signal(SIGTERM, [](int) { if (gStop) gStop(); });
    signal(SIGINT, [](int) { if (gStop) gStop(); });
    signal(SIGPIPE, SIG_IGN);
}

// start a program with these arguments, not waiting for it and without a shell
static void spawnDetached(const std::vector<std::string>& args) {
    std::vector<char*> argv;
    for (auto& a : args) argv.push_back(const_cast<char*>(a.c_str()));
    argv.push_back(nullptr);
    pid_t pid;
    if (posix_spawn(&pid, argv[0], nullptr, nullptr, argv.data(), environ) == 0) {
        // reap it in the background so it does not linger as a zombie
        std::thread([pid] { int st; waitpid(pid, &st, 0); }).detach();
    }
}

void runCommand(const std::string& cmd) {
    if (!cmd.empty()) spawnDetached({"/bin/sh", "-c", cmd});
}

void openTarget(const std::string& t) {
    std::string target = t;
    if (target.empty()) return;
    if (target == "~" || target.rfind("~/", 0) == 0) target = homeDir() + target.substr(1);
    spawnDetached({"/usr/bin/open", target});
}

void launchApp(const std::string& app) {
    if (app.empty()) return;
    if (app.rfind("steam:", 0) == 0) { spawnDetached({"/usr/bin/open", "steam://rungameid/" + app.substr(6)}); return; }
    if (app.find('/') == std::string::npos) spawnDetached({"/usr/bin/open", "-b", app});   // a bundle id
    else spawnDetached({"/usr/bin/open", app});                                           // a bundle path
}

// ---------------------------------------------------------------- applications

static void scanApps(const std::string& dir, json& out, std::set<std::string>& seen) {
    std::error_code ec;
    std::filesystem::directory_iterator it(fsPath(dir), ec), end;
    for (; !ec && it != end; it.increment(ec)) {
        auto p = it->path();
        if (p.extension() != ".app") continue;
        @autoreleasepool {
            NSBundle* b = [NSBundle bundleWithPath:[NSString stringWithUTF8String:fsString(p).c_str()]];
            if (!b) continue;
            NSString* bid = b.bundleIdentifier;
            NSString* nm = [b objectForInfoDictionaryKey:@"CFBundleDisplayName"] ?: [b objectForInfoDictionaryKey:@"CFBundleName"];
            std::string name = nm ? std::string(nm.UTF8String) : fsString(p.stem());
            std::string bundle = bid ? std::string(bid.UTF8String) : "";
            std::string key = bundle.empty() ? fsString(p) : bundle;
            if (seen.count(key)) continue;
            seen.insert(key);
            out.push_back({{"id", fsString(p)}, {"name", name}, {"icon", ""}, {"wm_class", bundle.empty() ? name : bundle}});
        }
    }
}

json listApplications() {
    json out = json::array();
    std::set<std::string> seen;
    for (const std::string& d : {std::string("/Applications"), std::string("/Applications/Utilities"), std::string("/System/Applications"),
                                 std::string("/System/Applications/Utilities"), homeDir() + "/Applications"})
        scanApps(d, out, seen);
    std::set<std::string> steamSeen;
    scanSteamGames(out, steamSeen, {homeDir() + "/Library/Application Support/Steam/steamapps"});
    std::sort(out.begin(), out.end(), [](const json& a, const json& b) { return a["name"].get<std::string>() < b["name"].get<std::string>(); });
    return out;
}

json conflictingTools() {
    json out = json::array();
    int n = proc_listallpids(nullptr, 0);
    if (n <= 0) return out;
    std::vector<pid_t> pids(static_cast<size_t>(n) + 32);
    n = proc_listallpids(pids.data(), static_cast<int>(pids.size() * sizeof(pid_t)));
    for (int i = 0; i < n; ++i) {
        char nm[64] = {0};   // proc_name gives up to 2 * MAXCOMLEN (32) characters
        if (proc_name(pids[static_cast<size_t>(i)], nm, sizeof(nm)) <= 0) continue;
        std::string s = nm;
        if (s == "logioptionsplus_agent" || s == "LogiMgrDaemon" || s == "Logi Options+" || s == "lghub_agent")
            out.push_back({{"name", s}, {"pid", static_cast<int>(pids[static_cast<size_t>(i)])}});
    }
    return out;
}

// -1..1 onto the tracking-speed scale (0 .. 3, 0.6875 being the default), applied now and
// kept for the next login
void setPointerSpeed(double v, const std::string&, const std::string&) {
    const double def = 0.6875;
    double scale = v < 0 ? def * (1 + v) : def + v * (3.0 - def);
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    NXEventHandle h = NXOpenEventStatus();
    if (h) {
        IOHIDSetAccelerationWithKey(h, CFSTR("HIDMouseAcceleration"), scale);   // kIOHIDMouseAccelerationType
        NXCloseEventStatus(h);
    }
#pragma clang diagnostic pop
    char val[32];
    snprintf(val, sizeof(val), "%.4f", scale);
    spawnDetached({"/usr/bin/defaults", "write", "-g", "com.apple.mouse.scaling", "-float", val});
}

// ---------------------------------------------------------------- audio

static AudioObjectID defaultDevice(bool input) {
    AudioObjectPropertyAddress a{input ? kAudioHardwarePropertyDefaultInputDevice : kAudioHardwarePropertyDefaultOutputDevice,
                                 kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain};
    AudioObjectID dev = kAudioObjectUnknown;
    UInt32 sz = sizeof(dev);
    if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &a, 0, nullptr, &sz, &dev) != noErr) return kAudioObjectUnknown;
    return dev;
}

// 'vmvc': the device's main volume as the menu bar shows it (kAudioHardwareServiceDeviceProperty_VirtualMainVolume)
static const AudioObjectPropertySelector kVirtualMainVolume = 'vmvc';

static bool getMute(AudioObjectID dev, AudioObjectPropertyScope scope, bool& muted) {
    AudioObjectPropertyAddress a{kAudioDevicePropertyMute, scope, kAudioObjectPropertyElementMain};
    UInt32 m = 0, sz = sizeof(m);
    if (!AudioObjectHasProperty(dev, &a) || AudioObjectGetPropertyData(dev, &a, 0, nullptr, &sz, &m) != noErr) return false;
    muted = m != 0;
    return true;
}

static bool setMute(AudioObjectID dev, AudioObjectPropertyScope scope, bool muted) {
    AudioObjectPropertyAddress a{kAudioDevicePropertyMute, scope, kAudioObjectPropertyElementMain};
    UInt32 m = muted ? 1 : 0;
    return AudioObjectHasProperty(dev, &a) && AudioObjectSetPropertyData(dev, &a, 0, nullptr, sizeof(m), &m) == noErr;
}

Audio audioGet() {
    Audio out;
    AudioObjectID dev = defaultDevice(false);
    if (dev != kAudioObjectUnknown) {
        AudioObjectPropertyAddress a{kVirtualMainVolume, kAudioDevicePropertyScopeOutput, kAudioObjectPropertyElementMain};
        Float32 v = 0;
        UInt32 sz = sizeof(v);
        if (AudioObjectGetPropertyData(dev, &a, 0, nullptr, &sz, &v) == noErr) { out.volume = static_cast<int>(v * 100 + 0.5f); out.ok = true; }
        getMute(dev, kAudioDevicePropertyScopeOutput, out.muted);
    }
    AudioObjectID in = defaultDevice(true);
    if (in != kAudioObjectUnknown) getMute(in, kAudioDevicePropertyScopeInput, out.micMuted);
    return out;
}

bool audioSetVolume(int percent) {
    AudioObjectID dev = defaultDevice(false);
    if (dev == kAudioObjectUnknown) return false;
    AudioObjectPropertyAddress a{kVirtualMainVolume, kAudioDevicePropertyScopeOutput, kAudioObjectPropertyElementMain};
    Float32 v = std::max(0, std::min(100, percent)) / 100.0f;
    bool ok = AudioObjectSetPropertyData(dev, &a, 0, nullptr, sizeof(v), &v) == noErr;
    if (ok && percent > 0) setMute(dev, kAudioDevicePropertyScopeOutput, false);
    return ok;
}

bool micToggle() {
    AudioObjectID in = defaultDevice(true);
    bool muted = false;
    if (in == kAudioObjectUnknown || !getMute(in, kAudioDevicePropertyScopeInput, muted)) return false;
    return setMute(in, kAudioDevicePropertyScopeInput, !muted);
}

}  // namespace platform
