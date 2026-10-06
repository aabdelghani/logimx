# Contributing to NotLogi

Thank you for helping. Bug reports, device reports ("my MX ... works / does not"), photos of your
own devices and pull requests are all welcome.

## Licensing of contributions

NotLogi is released under the GNU General Public License, version 3 or later (see LICENSE). Its
author also offers separate commercial licenses to companies that want to build it into a product
without publishing their source; that is what keeps the project's development going.

So that this stays possible, by submitting a contribution you agree that:

1. your contribution is licensed to everyone under GPL-3.0-or-later, like the rest of NotLogi; and
2. you also grant Ahmed Abdelghany a perpetual, worldwide, non-exclusive, royalty-free license to use,
   change and relicense your contribution, including under commercial licenses; and
3. the contribution is your own work, or you have the right to submit it under these terms.

You keep the copyright in your contribution. Add a `Signed-off-by: Your Name <you@example.com>`
line to your commits (`git commit -s`) to confirm the above.

## Before opening a pull request

- `cd ui && npm test` passes (shared logic, ring geometry and the rules between the app's layers;
  see docs/ARCHITECTURE.md).
- The app still starts and the page you changed looks right.
