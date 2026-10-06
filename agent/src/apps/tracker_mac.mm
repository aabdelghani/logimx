// Focused application on macOS, by bundle id ("com.apple.Safari").
//
// NSWorkspace's frontmostApplication only refreshes while a main run loop spins, which the
// agent does not have, so the window server is asked instead: its on-screen window list is
// ordered front to back, and the first normal-layer window belongs to the focused app.
#import <AppKit/AppKit.h>
#include <ApplicationServices/ApplicationServices.h>

#include <chrono>
#include <set>

#include "tracker.h"

namespace apps {

// Electron reads the pointer itself here
bool pointerPosition(int&, int&) { return false; }

namespace {

std::string bundleId(pid_t pid) {
    @autoreleasepool {
        NSRunningApplication* app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
        if (!app) return "";
        NSString* bid = app.bundleIdentifier ?: app.localizedName;
        return bid ? std::string(bid.UTF8String) : "";
    }
}

// owner pids of normal windows on screen, frontmost first
std::vector<pid_t> windowOwners() {
    std::vector<pid_t> out;
    CFArrayRef list = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
    if (!list) return out;
    for (CFIndex i = 0; i < CFArrayGetCount(list); ++i) {
        auto info = static_cast<CFDictionaryRef>(CFArrayGetValueAtIndex(list, i));
        int layer = -1, pid = 0;
        auto l = static_cast<CFNumberRef>(CFDictionaryGetValue(info, kCGWindowLayer));
        auto p = static_cast<CFNumberRef>(CFDictionaryGetValue(info, kCGWindowOwnerPID));
        if (l) CFNumberGetValue(l, kCFNumberIntType, &layer);
        if (p) CFNumberGetValue(p, kCFNumberIntType, &pid);
        if (layer == 0 && pid > 0) out.push_back(pid);
    }
    CFRelease(list);
    return out;
}

}  // namespace

std::vector<std::string> runningWindowClasses() {
    std::vector<std::string> out;
    std::set<std::string> seen;
    for (pid_t pid : windowOwners()) {
        std::string bid = bundleId(pid);
        if (!bid.empty() && seen.insert(bid).second) out.push_back(bid);
    }
    return out;
}

bool skipTaskbar(unsigned long) { return false; }

Tracker::~Tracker() { stop(); }

void Tracker::start() {
    backend_ = "macos";
    thread_ = std::thread([this] {
        pid_t last = 0;
        while (!stop_) {
            auto owners = windowOwners();
            pid_t front = owners.empty() ? 0 : owners.front();
            if (front && front != last) {
                last = front;
                std::string bid = bundleId(front);
                if (!bid.empty()) set(bid);
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(250));
        }
    });
}

void Tracker::stop() {
    stop_ = true;
    if (thread_.joinable()) thread_.join();
}

void Tracker::set(const std::string& cls) {
    if (cls == current_) return;
    current_ = cls;
    if (cb_) cb_(cls);
}

void Tracker::x11Loop() {}
void Tracker::gnomeLoop() {}
void Tracker::swayLoop() {}

}  // namespace apps
