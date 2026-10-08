#!/usr/bin/env bash
# Formats the agent's C++ lines that changed since a commit (default: origin/master) with .clang-format.
# The existing code keeps its hand-made layout; only new and changed lines are formatted.
#   scripts/format.sh            format the changed lines in place
#   scripts/format.sh --check    show what would change, and fail if anything would
#   scripts/format.sh <commit>   compare with another commit
set -euo pipefail
cd "$(dirname "$0")/.."
check=0 base=origin/master
for a in "$@"; do case "$a" in --check) check=1 ;; *) base="$a" ;; esac; done
command -v git-clang-format > /dev/null || { echo "git-clang-format not found (install clang-format)"; exit 2; }
files=(--extensions cpp,h,mm -- src tests tools)
if [ "$check" = 1 ]; then
    out=$(git clang-format --diff "$base" "${files[@]}" 2>&1 || true)
    case "$out" in
        ""|*"no modified files to format"*|*"did not modify any files"*) echo "agent formatting: ok" ;;
        *) printf '%s\n' "$out"; echo "agent formatting: run agent/scripts/format.sh"; exit 1 ;;
    esac
else
    git clang-format "$base" "${files[@]}"
fi
