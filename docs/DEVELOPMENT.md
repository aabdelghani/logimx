# Developing NotLogi

The technical side of NotLogi: how it works, what it needs, how to build it, and the command line.

## How it works

A native agent owns the devices in the background. The desktop app talks to it over a local socket.

![Architecture](architecture.png)

The agent talks HID++ to the receiver or to a Bluetooth device. It diverts the controls that are
customised, so the device reports them to the agent instead of sending its own key, and performs
the chosen action through a virtual input device. Because this happens below the compositor, it
works the same on X11 and Wayland.

```
agent/          C++20 agent: HID++ 1.0 and 2.0, actions, focus tracking, JSON RPC. One codebase:
                Linux uses hidraw, uinput and a UNIX socket; Windows uses hidapi, SendInput and a
                named pipe; macOS uses hidapi, Quartz events and a UNIX socket (src/platform/).
ui/             Electron app in plain HTML, CSS and JavaScript, built as MVVM (ARCHITECTURE.md).
logimx/         Python version of the agent with the same RPC and settings format, kept as a
                reference and for scripting.
udev/           Access rule for hidraw and uinput.
systemd/        User service for the agent.
packaging/      .deb build.
```

## Requirements

On Windows and macOS: Windows 10 or 11 (x64), or macOS 11 or newer. Nothing else.

On Linux:

- The kernel's HID++ receiver drivers (included in mainstream distributions)
- Read and write access to `/dev/hidraw*` and `/dev/uinput`, given by `udev/60-logimx.rules`
  (installed by the .deb and by the first-run wizard)
- On GNOME, the tray icon needs the AppIndicator extension (`gnome-shell-extension-appindicator`),
  which Ubuntu ships enabled

Other tools that divert the same buttons, such as Solaar or logid, should not run at the same time.

## Build from source

Needs g++ 11 or newer, cmake, ninja, libx11-dev and Node.js 18 or newer.

```
./run-agent.sh -v            # terminal 1: builds the agent on first run and logs to the terminal
./run-ui.sh                  # terminal 2: the window and the tray icon (--hidden starts in the tray)
```

Install for the current user (agent in `~/.local/bin`, systemd user service):

```
./install.sh
sudo cp udev/60-logimx.rules /etc/udev/rules.d/ && sudo udevadm control --reload && sudo udevadm trigger
```

Packages: `packaging/deb/build.sh` for the .deb, `cd ui && npm run dist:appimage` for the AppImage.

Checks: `scripts/check.sh` runs the app's tests and lint, the agent's build and tests (`ctest --test-dir agent/build`)
and the formatting of changed agent lines; see [CONTRIBUTING.md](../CONTRIBUTING.md).

Windows (from Windows, or cross-compiled from Linux with [llvm-mingw](https://github.com/mstorsjo/llvm-mingw)):

```
cmake -S agent -B agent/build -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_TOOLCHAIN_FILE=agent/cmake/mingw-w64-x86_64.cmake -DLLVM_MINGW=/path/to/llvm-mingw   # from Linux only
cmake --build agent/build
cd ui && npm run dist:win          # ui/dist/NotLogi-Setup-<version>.exe
```

macOS (Xcode command line tools, cmake, Node.js):

```
cmake -S agent -B agent/build -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64"
cmake --build agent/build
cd ui && npm run dist:mac          # ui/dist/NotLogi-<version>-arm64.dmg and -x64.dmg
```

CI builds all three on every tag (`.github/workflows/release.yml`).

## Pairing to a Bolt receiver

Use "Pair a device" in the menu. If the device is also known to Bluetooth on the same computer, the
pairing can fail a few seconds after the passcode is typed, because BlueZ keeps trying to reach the
device on the same radio band. In that case pair with Bluetooth switched off:

```
./pair-bolt.sh
```

It turns Bluetooth off, waits for the device, shows the passcode, and turns Bluetooth back on when
it exits.

## Command line

```
logimxctl devices
logimxctl set b034 dpi 1600
logimxctl set b034 smartshift.threshold 20
logimxctl set b378 backlight.mode manual
logimxctl set b378 backlight.level 5
logimxctl assign b034 buttons 195 gesture_windows
logimxctl assign b034 thumbwheel - volume_wheel
logimxctl assign b378 keys 264 emoji_picker
logimxctl host b378 2
logimxctl presets
```

Settings are kept in `~/.config/logimx/config.json`. Devices are identified by product id (see
[Supported devices](../README.md#supported-devices)) and controls by their HID++ control id.
