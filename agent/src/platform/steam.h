#pragma once
#include <set>
#include <string>
#include <vector>

#include "platform.h"

namespace platform {

// Append the games found under each steamapps folder in roots (plus the extra library
// folders its libraryfolders.vdf names) as {id: "steam:<appid>", name, url, source: "steam"}.
void scanSteamGames(json& out, std::set<std::string>& seen, std::vector<std::string> roots);

}  // namespace platform
