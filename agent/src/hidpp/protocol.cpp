#include <tuple>
#include "protocol.h"

#include <filesystem>
#include <fstream>

#include "../platform/platform.h"

#include <cstdio>
#include <cstring>

namespace hidpp {

static const std::map<int, std::string> kDeviceTypes = {
    {0, "keyboard"}, {1, "remote"}, {2, "numpad"}, {3, "mouse"}, {4, "trackpad"}, {5, "trackball"},
    {6, "presenter"}, {7, "receiver"}, {8, "headset"}, {9, "webcam"}, {10, "steering wheel"}};

static inline uint16_t be16(const Bytes& b, size_t i) { return static_cast<uint16_t>((b[i] << 8) | b[i + 1]); }
static inline int16_t sbe16(const Bytes& b, size_t i) { return static_cast<int16_t>(be16(b, i)); }
static inline uint16_t le16(const Bytes& b, size_t i) { return static_cast<uint16_t>(b[i] | (b[i + 1] << 8)); }

Bytes Device::req(uint16_t feature, uint8_t fn, const Bytes& params, bool noReply) {
    auto it = features_.find(feature);
    if (it == features_.end()) throw HidppError(0x06, 0, fn << 4);
    return t_.request(index_, it->second.index, fn, params, std::nullopt, noReply);
}

const FeatureInfo* Device::featureByIndex(uint8_t idx) const {
    for (auto& [id, f] : features_)
        if (f.index == idx) return &f;
    return nullptr;
}

bool Device::enumerate() {
    auto pv = t_.ping(index_);
    if (!pv || pv->first < 2) return false;
    features_.clear();
    features_[ROOT] = {ROOT, 0, 0, 0};
    Bytes r = t_.request(index_, 0, 0, {static_cast<uint8_t>(FEATURE_SET >> 8), static_cast<uint8_t>(FEATURE_SET & 0xFF)}, std::nullopt);
    if (r.size() < 3 || r[0] == 0) return false;
    uint8_t fs = r[0];
    features_[FEATURE_SET] = {FEATURE_SET, fs, r[2], 0};
    // a device seen before is not read again (as Options+ does): its firmware and serial in a few
    // requests, then its feature table, controls and names from the cache
    if (loadCache()) return true;
    int count = t_.request(index_, fs, 0, {}, std::nullopt)[0];
    for (int i = 1; i <= count; ++i) {
        Bytes fr = t_.request(index_, fs, 1, {static_cast<uint8_t>(i)}, std::nullopt);
        if (fr.size() < 4) continue;
        uint16_t fid = be16(fr, 0);
        features_[fid] = {fid, static_cast<uint8_t>(i), fr[3], fr[2]};
    }
    readIdentity();
    if (has(SPECIAL_KEYS)) readControls();
    saveCache();
    return true;
}

// ------------------------------------------------------------ the device cache
// One file per device (by serial) in the state folder: its feature table, controls and names, kept
// while its firmware is the same. Reading a device costs a hundred requests, slow over Bluetooth;
// a reconnect then takes a few.
static std::string cachePath(const std::string& serial) {
    std::string safe;
    for (char c : serial) if (isalnum(static_cast<unsigned char>(c))) safe += c;
    return platform::stateDir() + "/devices/" + safe + ".json";
}
bool Device::loadCache() {
    try {
        Bytes r = t_.request(index_, 0, 0, {static_cast<uint8_t>(DEVICE_FW >> 8), static_cast<uint8_t>(DEVICE_FW & 0xFF)}, std::nullopt);
        if (r.size() < 3 || r[0] == 0) return false;
        features_[DEVICE_FW] = {DEVICE_FW, r[0], r[2], r[1]};
        readFirmware();
        if (serial_.empty() || firmware_.empty()) return false;
        std::ifstream f(cachePath(serial_));
        if (!f) return false;
        json c = json::parse(f);
        if (c.value("firmware", "") != firmware_ || c.value("v", 0) != 1) return false;
        for (auto& x : c["features"]) {
            uint16_t id = x["id"].get<uint16_t>();
            features_[id] = {id, x["index"].get<uint8_t>(), x["version"].get<uint8_t>(), x["type"].get<uint8_t>()};
        }
        controls_.clear();
        for (auto& x : c["controls"]) {
            ControlInfo k;
            k.cid = x["cid"]; k.taskId = x["task"]; k.flags = x["flags"]; k.position = x["position"];
            k.group = x["group"]; k.groupMask = x["mask"]; k.extraFlags = x["extra"];
            controls_[k.cid] = k;
        }
        name_ = c.value("name", ""); friendlyName_ = c.value("friendly", ""); kind_ = c.value("kind", "unknown");
        return !name_.empty();
    } catch (const std::exception&) {
        return false;
    }
}
void Device::saveCache() {
    if (serial_.empty() || firmware_.empty() || name_.empty()) return;
    try {
        json c = {{"v", 1}, {"firmware", firmware_}, {"name", name_}, {"friendly", friendlyName_}, {"kind", kind_}, {"features", json::array()}, {"controls", json::array()}};
        for (auto& [id, fi] : features_) c["features"].push_back({{"id", id}, {"index", fi.index}, {"version", fi.version}, {"type", fi.type}});
        for (auto& [cid, k] : controls_)
            c["controls"].push_back({{"cid", k.cid}, {"task", k.taskId}, {"flags", k.flags}, {"position", k.position}, {"group", k.group}, {"mask", k.groupMask}, {"extra", k.extraFlags}});
        std::string p = cachePath(serial_);
        std::filesystem::create_directories(std::filesystem::path(p).parent_path());
        std::ofstream(p) << c.dump();
    } catch (const std::exception&) {
    }
}

void Device::readIdentity() {
    try {
        if (has(DEVICE_NAME)) {
            int n = req(DEVICE_NAME, 0)[0];
            std::string name;
            while (static_cast<int>(name.size()) < n) {
                Bytes r = req(DEVICE_NAME, 1, {static_cast<uint8_t>(name.size())});
                if (r.empty()) break;
                name.append(reinterpret_cast<const char*>(r.data()), r.size());
            }
            name_ = name.substr(0, n);
            int type = req(DEVICE_NAME, 2)[0];
            auto it = kDeviceTypes.find(type);
            kind_ = it == kDeviceTypes.end() ? "unknown" : it->second;
        }
    } catch (const std::exception&) {
    }
    try {
        if (has(FRIENDLY_NAME)) {
            int n = req(FRIENDLY_NAME, 0)[0];
            std::string fn;
            while (static_cast<int>(fn.size()) < n) {
                Bytes r = req(FRIENDLY_NAME, 1, {static_cast<uint8_t>(fn.size())});
                if (r.size() < 2) break;
                fn.append(reinterpret_cast<const char*>(r.data() + 1), r.size() - 1);
            }
            friendlyName_ = fn.substr(0, n);
        }
    } catch (const std::exception&) {
    }
    readFirmware();
}

void Device::readFirmware() {
    try {
        if (has(DEVICE_FW)) {
            int cnt = req(DEVICE_FW, 0)[0];
            for (int e = 0; e < cnt; ++e) {
                Bytes r = req(DEVICE_FW, 1, {static_cast<uint8_t>(e)});
                if (r.size() >= 8 && r[0] == 0) {
                    char buf[48];
                    snprintf(buf, sizeof(buf), "%c%c%c %02X.%02X.B%04X", r[1], r[2], r[3], r[4], r[5], be16(r, 6));
                    firmware_ = buf;
                }
            }
            if (features_[DEVICE_FW].version >= 4) {
                Bytes r = req(DEVICE_FW, 2);
                std::string s(reinterpret_cast<const char*>(r.data()), std::min<size_t>(12, r.size()));
                while (!s.empty() && s.back() == '\0') s.pop_back();
                serial_ = s;
            }
        }
    } catch (const std::exception&) {
    }
}

void Device::readControls() {
    controls_.clear();
    int cnt = req(SPECIAL_KEYS, 0)[0];
    for (int i = 0; i < cnt; ++i) {
        Bytes r = req(SPECIAL_KEYS, 1, {static_cast<uint8_t>(i)});
        if (r.size() < 9) continue;
        ControlInfo c;
        c.cid = be16(r, 0);
        c.taskId = be16(r, 2);
        c.flags = r[4];
        c.position = r[5];
        c.group = r[6];
        c.groupMask = r[7];
        c.extraFlags = r[8];
        controls_[c.cid] = c;
    }
}

Battery Device::decodeBattery(const Bytes& r) {
    Battery b;
    if (r.size() < 3) return b;
    b.percent = r[0];
    static const std::map<int, std::string> lv = {{8, "full"}, {4, "good"}, {2, "low"}, {1, "critical"}};
    auto it = lv.find(r[1]);
    b.level = it == lv.end() ? "unknown" : it->second;
    b.charging = r[2] >= 1 && r[2] <= 3;
    b.externalPower = r.size() > 3 && r[3];
    return b;
}

// 0x1000, on older devices such as the original MX Keys: level in percent, next level, status
// (0 discharging, 1 recharging, 2 almost full, 3 full, 4 slow recharge, 5+ battery or thermal error)
// A level of 0 is not "empty": these devices send 0 while charging, when they do not measure it;
// "full" (3) is 100% on the charger.
Battery Device::decodeBatteryStatus(const Bytes& r) {
    Battery b;
    if (r.size() < 3) return b;
    const int status = r[2];
    b.charging = status == 1 || status == 2 || status == 4;
    b.externalPower = status >= 1 && status <= 4;
    if (status == 3) { b.percent = 100; b.level = "full"; return b; }
    if (r[0] == 0) { b.known = false; b.level = "unknown"; return b; }
    b.percent = r[0];
    b.level = b.percent <= 5 ? "critical" : b.percent <= 20 ? "low" : b.percent >= 90 ? "full" : "good";
    return b;
}

std::optional<Battery> Device::battery() {
    if (has(UNIFIED_BATTERY)) return decodeBattery(req(UNIFIED_BATTERY, 1));
    if (has(BATTERY_STATUS)) return decodeBatteryStatus(req(BATTERY_STATUS, 0));
    return std::nullopt;
}

std::pair<uint8_t, uint16_t> Device::getReporting(uint16_t cid) {
    Bytes r = req(SPECIAL_KEYS, 2, {static_cast<uint8_t>(cid >> 8), static_cast<uint8_t>(cid)});
    return {r[2], be16(r, 3)};
}

void Device::setReporting(uint16_t cid, std::optional<bool> divert, std::optional<bool> rawXY, uint16_t remap) {
    uint8_t flags = 0;
    if (divert) flags |= 0x02 | (*divert ? 0x01 : 0);
    if (rawXY) flags |= 0x20 | (*rawXY ? 0x10 : 0);
    req(SPECIAL_KEYS, 3, {static_cast<uint8_t>(cid >> 8), static_cast<uint8_t>(cid), flags,
                          static_cast<uint8_t>(remap >> 8), static_cast<uint8_t>(remap)});
}

std::optional<SmartShiftState> Device::smartshift() {
    if (has(SMART_SHIFT)) {
        Bytes r = req(SMART_SHIFT, 0);
        return SmartShiftState{r[0], r[1], r[2]};
    }
    if (has(SMART_SHIFT_ENHANCED)) {
        // capabilities: flags (bit 0 = torque can be tuned), default threshold, default torque
        Bytes cap = req(SMART_SHIFT_ENHANCED, 0);
        Bytes r = req(SMART_SHIFT_ENHANCED, 1);
        SmartShiftState s;
        s.mode = r[0]; s.threshold = r[1]; s.torque = r[2];
        s.tunable = (cap[0] & 0x01) != 0; s.defaultThreshold = cap[1]; s.defaultTorque = cap[2];
        return s;
    }
    return std::nullopt;
}

void Device::setSmartshift(int mode, int threshold, int torque) {
    // zero leaves a field as it is
    Bytes p = {static_cast<uint8_t>(mode), static_cast<uint8_t>(threshold), static_cast<uint8_t>(torque)};
    if (has(SMART_SHIFT)) req(SMART_SHIFT, 1, {p[0], p[1], 0});
    else if (has(SMART_SHIFT_ENHANCED)) req(SMART_SHIFT_ENHANCED, 2, p);
}

std::optional<HapticState> Device::haptic() {
    if (!has(HAPTIC)) return std::nullopt;
    Bytes cap = req(HAPTIC, 0);
    Bytes cfg = req(HAPTIC, 1);
    HapticState h;
    h.waveforms = (static_cast<uint32_t>(cap[4]) << 24) | (static_cast<uint32_t>(cap[5]) << 16) | (static_cast<uint32_t>(cap[6]) << 8) | cap[7];
    h.enabled = (cfg[0] & 0x01) != 0;
    h.level = cfg[1];
    h.discrete = (cfg[2] & 0x01) != 0;
    return h;
}

void Device::setHaptic(bool enabled, int level) {
    if (!has(HAPTIC)) return;
    level = std::max(1, std::min(100, level));   // the level is kept while feedback is off
    req(HAPTIC, 2, {static_cast<uint8_t>(enabled ? 1 : 0), static_cast<uint8_t>(level)});
}

void Device::playHaptic(int waveform) {
    if (!has(HAPTIC)) return;
    req(HAPTIC, 4, {static_cast<uint8_t>(waveform)});
}

std::vector<ForceButton> Device::forceButtons() {
    std::vector<ForceButton> out;
    if (!has(FORCE_BUTTON)) return out;
    int n = req(FORCE_BUTTON, 0)[0];
    for (int i = 0; i < n && i < 8; ++i) {
        Bytes info = req(FORCE_BUTTON, 1, {static_cast<uint8_t>(i)});
        Bytes cur = req(FORCE_BUTTON, 2, {static_cast<uint8_t>(i)});
        auto u16 = [](const Bytes& b, size_t o) { return (static_cast<int>(b[o]) << 8) | b[o + 1]; };
        ForceButton f;
        f.index = i;
        f.changeable = (u16(info, 0) & 0x01) != 0;
        f.def = u16(info, 2); f.max = u16(info, 4); f.min = u16(info, 6);
        f.current = u16(cur, 0);
        out.push_back(f);
    }
    return out;
}

void Device::setForce(int index, int value) {
    if (!has(FORCE_BUTTON)) return;
    req(FORCE_BUTTON, 3, {static_cast<uint8_t>(index), static_cast<uint8_t>(value >> 8), static_cast<uint8_t>(value)});
}

std::optional<HiResState> Device::hires() {
    if (!has(HIRES_WHEEL)) return std::nullopt;
    Bytes cap = req(HIRES_WHEEL, 0);
    uint8_t mode = req(HIRES_WHEEL, 1)[0];
    HiResState s;
    s.hidppTarget = mode & 0x01;
    s.hires = mode & 0x02;
    s.invert = mode & 0x04;
    s.multiplier = cap[0];
    s.hasInvert = cap[1] & 0x08;
    s.hasRatchetSwitch = cap[1] & 0x04;
    return s;
}

void Device::setHires(bool hidppTarget, bool hires, bool invert) {
    req(HIRES_WHEEL, 2, {static_cast<uint8_t>((hidppTarget ? 1 : 0) | (hires ? 2 : 0) | (invert ? 4 : 0))});
}

std::optional<ThumbWheelState> Device::thumbwheel() {
    if (!has(THUMB_WHEEL)) return std::nullopt;
    Bytes info = req(THUMB_WHEEL, 0);
    Bytes st = req(THUMB_WHEEL, 1);
    ThumbWheelState s;
    s.diverted = st[0] & 0x01;
    s.invert = st[1] & 0x01;
    s.nativeRes = be16(info, 0);
    s.divertedRes = be16(info, 2);
    s.capabilities = info[4];
    return s;
}

void Device::setThumbwheel(bool diverted, bool invert) {
    req(THUMB_WHEEL, 2, {static_cast<uint8_t>(diverted), static_cast<uint8_t>(invert)});
}

std::optional<DpiState> Device::dpi() {
    if (!has(ADJUSTABLE_DPI)) return std::nullopt;
    Bytes r = req(ADJUSTABLE_DPI, 2, {0});
    DpiState s;
    s.dpi = be16(r, 1);
    s.def = be16(r, 3);
    Bytes lst = req(ADJUSTABLE_DPI, 1, {0});
    std::vector<int> vals;
    for (size_t i = 1; i + 1 < lst.size(); i += 2) {
        uint16_t v = be16(lst, i);
        if (v == 0) break;
        if ((v & 0xE000) == 0xE000) {
            s.stepped = true;
            vals.push_back(v & 0x1FFF);
        } else {
            vals.push_back(v);
        }
    }
    if (s.stepped && vals.size() >= 3) s.levels = {vals[0], vals[2], vals[1]};  // min, max, step
    else s.levels = vals;
    return s;
}

void Device::setDpi(int dpi) {
    req(ADJUSTABLE_DPI, 3, {0, static_cast<uint8_t>(dpi >> 8), static_cast<uint8_t>(dpi)});
}

std::optional<BacklightState> Device::backlight() {
    if (!has(BACKLIGHT2)) return std::nullopt;
    Bytes r = req(BACKLIGHT2, 0);
    if (r.size() < 12) return std::nullopt;
    BacklightState s;
    s.enabled = r[0];
    s.options = r[1];
    s.supported = r[2];
    s.effects = le16(r, 3);
    s.level = r[5];
    s.dho = le16(r, 6);
    s.dhi = le16(r, 8);
    s.dpow = le16(r, 10);
    try {
        Bytes i = req(BACKLIGHT2, 2);
        s.numLevels = i[0];
        s.currentLevel = i[1];
        s.status = i[2];
    } catch (const std::exception&) {
    }
    return s;
}

void Device::setBacklight(bool enabled, std::optional<int> mode, std::optional<int> level,
                          std::optional<int> dho, std::optional<int> dhi, std::optional<int> dpow) {
    auto cur = backlight();
    if (!cur) return;
    if (dho) cur->dho = *dho;
    if (dhi) cur->dhi = *dhi;
    if (dpow) cur->dpow = *dpow;
    int m = mode.value_or(cur->mode());
    uint8_t options = static_cast<uint8_t>((cur->options & 0x07) | ((m & 0x03) << 3));
    int lvl = level.value_or(cur->level);
    if (m != 3) lvl = 0;
    Bytes p = {static_cast<uint8_t>(enabled), options, 0xFF, static_cast<uint8_t>(lvl),
               static_cast<uint8_t>(cur->dho & 0xFF), static_cast<uint8_t>(cur->dho >> 8),
               static_cast<uint8_t>(cur->dhi & 0xFF), static_cast<uint8_t>(cur->dhi >> 8),
               static_cast<uint8_t>(cur->dpow & 0xFF), static_cast<uint8_t>(cur->dpow >> 8)};
    req(BACKLIGHT2, 1, p);
}

std::vector<HostInfo> Device::hosts() {
    std::vector<HostInfo> out;
    if (!has(HOSTS_INFO)) return out;
    Bytes st = req(HOSTS_INFO, 0);
    int caps = st[0], num = st[2];
    for (int h = 0; h < num; ++h) {
        Bytes r = req(HOSTS_INFO, 1, {static_cast<uint8_t>(h)});
        HostInfo hi;
        hi.index = h;
        hi.paired = r[1];
        hi.busType = r[2];
        int nlen = r[4];
        std::string name;
        if (caps & 0x01) {
            while (static_cast<int>(name.size()) < nlen) {
                Bytes piece = req(HOSTS_INFO, 3, {static_cast<uint8_t>(h), static_cast<uint8_t>(name.size())});
                size_t take = std::min<size_t>(14, nlen - name.size());
                if (piece.size() < 2 + take) take = piece.size() > 2 ? piece.size() - 2 : 0;
                if (take == 0) break;
                name.append(reinterpret_cast<const char*>(piece.data() + 2), take);
            }
        }
        hi.name = name;
        out.push_back(hi);
    }
    return out;
}

void Device::setHostName(int host, const std::string& name) {
    if (!has(HOSTS_INFO)) return;
    std::string n = name.substr(0, 24);
    for (size_t off = 0; off < n.size(); off += 14) {
        Bytes p = {static_cast<uint8_t>(host), static_cast<uint8_t>(off)};
        std::string chunk = n.substr(off, 14);
        p.insert(p.end(), chunk.begin(), chunk.end());
        req(HOSTS_INFO, 4, p);
    }
}

std::pair<int, int> Device::currentHost() {
    if (has(CHANGE_HOST)) {
        Bytes r = req(CHANGE_HOST, 0);
        return {r[0], r[1]};
    }
    if (has(HOSTS_INFO)) {
        Bytes r = req(HOSTS_INFO, 0);
        return {r[2], r[3]};
    }
    return {0, 0};
}

void Device::changeHost(int host) {
    if (!has(CHANGE_HOST)) throw std::runtime_error("device cannot switch hosts");
    int n = 3, cur = -1;
    try { std::tie(n, cur) = currentHost(); } catch (const Timeout&) { /* asleep: send the switch anyway */ }
    if (host < 0 || host >= n) throw std::runtime_error("host index out of range");
    if (host == cur) return;
    req(CHANGE_HOST, 1, {static_cast<uint8_t>(host)}, true);
}

// 0x40A3 is per host. The MX Keys S firmware does not accept 0xFF as "current host" (reads
// come back 0 and writes are ignored), so address the host the keyboard is connected to.
uint8_t Device::fnHost() {
    if (fnHost_ < 0) {
        try { fnHost_ = (has(CHANGE_HOST) || has(HOSTS_INFO)) ? currentHost().second : 0; } catch (...) { fnHost_ = 0; }
        if (fnHost_ < 0) fnHost_ = 0;
    }
    return static_cast<uint8_t>(fnHost_);
}

std::optional<bool> Device::fnInversion() {
    if (!has(FN_INVERSION_K375S)) return std::nullopt;
    Bytes r = req(FN_INVERSION_K375S, 0, {fnHost()});
    return r.size() > 1 && r[1];
}

void Device::setFnInversion(bool on) {
    if (has(FN_INVERSION_K375S)) req(FN_INVERSION_K375S, 1, {fnHost(), static_cast<uint8_t>(on)});
}

std::optional<DisableKeysState> Device::disableKeys() {
    if (!has(DISABLE_KEYS)) return std::nullopt;
    Bytes caps = req(DISABLE_KEYS, 0), cur = req(DISABLE_KEYS, 1);
    DisableKeysState s;
    s.supported = caps.empty() ? 0 : caps[0];
    s.disabled = cur.empty() ? 0 : cur[0];
    return s;
}

void Device::setDisabledKeys(int mask) {
    if (has(DISABLE_KEYS)) req(DISABLE_KEYS, 2, {static_cast<uint8_t>(mask)});
}

// getHostPlatform answers host, status, platform index, source (0 default, 1 detected by the
// keyboard, 2 set by software) and what the keyboard itself would pick
std::optional<PlatformState> Device::platform() {
    if (!has(MULTIPLATFORM)) return std::nullopt;
    Bytes r = req(MULTIPLATFORM, 2, {0xFF});
    if (r.size() < 5) return std::nullopt;
    return PlatformState{r[2], r[3], r[4]};
}

void Device::setPlatform(int platform) {
    if (has(MULTIPLATFORM)) req(MULTIPLATFORM, 3, {0xFF, static_cast<uint8_t>(platform)});
}

std::optional<Event> Device::classify(const Notification& n) const {
    if (n.deviceIndex != index_) return std::nullopt;
    const FeatureInfo* f = featureByIndex(n.featureIndex);
    if (!f) return std::nullopt;
    const Bytes& d = n.data;
    switch (f->id) {
        case SPECIAL_KEYS:
            if (n.event == 0 && d.size() >= 8) {
                json cids = json::array();
                for (int i = 0; i < 4; ++i) {
                    uint16_t c = be16(d, i * 2);
                    if (c) cids.push_back(c);
                }
                return Event{"buttons", {{"down", cids}}};
            }
            if (n.event == 1 && d.size() >= 4) return Event{"raw_xy", {{"dx", sbe16(d, 0)}, {"dy", sbe16(d, 2)}}};
            break;
        case FN_INVERSION_K375S:
            if (n.event == 0 && d.size() >= 2) return Event{"fn_swap", {{"host", d[0]}, {"on", d[1] != 0}}};
            break;
        case THUMB_WHEEL:
            if (n.event == 0 && d.size() >= 5)
                return Event{"thumbwheel", {{"rotation", sbe16(d, 0)}, {"timestamp", be16(d, 2)}, {"status", d[4]}}};
            break;
        case HIRES_WHEEL:
            if (n.event == 0 && d.size() >= 3) return Event{"wheel", {{"hires", (d[0] & 0x10) != 0}, {"delta", sbe16(d, 1)}}};
            if (n.event == 1 && !d.empty()) return Event{"ratchet", {{"ratchet", d[0] != 0}}};
            break;
        case UNIFIED_BATTERY:
            if (n.event == 0) return Event{"battery", decodeBattery(d).toJson()};
            break;
        case BATTERY_STATUS:
            if (n.event == 0) return Event{"battery", decodeBatteryStatus(d).toJson()};
            break;
        case WIRELESS_STATUS:
            return Event{"wireless", {{"reconnect", !d.empty() && d[0] != 0}}};
        case CONFIG_CHANGE:
            return Event{"config_change", json::object()};
        case BACKLIGHT2:
            // Event 0 usually carries the level info ([levels, level, status], as function 2
            // answers). Some firmware also sends the configuration there ([enabled, options, ...],
            // as function 0), e.g. when a charger is plugged in; that reads as nonsense levels
            // ("13 of 0"), so anything that is not a plausible level is a configuration change.
            if (n.event == 0 && d.size() >= 3) {
                if (d[0] >= 2 && d[0] <= 16 && d[1] < d[0]) return Event{"backlight", {{"num_levels", d[0]}, {"level", d[1]}, {"status", d[2]}}};
                return Event{"backlight_config", json::object()};
            }
            break;
        default:
            break;
    }
    return std::nullopt;
}

}  // namespace hidpp
