// The settings file: defaults for a new device, settings and assignments kept across restarts,
// application profiles, backups, and a damaged file cleaned up on load.
#include <filesystem>
#include <fstream>

#include "config.h"
#include "doctest/doctest.h"
#include "tmpdirs.h"

TEST_CASE("a known device starts from its own defaults: hi-res wheel off, ratchet, its buttons") {
    testdirs::fresh();
    Config c;
    json& d = c.device(0xB042, "mouse");   // MX Master 4
    CHECK(d["settings"]["hires"]["enabled"] == false);
    CHECK(d["settings"]["smartshift"]["mode"] == "ratchet");
    CHECK(d["profiles"]["default"]["buttons"]["416"] == "action_ring");   // the haptic panel
}

TEST_CASE("an unknown mouse or keyboard gets an empty default profile") {
    testdirs::fresh();
    Config c;
    CHECK(c.device(0x1234, "mouse")["profiles"]["default"]["thumbwheel"] == "native");
    CHECK(c.device(0x1235, "keyboard")["profiles"]["default"]["keys"].is_object());
}

TEST_CASE("settings and assignments are saved and read back by a new Config") {
    testdirs::fresh();
    {
        Config c;
        c.setSetting(0xB042, {"smartshift", "threshold"}, 20);
        c.setAssignment(0xB042, "default", "buttons", "83", "copy");
        c.setAssignment(0xB042, "default", "thumbwheel", "", "volume_wheel");
    }
    Config again;
    json& d = again.device(0xB042, "mouse");
    CHECK(d["settings"]["smartshift"]["threshold"] == 20);
    CHECK(d["settings"]["smartshift"]["mode"] == "ratchet");   // the rest of the setting is kept
    CHECK(d["profiles"]["default"]["buttons"]["83"] == "copy");
    CHECK(d["profiles"]["default"]["thumbwheel"] == "volume_wheel");
}

TEST_CASE("an application's profile is chosen by its window class, case-insensitively; others get the default") {
    testdirs::fresh();
    Config c;
    c.setAssignment(0xB042, "writer", "buttons", "83", "undo");
    c.device(0xB042, "mouse")["profiles"]["writer"]["match"] = json::array({"libreoffice-writer"});
    auto [name, p] = c.profileFor(0xB042, "LibreOffice-Writer");
    CHECK(name == "writer");
    CHECK(p["buttons"]["83"] == "undo");
    CHECK(c.profileFor(0xB042, "firefox").first == "default");
    CHECK(c.profileFor(0xB042, "").first == "default");
}

TEST_CASE("a backup restores the settings it was taken from; a path outside the backups is refused") {
    testdirs::fresh();
    Config c;
    c.setSetting(0xB042, {"dpi"}, 1600);
    std::string file = c.backup("test");
    REQUIRE_FALSE(file.empty());
    c.setSetting(0xB042, {"dpi"}, 800);
    std::string name = std::filesystem::path(file).filename().string();
    REQUIRE(c.restoreBackup(name));
    CHECK(c.device(0xB042, "mouse")["settings"]["dpi"] == 1600);
    CHECK_FALSE(c.restoreBackup("../config.json"));
    CHECK(c.listBackups().size() >= 2);   // the restore keeps a backup of what it replaced
}

TEST_CASE("a damaged device entry is dropped on load, and the action ring gets its defaults") {
    std::string dir = testdirs::fresh();
    {
        std::filesystem::create_directories(dir + "/config/logimx");
        std::ofstream(dir + "/config/logimx/config.json") << R"({"devices": {"b042": "broken", "b378": {"settings": {}, "profiles": {}}}, "general": {}})";
    }
    Config c;
    CHECK_FALSE(c.data()["devices"].contains("b042"));
    CHECK(c.data()["devices"].contains("b378"));
    CHECK(c.data()["general"]["ring"]["profiles"].size() >= 1);
}
