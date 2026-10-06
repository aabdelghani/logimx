// Device events -> desktop actions (gestures, adapters, keystrokes)
#pragma once
#include <condition_variable>
#include <functional>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

#include "injector.h"
#include "nlohmann/json.hpp"

namespace actions {

using json = nlohmann::json;

// Resolve a preset name or inline action object to a full action object
json resolve(const json& action);
const json& presets();

struct DeviceOps {
    std::function<void(int)> changeHost;
    std::function<int()> getDpi;
    std::function<void(int)> setDpi;
    std::function<void()> toggleSmartshift;
    std::function<void(const std::string&)> uiEvent;
    // the action ring held on a control: kind is open, move (raw dx, dy) or release
    std::function<void(const std::string& kind, int cid, int dx, int dy)> ringEvent;
    std::function<void()> gestureFired;   // a swipe was recognised and its action ran
};

// Smooth scrolling: each notch is played as a short burst of small steps, most of it at once and
// the rest easing out over about 80 ms, the way Options+ plays a wheel it has taken over
class Smoother {
  public:
    explicit Smoother(Injector& inj);
    ~Smoother();
    void add(double dy, double dx);   // 1/120 detent units, positive = up / right

  private:
    void run();
    Injector& inj_;
    std::mutex m_;
    std::condition_variable cv_;
    bool stop_ = false;
    double py_ = 0, px_ = 0;   // still to play
    double ry_ = 0, rx_ = 0;   // played but under one unit, not sent yet
    std::thread t_;
};

class Engine {
  public:
    Engine(Injector& inj, DeviceOps ops) : inj_(inj), ops_(std::move(ops)), smooth_(inj) {}
    void play(const json& action, double delta = 0.0);
    void buttonDown(int cid, const json& action);
    void buttonUp(int cid, const json& action);
    void rawXY(int dx, int dy);
    void thumbwheel(int rotation, const json& action, double speed = 1.0, bool smooth = false);
    // the main wheel when the agent has taken it over: 1/120 detent units, positive = up
    void wheel(double units, double speed, bool smooth);

  private:
    struct Gesture {
        json action;
        int dx = 0, dy = 0;
        bool fired = false;
        double accX = 0, accY = 0;
        char direction = 0;  // 0, 'x', 'y'
    };
    static std::string dir(int dx, int dy);
    Injector& inj_;
    DeviceOps ops_;
    std::mutex m_;
    std::map<int, Gesture> gestures_;
    std::map<int, std::vector<std::string>> held_;
    std::set<int> ringHeld_;   // controls holding the action ring open until they are released
    double wheelAcc_ = 0;
    double restY_ = 0, restX_ = 0;   // scrolled but under one unit, not sent yet (no smoothing)
    Smoother smooth_;
    void scrollBy(double dy, double dx, bool smooth);
};

}  // namespace actions
