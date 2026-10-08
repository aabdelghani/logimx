#!/usr/bin/env bash
# Runs clang-tidy (.clang-tidy) over the agent's sources built here, a few files at a time, using
# build/compile_commands.json.
#   scripts/tidy.sh            every source in the build
#   scripts/tidy.sh file...    only those
set -uo pipefail
cd "$(dirname "$0")/.."
tidy=$(command -v clang-tidy || command -v clang-tidy-18 || command -v clang-tidy-17 || true)
[ -n "$tidy" ] || { echo "clang-tidy not found"; exit 2; }
[ -f build/compile_commands.json ] || cmake -S . -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON > /dev/null
if [ $# -gt 0 ]; then printf '%s\n' "$@"; else
    python3 -c 'import json; [print(f) for f in sorted({e["file"] for e in json.load(open("build/compile_commands.json")) if "/third_party/" not in e["file"]})]'
fi | xargs -P "$(nproc 2> /dev/null || echo 4)" -I{} sh -c '"$0" -p build --quiet "$1" 2>&1 | grep -v -e "warnings generated" -e "Use -header-filter" -e "^Suppressed "' "$tidy" {}
