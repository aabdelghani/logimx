#!/usr/bin/env bash
# Everything a change should pass, in one command: the app's tests and lint, the agent's build and
# tests, and the agent's formatting of changed lines. Run from anywhere in the repository.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
step() { printf '\n== %s\n' "$*"; }

step "app: tests"
(cd "$root/ui" && npm test --silent)
step "app: lint"
(cd "$root/ui" && npm run --silent lint)
step "agent: build"
cmake -S "$root/agent" -B "$root/agent/build" -DCMAKE_EXPORT_COMPILE_COMMANDS=ON > /dev/null
cmake --build "$root/agent/build" -j"$(nproc 2> /dev/null || echo 4)"
step "agent: tests"
ctest --test-dir "$root/agent/build" --output-on-failure
step "agent: formatting of changed lines"
"$root/agent/scripts/format.sh" --check
printf '\nAll checks passed.\n'
