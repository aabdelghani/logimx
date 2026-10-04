// Raw HID access for HID++: one opened device node, plus enumeration of Logitech nodes.
//
// Linux talks to hidraw directly (hid_linux.cpp). Windows and macOS go through hidapi
// (hid_hidapi.cpp). On Windows one HID++ interface shows up as two collections, one per
// report id (0x10 short, 0x11 long); the hidapi backend opens both and presents them as a
// single device, so nothing above this layer needs to know.
#pragma once
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace hidpp {

struct RawInfo {
    uint32_t bustype = 0;   // Linux BUS_* numbering on every platform: 0x03 USB, 0x05 Bluetooth
    uint16_t vendor = 0, product = 0;
    std::string name;
};

// A Logitech node that speaks HID++ and that this user can open.
struct HidNode {
    std::string path;
    RawInfo info;
};
std::vector<HidNode> hidEnumerate();

class HidDevice {
  public:
    // throws std::runtime_error when the node cannot be opened
    static std::unique_ptr<HidDevice> open(const std::string& path);
    virtual ~HidDevice() = default;
    virtual const RawInfo& info() const = 0;
    // >0 bytes read (report id first), 0 on timeout, <0 once the device is gone
    virtual int read(uint8_t* buf, size_t len, int timeoutMs) = 0;
    virtual bool write(const uint8_t* buf, size_t len) = 0;
};

}  // namespace hidpp
