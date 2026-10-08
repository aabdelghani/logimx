# Contributing to NotLogi

Thank you for helping. Bug reports, device reports ("my MX ... works / does not"), photos of your
own devices and pull requests are all welcome.

## Licensing of contributions

NotLogi is released under the GNU General Public License, version 3 or later (see LICENSE). Its
author also offers separate commercial licenses to companies that want to build it into a product
without publishing their source; that is what keeps the project's development going.

So that this stays possible, by submitting a contribution you agree that:

1. your contribution is licensed to everyone under GPL-3.0-or-later, like the rest of NotLogi; and
2. you also grant aabdelghani a perpetual, worldwide, non-exclusive, royalty-free license to use,
   change and relicense your contribution, including under commercial licenses; and
3. the contribution is your own work, or you have the right to submit it under these terms.

You keep the copyright in your contribution. Add a `Signed-off-by: Your Name <you@example.com>`
line to your commits (`git commit -s`) to confirm the above.

## Reporting

- **A bug**: in NotLogi, About, Report a problem fills in the details; or use the bug report template.
- **Your device**: the device report template, for "my MX ... works / does not".
- **A wish**: Make a wish on the home screen, or the wish template.
- **A security problem**: privately, as described in [SECURITY.md](SECURITY.md).

## Before opening a pull request

Run every check with one command:

```
scripts/check.sh
```

It runs:

- the app's tests (`cd ui && npm test`: shared logic, ring geometry, pairing, Flow's signing and
  edges, and the rules between the app's layers, see docs/ARCHITECTURE.md);
- the app's lint (`cd ui && npm run lint`, ESLint);
- the agent's build and tests (`ctest --test-dir agent/build`: HID++ against a scripted device, the
  settings file, the scroll smoothing);
- the agent's formatting of the lines you changed (`agent/scripts/format.sh --check`; run
  `agent/scripts/format.sh` to fix them). The existing code keeps its hand-made layout.

`agent/scripts/tidy.sh` runs clang-tidy over the agent for a deeper look; it is slow, so it is not
part of the check.

Also make sure the app still starts and the page you changed looks right, and add a line to the
Unreleased section of [CHANGELOG.md](CHANGELOG.md).

Building and the command line are described in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
