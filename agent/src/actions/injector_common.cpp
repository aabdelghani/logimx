// The parts of the injector every backend shares
#include <cctype>
#include <chrono>
#include <thread>

#include "injector.h"
#include "keycodes.gen.h"

namespace actions {

int Injector::code(const std::string& name) {
    std::string n = name;
    for (auto& c : n) c = static_cast<char>(toupper(static_cast<unsigned char>(c)));
    if (n.rfind("KEY_", 0) != 0 && n.rfind("BTN_", 0) != 0) n = "KEY_" + n;
    for (auto& [k, v] : kKeyCodes)
        if (k == n) return v;
    return -1;
}

void Injector::tap(const std::vector<std::string>& keys) {
    press(keys);
    std::this_thread::sleep_for(std::chrono::milliseconds(8));
    release(keys);
}

}  // namespace actions
