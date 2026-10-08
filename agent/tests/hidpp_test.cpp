// The HID++ transport: how requests are framed, and how replies, errors, silence and the device's
// own notifications come back.
#include <atomic>
#include <condition_variable>
#include <optional>

#include "doctest/doctest.h"
#include "fake_hidpp.h"

using namespace hidpp;

static fake::Feature echo(uint16_t id) {
    return {id, 0, 0, [](uint8_t fn, const Bytes& p) -> fake::Reply { Bytes r = {fn}; r.insert(r.end(), p.begin(), p.begin() + 3); return {r}; }};
}

TEST_CASE("a request goes out as a HID++ 2.0 frame and its reply comes back as the payload") {
    auto dev = std::make_unique<fake::Device>(std::vector<fake::Feature>{echo(0x1234)}, 0x01, 0x03);
    auto* d = dev.get();
    Transport t(std::move(dev), nullptr, 1.0);
    Bytes r = t.request(0x01, 1, 0x2, {0xAA, 0xBB, 0xCC});
    REQUIRE(d->written.size() == 1);
    const Bytes& f = d->written[0];
    CHECK(f.size() == kShortLen);          // three parameters fit a short report over USB
    CHECK(f[0] == kShort);
    CHECK(f[1] == 0x01);                   // device index
    CHECK(f[2] == 1);                      // feature index
    CHECK(f[3] == ((0x2 << 4) | kSwId));   // function and software id
    CHECK(r[0] == 0x2);
    CHECK(r[1] == 0xAA);
    CHECK(r[3] == 0xCC);
}

TEST_CASE("more than three parameters, or Bluetooth, use a long report") {
    auto dev = std::make_unique<fake::Device>(std::vector<fake::Feature>{echo(0x1234)}, 0xFF, 0x05);
    auto* d = dev.get();
    Transport t(std::move(dev), nullptr, 1.0);
    t.request(0xFF, 1, 0, {1});
    CHECK(d->written.back()[0] == kLong);
    CHECK(d->written.back().size() == kLongLen);
}

TEST_CASE("a HID++ error reply raises HidppError with its code") {
    fake::Feature bad{0x2201, 0, 0, [](uint8_t, const Bytes&) { return fake::Reply::err(0x02); }};
    Transport t(std::make_unique<fake::Device>(std::vector<fake::Feature>{bad}), nullptr, 1.0);
    try {
        t.request(0xFF, 1, 0);
        FAIL("no error raised");
    } catch (const HidppError& e) {
        CHECK(e.code == 0x02);
        CHECK(e.featureIndex == 1);
    }
}

TEST_CASE("no reply in time raises Timeout") {
    auto dev = std::make_unique<fake::Device>(std::vector<fake::Feature>{echo(0x1234)});
    dev->silent = true;
    Transport t(std::move(dev), nullptr, 0.1);
    CHECK_THROWS_AS(t.request(0xFF, 1, 0), Timeout);
}

TEST_CASE("ping reports the protocol version") {
    Transport t(std::make_unique<fake::Device>(std::vector<fake::Feature>{}), nullptr, 1.0);
    auto v = t.ping(0xFF);
    REQUIRE(v);
    CHECK(v->first == 4);
    CHECK(v->second == 5);
}

TEST_CASE("a frame the device sends on its own reaches the callback as a notification") {
    auto dev = std::make_unique<fake::Device>(std::vector<fake::Feature>{echo(0x1234)});
    auto* d = dev.get();
    std::mutex m;
    std::condition_variable cv;
    std::optional<Notification> got;
    Transport t(std::move(dev), [&](const Notification& n) { std::lock_guard<std::mutex> lk(m); got = n; cv.notify_all(); }, 1.0);
    d->notify(3, 0x1, {0x55, 0x66});
    std::unique_lock<std::mutex> lk(m);
    REQUIRE(cv.wait_for(lk, std::chrono::seconds(2), [&] { return got.has_value(); }));
    CHECK(got->featureIndex == 3);
    CHECK(got->event == 0x1);
    CHECK(got->data[0] == 0x55);
}
