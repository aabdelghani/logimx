// The scroll smoothing (Options+'s profile): a wheel step is played over a few frames, adds up to
// exactly what the wheel turned, never overshoots, and plays faster the faster the wheel turns.
#include <cmath>

#include "actions/engine.h"
#include "doctest/doctest.h"

using Axis = actions::Smoother::Axis;

// play an axis frame by frame until it is done; the frames and their total
static std::vector<double> play(Axis& a, int maxFrames = 1000) {
    std::vector<double> frames;
    for (int i = 0; i < maxFrames; ++i) {
        double s = a.step();
        if (s == 0 && a.pos == a.target) break;
        frames.push_back(s);
    }
    return frames;
}

TEST_CASE("one notch is played in full, in steps that shrink, without overshooting") {
    Axis a;
    a.push(120, 1000);
    auto f = play(a);
    REQUIRE(f.size() > 2);
    CHECK(a.pos == doctest::Approx(120));
    double sum = 0;
    for (size_t i = 0; i < f.size(); ++i) {
        sum += f[i];
        CHECK(sum <= 120 + 1e-9);
        CHECK(f[i] > 0);
        if (i > 1) CHECK(f[i] <= f[i - 1] + 1e-9);
    }
}

TEST_CASE("the first frame plays only part of the step") {
    Axis a;
    a.push(120, 1000);
    double first = a.step();
    CHECK(first > 0);
    CHECK(first < 120 * 0.6 + 1e-9);
}

TEST_CASE("a fast spin plays each step faster than a lone notch") {
    Axis slow;
    slow.push(120, 1000);
    double g1 = slow.gain;
    Axis fast;
    for (int i = 0; i < 6; ++i) fast.push(120, 1000 + i * 8.0);   // a notch every 8 ms
    CHECK(fast.gain > g1);
}

TEST_CASE("turning back the other way scrolls back, and nothing is left over") {
    Axis a;
    a.push(120, 1000);
    play(a, 3);
    a.push(-240, 1020);
    play(a);
    CHECK(a.pos == doctest::Approx(-120));
    CHECK(a.target == doctest::Approx(-120));
}
