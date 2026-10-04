// Steam's own library: games installed through Steam, launched with steam://rungameid/<id>
#include "steam.h"

#include <filesystem>
#include <fstream>

namespace platform {

// Steam games have no desktop entry unless someone made a shortcut, so read the library
// directly. They launch through the steam:// handler rather than a .desktop file.
static std::string acfValue(const std::string& text, const std::string& key) {
    std::string needle = "\"" + key + "\"";
    size_t i = text.find(needle);
    if (i == std::string::npos) return "";
    i = text.find('"', i + needle.size());          // opening quote of the value
    if (i == std::string::npos) return "";
    size_t e = text.find('"', i + 1);
    return e == std::string::npos ? "" : text.substr(i + 1, e - i - 1);
}

void scanSteamGames(json& out, std::set<std::string>& seen, std::vector<std::string> roots) {
    // extra library folders the user added on other drives
    for (size_t i = 0, n = roots.size(); i < n; ++i) {
        std::ifstream lf(fsPath(roots[i] + "/libraryfolders.vdf"));
        if (!lf) continue;
        std::string line;
        while (std::getline(lf, line)) {
            size_t p1 = line.find("\"path\"");
            if (p1 == std::string::npos) continue;
            size_t a = line.find('"', p1 + 6);
            if (a == std::string::npos) continue;
            size_t b = line.find('"', a + 1);
            if (b == std::string::npos) continue;
            std::string p = line.substr(a + 1, b - a - 1);
            // Windows paths come escaped in the vdf: "D:\\Games\\Steam"
            for (size_t k; (k = p.find("\\\\")) != std::string::npos;) p.erase(k, 1);
            roots.push_back(p + "/steamapps");
        }
    }
    static const char* kSkip[] = {"Proton", "Steam Linux Runtime", "Steamworks Common", "SteamVR", "Steam Runtime"};
    for (auto& dir : roots) {
        std::error_code ec;
        std::filesystem::directory_iterator it(fsPath(dir), ec), end;
        for (; !ec && it != end; it.increment(ec)) {
            std::string fn = fsString(it->path().filename());
            if (fn.rfind("appmanifest_", 0) != 0 || fn.size() < 17) continue;
            std::ifstream f(fsPath(dir + "/" + fn));
            if (!f) continue;
            std::string text((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
            std::string appid = acfValue(text, "appid"), name = acfValue(text, "name");
            if (appid.empty() || name.empty()) continue;
            bool skip = false;
            for (const char* pre : kSkip)
                if (name.rfind(pre, 0) == 0) skip = true;
            if (skip) continue;
            std::string id = "steam:" + appid;
            if (seen.count(id)) continue;
            // some games also ship a real desktop entry; keep that one rather than listing twice
            bool dup = false;
            for (auto& a : out)
                if (a.value("name", "") == name) dup = true;
            if (dup) continue;
            seen.insert(id);
            out.push_back({{"id", id}, {"name", name}, {"icon", "steam"}, {"wm_class", ""},
                           {"url", "steam://rungameid/" + appid}, {"source", "steam"}});
        }
    }
}

}  // namespace platform
