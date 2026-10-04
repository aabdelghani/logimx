// hidapi backend (Windows, macOS; also buildable on Linux for testing)
//
// hidapi lists one entry per top-level collection. HID++ lives in the vendor collections
// (usage page 0xFF00 on receivers and USB, 0xFF43 on Bluetooth). On Windows each collection
// is its own device path ("...&col01" short reports, "...&col02" long reports), so entries
// are grouped back into one node and the node's path carries every collection, joined by '|'.
// On macOS and Linux the collections share one path and the group has a single member.
#include "hid.h"

#include <hidapi.h>
#ifdef __APPLE__
#include <hidapi_darwin.h>
#endif

#include <algorithm>
#include <chrono>
#include <cstring>
#include <map>
#include <mutex>
#include <stdexcept>

namespace hidpp {

static void hidInit() {
    static std::once_flag once;
    std::call_once(once, [] {
        hid_init();
#ifdef __APPLE__
        // hidapi seizes devices by default on macOS, which would take the mouse away from the
        // system; HID++ only needs to share it
        hid_darwin_set_open_exclusive(0);
#endif
    });
}

static std::string utf8(const wchar_t* w) {
    std::string out;
    if (!w) return out;
    for (; *w; ++w) {
        uint32_t c = static_cast<uint32_t>(*w);
        if (c < 0x80) out += static_cast<char>(c);
        else if (c < 0x800) { out += static_cast<char>(0xC0 | (c >> 6)); out += static_cast<char>(0x80 | (c & 0x3F)); }
        else if (c < 0x10000) { out += static_cast<char>(0xE0 | (c >> 12)); out += static_cast<char>(0x80 | ((c >> 6) & 0x3F)); out += static_cast<char>(0x80 | (c & 0x3F)); }
        else { out += static_cast<char>(0xF0 | (c >> 18)); out += static_cast<char>(0x80 | ((c >> 12) & 0x3F)); out += static_cast<char>(0x80 | ((c >> 6) & 0x3F)); out += static_cast<char>(0x80 | (c & 0x3F)); }
    }
    return out;
}

// "Logitech USB Receiver" like hidraw reports it: maker and product, the maker only once
static std::string fullName(const hid_device_info* d) {
    std::string maker = utf8(d->manufacturer_string), product = utf8(d->product_string);
    if (maker.empty() || product.rfind(maker, 0) == 0) return product;
    return product.empty() ? maker : maker + " " + product;
}

// the interface a collection belongs to: the Windows path minus its "&colNN" part
static std::string groupKey(const std::string& path) {
    std::string lc = path;
    for (auto& c : lc) c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
    size_t i = lc.find("&col");
    if (i != std::string::npos && i + 6 <= lc.size()) lc.erase(i, 6);
    return lc;
}

static std::vector<std::string> splitPaths(const std::string& s) {
    std::vector<std::string> out;
    size_t a = 0, b;
    while ((b = s.find('|', a)) != std::string::npos) { out.push_back(s.substr(a, b - a)); a = b + 1; }
    out.push_back(s.substr(a));
    return out;
}

std::vector<HidNode> hidEnumerate() {
    hidInit();
    struct Group { std::vector<std::string> paths; RawInfo info; };
    std::map<std::string, Group> groups;
    hid_device_info* all = hid_enumerate(0x046D, 0);
    for (hid_device_info* d = all; d; d = d->next) {
        if (d->usage_page != 0xFF00 && d->usage_page != 0xFF43) continue;
        Group& g = groups[groupKey(d->path)];
        if (std::find(g.paths.begin(), g.paths.end(), d->path) == g.paths.end()) g.paths.push_back(d->path);
        g.info.vendor = d->vendor_id;
        g.info.product = d->product_id;
        g.info.bustype = d->bus_type == HID_API_BUS_BLUETOOTH ? 0x05 : 0x03;
        if (g.info.name.empty()) g.info.name = fullName(d);
    }
    hid_free_enumeration(all);
    std::vector<HidNode> out;
    for (auto& [key, g] : groups) {
        std::sort(g.paths.begin(), g.paths.end());
        std::string joined;
        for (auto& p : g.paths) joined += (joined.empty() ? "" : "|") + p;
        if (g.info.name.empty()) {
            char b[32];
            snprintf(b, sizeof(b), "Logitech %04X", g.info.product);
            g.info.name = b;
        }
        out.push_back(HidNode{joined, g.info});
    }
    return out;
}

namespace {

class HidapiDevice : public HidDevice {
  public:
    explicit HidapiDevice(const std::string& joined) {
        hidInit();
        for (auto& p : splitPaths(joined)) {
            hid_device* h = hid_open_path(p.c_str());
            if (!h) continue;
            Handle hd{h, 0};
            // which reports this collection carries: read its usage back from the enumeration
            if (hid_device_info* di = hid_get_device_info(h)) {
                hd.usage = di->usage;
                if (info_.name.empty()) {
                    info_.vendor = di->vendor_id;
                    info_.product = di->product_id;
                    info_.bustype = di->bus_type == HID_API_BUS_BLUETOOTH ? 0x05 : 0x03;
                    info_.name = fullName(di);
                }
            }
            handles_.push_back(hd);
        }
        if (handles_.empty()) throw std::runtime_error("open " + joined + ": cannot open any HID++ collection");
    }
    ~HidapiDevice() override {
        for (auto& h : handles_) hid_close(h.dev);
    }
    const RawInfo& info() const override { return info_; }

    int read(uint8_t* buf, size_t len, int timeoutMs) override {
        if (handles_.size() == 1) {
            int n = hid_read_timeout(handles_[0].dev, buf, len, timeoutMs);
            return n < 0 ? -1 : n;
        }
        // several collections: take turns with short waits so neither starves the other
        auto end = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeoutMs);
        do {
            for (size_t k = 0; k < handles_.size(); ++k) {
                Handle& h = handles_[(next_ + k) % handles_.size()];
                int n = hid_read_timeout(h.dev, buf, len, 4);
                if (n < 0) return -1;
                if (n > 0) { next_ = (next_ + k + 1) % handles_.size(); return n; }
            }
        } while (std::chrono::steady_clock::now() < end);
        return 0;
    }

    bool write(const uint8_t* buf, size_t len) override {
        if (!len) return false;
        // usage 0x0001 carries short reports (0x10), 0x0002 long (0x11), 0x0004 very long (0x12);
        // Bluetooth's single collection (0xFF43/0x0202) takes everything
        uint16_t want = buf[0] == 0x10 ? 0x0001 : buf[0] == 0x11 ? 0x0002 : 0x0004;
        hid_device* target = handles_[0].dev;
        for (auto& h : handles_)
            if (h.usage == want) { target = h.dev; break; }
        return hid_write(target, buf, len) >= 0;
    }

  private:
    struct Handle { hid_device* dev; uint16_t usage; };
    std::vector<Handle> handles_;
    size_t next_ = 0;
    RawInfo info_;
};

}  // namespace

std::unique_ptr<HidDevice> HidDevice::open(const std::string& path) { return std::make_unique<HidapiDevice>(path); }

}  // namespace hidpp
