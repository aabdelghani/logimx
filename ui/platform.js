// What the main process does differently on Windows and macOS. Linux keeps its own code paths
// in main.js (systemd, gsettings, xdotool, PipeWire, bluetoothctl); this module answers for the
// other two, so main.js only asks "which OS" at the few places where they differ.
const { app, nativeTheme, systemPreferences, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = !IS_WIN && !IS_MAC;

// Where the agent listens. Must match platform::ipcEndpoint() in the agent.
function agentEndpoint() {
  if (IS_WIN) return '\\\\.\\pipe\\logimx-' + os.userInfo().username.replace(/[^A-Za-z0-9._-]/g, '_');
  if (IS_MAC) return path.join(os.homedir(), 'Library', 'Application Support', 'LogiMX', 'logimx.sock');
  return path.join(process.env.XDG_RUNTIME_DIR || `/run/user/${os.userInfo().uid}`, 'logimx.sock');
}

const AGENT_EXE = IS_WIN ? 'logimx-agent.exe' : 'logimx-agent';

// Is an agent process alive (connected or not)?
function agentRunning() {
  return new Promise(r => {
    if (IS_WIN) execFile('tasklist', ['/FI', `IMAGENAME eq ${AGENT_EXE}`, '/NH'], { windowsHide: true }, (err, out) => r(!err && String(out).toLowerCase().includes(AGENT_EXE)));
    else execFile('pgrep', ['-x', 'logimx-agent'], (err, out) => r(!err && !!String(out).trim()));
  });
}

// Start the agent in the background. It keeps the devices configured after the window closes.
function spawnAgent(bin) {
  const child = spawn(bin, [], { stdio: 'ignore', detached: true, windowsHide: true });
  child.unref();
  return child;
}

// Start at login: a login item on macOS and the HKCU Run key on Windows (Electron's API for
// both). The app then starts its own agent.
function setLoginItem(on) {
  try {
    if (IS_WIN) app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath, args: ['--hidden'] });
    else app.setLoginItemSettings({ openAtLogin: !!on, openAsHidden: true });
  } catch (e) {}
}
function startedAtLogin() {
  if (process.argv.includes('--hidden')) return true;
  try { return IS_MAC && app.getLoginItemSettings().wasOpenedAtLogin; } catch (e) { return false; }
}

// The desktop's light/dark, accent colour and interface font, for the overlays.
function systemLook() {
  let accent = '#0067c0';
  try { const a = systemPreferences.getAccentColor(); if (a && /^[0-9a-f]{6}/i.test(a)) accent = '#' + a.slice(0, 6); } catch (e) {}
  const [r, g, b] = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16));
  const accentFg = (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1b1c1f' : '#ffffff';
  return { dark: nativeTheme.shouldUseDarkColors, accent, accentFg, font: IS_MAC ? '-apple-system' : 'Segoe UI Variable Text, Segoe UI' };
}

function openBluetooth() {
  return shell.openExternal(IS_WIN ? 'ms-settings:bluetooth' : 'x-apple.systempreferences:com.apple.BluetoothSettings');
}

// Other software that drives the same devices (named by the agent's conflict list)
function stopTool(name) {
  return new Promise(resolve => {
    if (IS_WIN) execFile('taskkill', ['/IM', name + '.exe', '/F'], { windowsHide: true }, err => resolve(err ? { ok: false, error: 'could not stop ' + name } : { ok: true }));
    else execFile('pkill', ['-x', name], () => resolve({ ok: true }));
  });
}

// "Windows 11 (10.0.26100)" / "macOS 15.0"
function systemName() {
  if (IS_WIN) { const build = Number((os.release().split('.')[2]) || 0); return `Windows ${build >= 22000 ? 11 : 10} (${os.release()})`; }
  if (IS_MAC) return `macOS ${process.getSystemVersion ? process.getSystemVersion() : os.release()}`;
  return os.type();
}

// The keystroke that pastes in the focused app.
const PASTE_KEYS = IS_MAC ? ['KEY_LEFTMETA', 'KEY_V'] : ['KEY_LEFTCTRL', 'KEY_V'];

// The window type that keeps an overlay out of the taskbar and focus on each OS.
const OVERLAY_TYPE = IS_WIN ? 'toolbar' : IS_MAC ? 'panel' : 'notification';

// macOS asks the person to allow LogiMX to post input events (key and button actions, the key
// recorder). prompt=true opens the system's own dialog pointing at the setting.
function accessibilityTrusted(prompt) {
  if (!IS_MAC) return true;
  try { return systemPreferences.isTrustedAccessibilityClient(!!prompt); } catch (e) { return true; }
}
function openAccessibilitySettings() {
  if (IS_MAC) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
}

module.exports = {
  IS_WIN, IS_MAC, IS_LINUX, AGENT_EXE, PASTE_KEYS, OVERLAY_TYPE,
  agentEndpoint, agentRunning, spawnAgent, setLoginItem, startedAtLogin, systemLook, openBluetooth, stopTool, systemName,
  accessibilityTrusted, openAccessibilitySettings,
};
