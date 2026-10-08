// A scripted HID++ 2.0 device for the tests: it answers Root and FeatureSet from a feature list, and
// every other feature from a handler the test gives it. Requests it is told to ignore get no reply
// (a timeout), and a handler can answer with a HID++ error. Every frame written is kept.
#pragma once
#include <condition_variable>
#include <deque>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <vector>

#include "hidpp/hid.h"
#include "hidpp/protocol.h"
#include "hidpp/transport.h"

namespace fake {

using hidpp::Bytes;

// a handler's answer: the payload, or a HID++ error code
struct Reply {
    Bytes payload;
    int error = 0;
    static Reply err(int code) {
        Reply r;
        r.error = code;
        return r;
    }
};

struct Feature {
    uint16_t id;
    uint8_t version = 0, type = 0;
    std::function<Reply(uint8_t fn, const Bytes& params)> on;
};

class Device : public hidpp::HidDevice {
  public:
    explicit Device(std::vector<Feature> features, uint8_t devIndex = 0xFF, uint32_t bustype = 0x05)
        : features_(std::move(features)), devIndex_(devIndex) {
        info_.bustype = bustype;
        info_.vendor = 0x046D;
        info_.product = 0xB042;
        info_.name = "fake";
    }
    const hidpp::RawInfo& info() const override { return info_; }

    int read(uint8_t* buf, size_t len, int timeoutMs) override {
        std::unique_lock<std::mutex> lk(m_);
        if (!cv_.wait_for(lk, std::chrono::milliseconds(timeoutMs), [this] { return !out_.empty() || closed_; })) return 0;
        if (closed_ && out_.empty()) return -1;
        Bytes f = out_.front();
        out_.pop_front();
        size_t n = std::min(len, f.size());
        std::copy(f.begin(), f.begin() + n, buf);
        return static_cast<int>(n);
    }

    bool write(const uint8_t* buf, size_t len) override {
        Bytes f(buf, buf + len);
        std::lock_guard<std::mutex> lk(m_);
        written.push_back(f);
        if (f.size() < 4 || f[1] != devIndex_ || silent) return true;
        uint8_t featIdx = f[2], fnsw = f[3], fn = fnsw >> 4;
        Bytes params(f.begin() + 4, f.end());
        Reply r = answer(featIdx, fn, params);
        Bytes out = r.error ? Bytes{hidpp::kLong, devIndex_, 0xFF, featIdx, fnsw, static_cast<uint8_t>(r.error)}
                            : Bytes{hidpp::kLong, devIndex_, featIdx, fnsw};
        if (!r.error) out.insert(out.end(), r.payload.begin(), r.payload.end());
        out.resize(hidpp::kLongLen, 0);
        out_.push_back(out);
        cv_.notify_all();
        return true;
    }

    // a notification from the device, as if it had sent one on its own
    void notify(uint8_t featIdx, uint8_t event, const Bytes& data) {
        Bytes out{hidpp::kLong, devIndex_, featIdx, static_cast<uint8_t>(event << 4)};
        out.insert(out.end(), data.begin(), data.end());
        out.resize(hidpp::kLongLen, 0);
        std::lock_guard<std::mutex> lk(m_);
        out_.push_back(out);
        cv_.notify_all();
    }

    // the index a feature has in this device's table (1 based after Root)
    uint8_t indexOf(uint16_t id) const {
        for (size_t i = 0; i < features_.size(); ++i)
            if (features_[i].id == id) return static_cast<uint8_t>(i + 1);
        return 0;
    }

    std::vector<Bytes> written;   // every frame the host wrote
    bool silent = false;          // true: nothing is answered (the host times out)

  private:
    Reply answer(uint8_t featIdx, uint8_t fn, const Bytes& p) {
        if (featIdx == 0) {
            if (fn == 1) return {{4, 5, p.size() > 2 ? p[2] : uint8_t(0)}};   // ping: protocol 4.5
            if (fn == 0) {                                                    // getFeature(id)
                uint16_t id = static_cast<uint16_t>((p[0] << 8) | p[1]);
                if (id == hidpp::FEATURE_SET) return {{static_cast<uint8_t>(features_.size() + 1), 0, 0}};
                uint8_t i = indexOf(id);
                if (!i) return {{0, 0, 0}};
                return {{i, features_[i - 1].type, features_[i - 1].version}};
            }
        }
        if (featIdx == features_.size() + 1) {   // FeatureSet: count, then each feature by index
            if (fn == 0) return {{static_cast<uint8_t>(features_.size())}};
            if (fn == 1) {
                const Feature& x = features_.at(p[0] - 1);
                return {{static_cast<uint8_t>(x.id >> 8), static_cast<uint8_t>(x.id), x.type, x.version}};
            }
        }
        if (featIdx >= 1 && featIdx <= features_.size() && features_[featIdx - 1].on) return features_[featIdx - 1].on(fn, p);
        return Reply::err(0x07);   // unsupported
    }

    hidpp::RawInfo info_;
    std::vector<Feature> features_;
    uint8_t devIndex_;
    std::mutex m_;
    std::condition_variable cv_;
    std::deque<Bytes> out_;
    bool closed_ = false;
};

// the name feature (0x0005) answering a given name and device type (3 = mouse)
inline Feature nameFeature(const std::string& name, uint8_t type) {
    return {hidpp::DEVICE_NAME, 0, 0, [name, type](uint8_t fn, const Bytes& p) -> Reply {
                if (fn == 0) return {{static_cast<uint8_t>(name.size())}};
                if (fn == 1) {
                    std::string part = name.substr(std::min<size_t>(p[0], name.size()), 16);
                    return {Bytes(part.begin(), part.end())};
                }
                return {{type}};
            }};
}

// the firmware feature (0x0003, version 4 so it reports the serial)
inline Feature firmwareFeature(const std::string& prefix3, uint8_t major, uint8_t minor, uint16_t build, const std::string& serial) {
    return {hidpp::DEVICE_FW, 4, 0, [=](uint8_t fn, const Bytes&) -> Reply {
                if (fn == 0) return {{1}};
                if (fn == 1) return {{0, static_cast<uint8_t>(prefix3[0]), static_cast<uint8_t>(prefix3[1]), static_cast<uint8_t>(prefix3[2]), major, minor,
                    static_cast<uint8_t>(build >> 8), static_cast<uint8_t>(build)}};
                return {Bytes(serial.begin(), serial.end())};
            }};
}

}   // namespace fake
