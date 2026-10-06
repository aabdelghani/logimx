// Virtual keyboard + mouse used to play actions into the desktop.
// Keys are named with the Linux input names (KEY_A, KEY_LEFTMETA, BTN_SIDE) on every OS; each
// backend maps them to what its system understands: uinput (injector_linux.cpp), SendInput
// (injector_win.cpp), Quartz events (injector_mac.mm).
#pragma once
#include <cstdint>
#include <mutex>
#include <set>
#include <string>
#include <vector>

namespace actions {

class Injector {
  public:
    Injector();
    ~Injector();
    static int code(const std::string& name);  // "KEY_A" / "BTN_LEFT" -> code, -1 if unknown
    void press(const std::vector<std::string>& keys);
    void release(const std::vector<std::string>& keys);
    void tap(const std::vector<std::string>& keys);
    void releaseAll();
    void scroll(int dy, int dx, bool hires = true);  // hires units: 1/120 detent
    void click(const std::string& button, int count = 1);
    void typeText(const std::string& text);

  private:
#ifdef __linux__
    void emit(uint16_t type, uint16_t code, int32_t value);
    void syn();
    int fd_ = -1;
    int notchY_ = 0, notchX_ = 0;   // hi-res units towards the next whole notch, for programs that read only notches
#endif
#ifdef __APPLE__
    uint64_t flags_ = 0;   // modifier flags of the keys held, stamped on every event posted
    int restY_ = 0, restX_ = 0;   // hi-res units under one pixel, carried to the next scroll
#endif
    std::mutex m_;
    std::set<int> held_;
};

}  // namespace actions
