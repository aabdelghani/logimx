// A fresh, empty settings and state folder for one test, so nothing touches the real ones.
#pragma once
#include <cstdlib>
#include <filesystem>
#include <random>
#include <string>
#include <vector>

namespace testdirs {

// the folders made so far, removed when the tests end
inline std::vector<std::filesystem::path>& made() {
    static std::vector<std::filesystem::path> v;
    static bool registered = [] { return std::atexit([] { std::error_code ec; for (auto& d : made()) std::filesystem::remove_all(d, ec); }) == 0; }();
    (void)registered;
    return v;
}

inline std::string fresh() {
    std::random_device rd;
    auto dir = std::filesystem::temp_directory_path() / ("notlogi-test-" + std::to_string(rd()) + std::to_string(rd()));
    made().push_back(dir);
    std::filesystem::create_directories(dir / "config");
    std::filesystem::create_directories(dir / "state");
#ifdef _WIN32
    _putenv_s("APPDATA", dir.string().c_str());
    _putenv_s("LOCALAPPDATA", dir.string().c_str());
#else
    setenv("XDG_CONFIG_HOME", (dir / "config").c_str(), 1);
    setenv("XDG_STATE_HOME", (dir / "state").c_str(), 1);
    setenv("HOME", dir.c_str(), 1);
#endif
    return dir.string();
}

}  // namespace testdirs
