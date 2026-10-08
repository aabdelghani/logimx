// A device over HID++: reading its feature table, name and firmware, the per-serial cache that spares
// a reconnect most of that, and how each setting the app shows is decoded and written.
#include <filesystem>

#include "doctest/doctest.h"
#include "fake_hidpp.h"
#include "tmpdirs.h"

using namespace hidpp;

// an MX Master 4 as the tests see it: name, firmware and serial, plus whatever the test adds
static std::vector<fake::Feature> mouse(std::vector<fake::Feature> extra = {}, uint16_t build = 0x0003) {
    std::vector<fake::Feature> f = {fake::nameFeature("MX Master 4", 3), fake::firmwareFeature("RBM", 0x22, 0x00, build, "5A3C7F21")};
    f.insert(f.end(), extra.begin(), extra.end());
    return f;
}

struct Rig {
    fake::Device* dev;
    std::unique_ptr<Transport> t;
    std::unique_ptr<Device> d;
    explicit Rig(std::vector<fake::Feature> features) {
        auto fd = std::make_unique<fake::Device>(std::move(features));
        dev = fd.get();
        t = std::make_unique<Transport>(std::move(fd), nullptr, 1.0);
        d = std::make_unique<Device>(*t, 0xFF);
    }
};

TEST_CASE("enumerate reads the feature table, name, kind, firmware and serial") {
    testdirs::fresh();
    Rig r(mouse());
    REQUIRE(r.d->enumerate());
    CHECK(r.d->has(DEVICE_NAME));
    CHECK(r.d->has(DEVICE_FW));
    CHECK_FALSE(r.d->has(HIRES_WHEEL));
    CHECK(r.d->name() == "MX Master 4");
    CHECK(r.d->kind() == "mouse");
    CHECK(r.d->firmware() == "RBM 22.00.B0003");
    CHECK(r.d->serial() == "5A3C7F21");
}

TEST_CASE("a device seen before is not read again, unless its firmware changed") {
    testdirs::fresh();
    Rig first(mouse());
    REQUIRE(first.d->enumerate());
    const size_t full = first.dev->written.size();

    Rig again(mouse());
    REQUIRE(again.d->enumerate());
    CHECK(again.dev->written.size() < full);   // the table, name and controls come from the cache
    CHECK(again.d->name() == "MX Master 4");
    CHECK(again.d->features().size() == first.d->features().size());

    Rig updated(mouse({}, 0x0004));   // new firmware: everything is read again
    REQUIRE(updated.d->enumerate());
    CHECK(updated.dev->written.size() == full);
    CHECK(updated.d->firmware() == "RBM 22.00.B0004");
}

TEST_CASE("a device that does not answer as HID++ 2.0 is not enumerated") {
    testdirs::fresh();
    auto fd = std::make_unique<fake::Device>(std::vector<fake::Feature>{});
    fd->silent = true;
    Transport t(std::move(fd), nullptr, 0.1);
    Device d(t, 0xFF);
    CHECK_FALSE(d.enumerate());
}

TEST_CASE("battery: Unified Battery (0x1004) and Battery Status (0x1000)") {
    Battery b = Device::decodeBattery({65, 4, 0, 0});
    CHECK(b.percent == 65);
    CHECK(b.level == "good");
    CHECK_FALSE(b.charging);
    b = Device::decodeBattery({90, 8, 1, 1});
    CHECK(b.charging);
    CHECK(b.externalPower);

    b = Device::decodeBatteryStatus({0, 0, 1});   // the original MX Keys says 0% while charging
    CHECK_FALSE(b.known);
    CHECK(b.charging);
    b = Device::decodeBatteryStatus({40, 0, 3});   // full on the charger
    CHECK(b.percent == 100);
    CHECK(b.level == "full");
    b = Device::decodeBatteryStatus({15, 0, 0});
    CHECK(b.level == "low");
}

