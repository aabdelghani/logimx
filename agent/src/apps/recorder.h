// Records a key chord straight from X11.
//
// A window cannot see Alt+Tab, Super, or Ctrl+Alt+arrow: the window manager holds a passive grab
// on them and acts on them first. Actively grabbing the keyboard overrides those grabs, so the
// keys reach us instead of switching windows.
#pragma once
#include <atomic>
#include <functional>
#include <string>
#include <thread>
#include <vector>

namespace apps {

class Recorder {
  public:
    // update: the chord so far. done: the finished chord, empty when cancelled with Escape.
    using Update = std::function<void(const std::vector<std::string>&)>;
    using Done = std::function<void(const std::vector<std::string>&)>;
    ~Recorder();
    bool start(Update onUpdate, Done onDone);   // false when X11 is unavailable or the grab fails
    void cancel();
    bool active() const { return active_.load(); }

  private:
    void loop(Update onUpdate, Done onDone);
    std::atomic<bool> active_{false}, stop_{false};
    std::thread thread_;
};

}  // namespace apps
