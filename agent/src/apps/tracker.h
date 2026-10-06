// Focused application tracker. Linux: X11 _NET_ACTIVE_WINDOW, GNOME Wayland and sway by polling
// (tracker_linux.cpp). Windows: the foreground window's process (tracker_win.cpp). macOS: the
// frontmost application's bundle id (tracker_mac.mm).
#pragma once
#include <atomic>
#include <functional>
#include <string>
#include <thread>
#include <vector>

namespace apps {

// Window classes of everything currently open, most recently mapped last.
// X11 and Sway report the real list; GNOME on Wayland exposes nothing usable, so it returns empty.
std::vector<std::string> runningWindowClasses();

// Keep a window of ours out of the taskbar and the dock (X11). The toolkit's own request is lost
// for windows it creates hidden, so the window manager is asked directly once the window is up.
bool skipTaskbar(unsigned long xid);

// Where the pointer is on the desktop, in pixels (X11). Electron's own reading on Linux goes stale
// while the pointer is over other programs' windows; false where this cannot tell.
bool pointerPosition(int& x, int& y);

class Tracker {
  public:
    using Callback = std::function<void(const std::string&)>;
    explicit Tracker(Callback cb) : cb_(std::move(cb)) {}
    ~Tracker();
    void start();
    void stop();
    const std::string& backend() const { return backend_; }
    const std::string& current() const { return current_; }
    // the process that owns the focused window, 0 when the backend cannot tell (set before the callback)
    int pid() const { return pid_; }
    // the focused window is a dialog or pop-up of another window (X11 WM_TRANSIENT_FOR)
    bool transient() const { return transient_; }

  private:
    void x11Loop();
    void gnomeLoop();
    void swayLoop();
    void set(const std::string& cls);
    Callback cb_;
    std::string backend_ = "none", current_;
    std::atomic<int> pid_{0};
    std::atomic<bool> transient_{false};
    std::atomic<bool> stop_{false};
    std::thread thread_;
};

}  // namespace apps
