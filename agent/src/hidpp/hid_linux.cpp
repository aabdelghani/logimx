// hidraw backend (Linux)
#include "hid.h"

#include <fcntl.h>
#include <linux/hidraw.h>
#include <poll.h>
#include <sys/ioctl.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cstring>
#include <filesystem>
#include <stdexcept>

namespace hidpp {

static RawInfo rawInfo(int fd) {
    RawInfo r;
    hidraw_devinfo di{};
    if (ioctl(fd, HIDIOCGRAWINFO, &di) == 0) {
        r.bustype = di.bustype;
        r.vendor = static_cast<uint16_t>(di.vendor);
        r.product = static_cast<uint16_t>(di.product);
    }
    char name[256] = {0};
    if (ioctl(fd, HIDIOCGRAWNAME(sizeof(name)), name) >= 0) r.name = name;
    return r;
}

static bool supportsHidpp(int fd) {
    int size = 0;
    if (ioctl(fd, HIDIOCGRDESCSIZE, &size) != 0 || size <= 0) return false;
    hidraw_report_descriptor rd{};
    rd.size = size;
    if (ioctl(fd, HIDIOCGRDESC, &rd) != 0) return false;
    // vendor usage page 0xFF00 (receivers, USB) or 0xFF43 (Bluetooth)
    const uint8_t a[] = {0x06, 0x00, 0xff}, b[] = {0x06, 0x43, 0xff};
    for (int i = 0; i + 3 <= size; ++i)
        if (!memcmp(rd.value + i, a, 3) || !memcmp(rd.value + i, b, 3)) return true;
    return false;
}

std::vector<HidNode> hidEnumerate() {
    std::vector<HidNode> out;
    std::vector<std::filesystem::path> paths;
    for (auto& e : std::filesystem::directory_iterator("/dev")) {
        auto n = e.path().filename().string();
        if (n.rfind("hidraw", 0) == 0) paths.push_back(e.path());
    }
    std::sort(paths.begin(), paths.end(), [](auto& a, auto& b) {
        return std::stoi(a.filename().string().substr(6)) < std::stoi(b.filename().string().substr(6));
    });
    for (auto& p : paths) {
        std::string s = p.string();
        if (access(s.c_str(), R_OK | W_OK) != 0) continue;
        int fd = ::open(s.c_str(), O_RDONLY | O_NONBLOCK);
        if (fd < 0) continue;
        RawInfo info = rawInfo(fd);
        bool ok = info.vendor == 0x046D && supportsHidpp(fd);
        ::close(fd);
        if (ok) out.push_back(HidNode{s, info});
    }
    return out;
}

namespace {

class HidrawDevice : public HidDevice {
  public:
    explicit HidrawDevice(const std::string& path) {
        fd_ = ::open(path.c_str(), O_RDWR | O_NONBLOCK);
        if (fd_ < 0) throw std::runtime_error("open " + path + ": " + strerror(errno));
        info_ = rawInfo(fd_);
    }
    ~HidrawDevice() override { if (fd_ >= 0) ::close(fd_); }
    const RawInfo& info() const override { return info_; }
    int read(uint8_t* buf, size_t len, int timeoutMs) override {
        pollfd p{fd_, POLLIN, 0};
        int r = ::poll(&p, 1, timeoutMs);
        if (r <= 0) return 0;
        if (p.revents & (POLLERR | POLLHUP | POLLNVAL)) return -1;
        ssize_t n = ::read(fd_, buf, len);
        return n > 0 ? static_cast<int>(n) : 0;
    }
    bool write(const uint8_t* buf, size_t len) override { return ::write(fd_, buf, len) >= 0; }

  private:
    int fd_ = -1;
    RawInfo info_;
};

}  // namespace

std::unique_ptr<HidDevice> HidDevice::open(const std::string& path) { return std::make_unique<HidrawDevice>(path); }

}  // namespace hidpp
