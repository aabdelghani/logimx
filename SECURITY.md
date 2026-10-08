# Security policy

## Supported versions

Only the latest release gets security fixes. Please update before reporting.

## Reporting a vulnerability

Please do not open a public issue. Report it privately instead:
[Report a vulnerability](https://github.com/aabdelghani/notlogi/security/advisories/new) on GitHub.

Say what is affected, how to reproduce it, and what an attacker could do with it. You will get an
answer within a week, and a fix or a plan within 30 days for anything confirmed. You will be credited
in the release notes unless you prefer not to be.

## What is in scope

- **Flow**, which talks to other computers on the local network: discovery over UDP, messages over TCP
  on port 24871, pairing, and the signing of messages with the key shared when two computers pair.
- **The background agent**: its local socket (a UNIX socket on Linux and macOS, a named pipe on
  Windows), the actions it runs for buttons and keys, and the configuration it reads.
- **The Linux permissions** NotLogi installs: the udev rule giving access to `/dev/hidraw*` and
  `/dev/uinput`.
- **The release builds** published on GitHub.

Bugs in Electron, the operating system or the devices' firmware are out of scope; please report those
to their projects.