TEST_CASE("SmartShift (0x2111): mode, threshold and what can be tuned; setting writes all three") {
    testdirs::fresh();
    Bytes lastSet;
    fake::Feature ss{SMART_SHIFT_ENHANCED, 0, 0, [&](uint8_t fn, const Bytes& p) -> fake::Reply {
                         if (fn == 0) return {{0x01, 14, 50}};   // tunable, default threshold 14, default torque 50
                         if (fn == 1) return {{2, 255, 60}};     // ratchet, threshold 255 (never free-spins), torque 60
                         lastSet = Bytes(p.begin(), p.begin() + 3);
                         return {{}};
                     }};
    Rig r(mouse({ss}));
    REQUIRE(r.d->enumerate());
    auto s = r.d->smartshift();
    REQUIRE(s);
    CHECK(s->mode == 2);
    CHECK(s->threshold == 255);
    CHECK(s->tunable);
    CHECK(s->defaultThreshold == 14);
    CHECK(s->torque == 60);
    r.d->setSmartshift(2, 20, 0);
    CHECK(lastSet == Bytes{2, 20, 0});
}

TEST_CASE("high-resolution wheel (0x2121): mode bits and capabilities") {
    testdirs::fresh();
    uint8_t mode = 0x06;   // high resolution, inverted
    fake::Feature hr{HIRES_WHEEL, 0, 0, [&](uint8_t fn, const Bytes& p) -> fake::Reply {
                         if (fn == 0) return {{15, 0x0C}};   // multiplier 15, can invert, has a ratchet switch
                         if (fn == 1) return {{mode}};
                         mode = p[0];
                         return {{mode}};
                     }};
    Rig r(mouse({hr}));
    REQUIRE(r.d->enumerate());
    auto h = r.d->hires();
    REQUIRE(h);
    CHECK(h->hires);
    CHECK(h->invert);
    CHECK_FALSE(h->hidppTarget);
    CHECK(h->multiplier == 15);
    CHECK(h->hasInvert);
    CHECK(h->hasRatchetSwitch);
    r.d->setHires(true, false, false);
    CHECK(mode == 0x01);
}

TEST_CASE("DPI (0x2201): current, default and a stepped range") {
    testdirs::fresh();
    fake::Feature dpi{ADJUSTABLE_DPI, 0, 0, [](uint8_t fn, const Bytes&) -> fake::Reply {
                          if (fn == 2) return {{0, 0x03, 0xE8, 0x03, 0xE8}};        // 1000, default 1000
                          return {{0, 0x00, 0xC8, 0xE0, 0x32, 0x1F, 0x40, 0, 0}};   // 200, step 50, 8000
                      }};
    Rig r(mouse({dpi}));
    REQUIRE(r.d->enumerate());
    auto s = r.d->dpi();
    REQUIRE(s);
    CHECK(s->dpi == 1000);
    CHECK(s->def == 1000);
    CHECK(s->stepped);
    CHECK(s->levels == std::vector<int>{200, 8000, 50});
}

TEST_CASE("Easy-Switch (0x1814): switching sends the host and expects no reply; the current host or one out of range is refused") {
    testdirs::fresh();
    std::vector<int> switched;
    fake::Feature ch{CHANGE_HOST, 0, 0, [&](uint8_t fn, const Bytes& p) -> fake::Reply {
                         if (fn == 0) return {{3, 0}};   // three hosts, on the first
                         switched.push_back(p[0]);
                         return {{}};
                     }};
    Rig r(mouse({ch}));
    REQUIRE(r.d->enumerate());
    r.d->changeHost(1);
    // the switch is sent without waiting for a reply: give the fake a moment to see it
    for (int i = 0; i < 50 && switched.empty(); ++i) std::this_thread::sleep_for(std::chrono::milliseconds(10));
    CHECK(switched == std::vector<int>{1});
    r.d->changeHost(0);   // already there: nothing sent
    CHECK(switched.size() == 1);
    CHECK_THROWS(r.d->changeHost(3));
}

TEST_CASE("a feature the device lacks is an error, not a crash") {
    testdirs::fresh();
    Rig r(mouse());
    REQUIRE(r.d->enumerate());
    CHECK_FALSE(r.d->hires());
    CHECK_FALSE(r.d->smartshift());
    CHECK_THROWS_AS(r.d->req(SMART_SHIFT, 0), HidppError);
}
