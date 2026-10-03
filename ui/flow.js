// LogiMX Flow: share the mouse, keyboard and clipboard with other computers on the LAN.
//
// LogiMX does not speak any device maker's protocol here. It drives Deskflow, the
// open-source software KVM (the Barrier/Synergy fork, GPL-2.0), as a child process:
// LogiMX writes Deskflow's config and runs its server silently, so the person only ever
// sees LogiMX. This computer is the server (it owns the mouse and keyboard); other
// computers join as Deskflow clients and connect to this computer's address.
//
// Everything is wrapped so Deskflow's own window never opens. The config LogiMX writes
// lives under LogiMX's own directory and never touches a manual Deskflow setup.

const { app, ipcMain } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_ID = 'org.deskflow.deskflow';
const PORT = 24800;                 // Deskflow / Barrier default
const POS = { left: 'left', right: 'right', up: 'up', down: 'down' };
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

let win = null;                     // main window, for pushing flow-event
let getUi = null, setUi = null;     // ui-settings load/save, injected from main.js
let child = null;                   // the running deskflow-core server (the flatpak wrapper)
let lastSettings = '';              // the -s path, unique to us, used to find the real core process
let installing = null;              // the running flatpak install, if any
let lastStatus = 'stopped';         // stopped | starting | running | peer | error
let peerConnected = false;

// The Deskflow flatpak is sandboxed: it can only read files under its own app data, not
// arbitrary paths. So LogiMX writes its Flow config into a `logimx` subfolder of
// Deskflow's own config tree (separate from the user's Deskflow.conf), which the sandbox
// can read. A native (non-flatpak) Deskflow would read from anywhere, so fall back to
// LogiMX's userData there.
function flowDir() {
  let d;
  if (installed === 'flatpak') d = path.join(os.homedir(), '.var/app', APP_ID, 'config/Deskflow/logimx');
  else d = path.join(app.getPath('userData'), 'flow');
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
  return d;
}

// a sensible default screen name: the hostname, trimmed to what Deskflow accepts
function defaultName() {
  return (os.hostname() || 'this-pc').split('.')[0].replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 30) || 'this-pc';
}

// the LAN address others connect to: the first non-internal IPv4 that is not a
// container/VM bridge (docker/virbr/br-)
function lanIp() {
  const ifs = os.networkInterfaces();
  const skip = /^(docker|virbr|br-|veth|vmnet|tun|tap)/;
  for (const [name, addrs] of Object.entries(ifs)) {
    if (skip.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '';
}

function flowCfg() {
  const ui = getUi ? getUi() : {};
  const f = ui.flow || {};
  return {
    name: f.name || defaultName(),
    peers: Array.isArray(f.peers) ? f.peers : [],   // [{ name, pos }]
    clipboard: f.clipboard !== false,
  };
}

function saveCfg(patch) {
  const cur = flowCfg();
  const next = Object.assign({}, cur, patch || {});
  if (setUi) setUi({ flow: next });
  return next;
}

// Is Deskflow present, and how? `installed` is one of:
//   null          not checked yet
//   false         not installed
//   'flatpak'     the org.deskflow.deskflow flatpak
//   '<path>'      a native deskflow-core / deskflow-server binary
let installed = null;
function checkInstalled(cb) {
  if (installed !== null) return cb(installed);
  execFile('flatpak', ['info', APP_ID], { timeout: 4000 }, err => {
    if (!err) { installed = 'flatpak'; return cb(installed); }
    execFile('sh', ['-c', 'command -v deskflow-core || command -v deskflow-server'], { timeout: 4000 }, (e2, out) => {
      installed = e2 ? false : (out.trim().split('\n')[0] || false);
      cb(installed);
    });
  });
}
// the argv to run deskflow-core in the given mode with the given settings file
function coreArgv(mode, settingsPath) {
  if (installed === 'flatpak') return ['flatpak', ['run', '--command=deskflow-core', APP_ID, mode, '--new-instance', '-s', settingsPath]];
  const bin = installed.endsWith('deskflow-server') ? installed.replace(/-server$/, '-core') : installed;
  return [bin, [mode, '--new-instance', '-s', settingsPath]];
}

function push(status, detail) {
  lastStatus = status;
  if (win && !win.isDestroyed()) win.webContents.send('flow-event', { status, detail: detail || '', peer: peerConnected });
}

// Deskflow's server config (the Barrier text format): one screen per computer, and the
// edge links between them. Links are symmetric: if a peer sits to our right, we also sit
// to its left.
function serverConf(cfg) {
  const me = cfg.name;
  const peers = cfg.peers.filter(p => p && p.name);
  const screens = [me].concat(peers.map(p => p.name));
  let out = 'section: screens\n';
  for (const s of screens) out += `\t${s}:\n`;
  out += 'end\n\nsection: links\n';
  // this computer's edges to each peer
  out += `\t${me}:\n`;
  for (const p of peers) if (POS[p.pos]) out += `\t\t${POS[p.pos]} = ${p.name}\n`;
  // each peer's edge back to us
  for (const p of peers) {
    out += `\t${p.name}:\n`;
    if (POS[p.pos]) out += `\t\t${OPPOSITE[p.pos]} = ${me}\n`;
  }
  out += 'end\n\nsection: options\n';
  out += `\tclipboardSharing = ${cfg.clipboard ? 'true' : 'false'}\n`;
  out += '\tswitchCorners = none\n\tswitchCornerSize = 0\n';
  out += 'end\n';
  return out;
}

// the QSettings INI Deskflow reads with -s: point it at our server config, keep its own
// state out of the user's Deskflow
function settingsConf(cfg, serverPath) {
  return [
    '[core]',
    `computerName=${cfg.name}`,
    'coreMode=1',
    '',
    '[internalConfig]',
    `clipboardSharing=${cfg.clipboard ? 'true' : 'false'}`,
    '',
    '[server]',
    'externalConfig=true',
    `externalConfigFile=${serverPath}`,
    '',
  ].join('\n');
}

function writeConfigs(cfg) {
  const dir = flowDir();
  // Deskflow server mode loads <settings-dir>/deskflow-server.conf by name, so that is
  // what the server config must be called; externalConfigFile is belt-and-braces.
  const serverPath = path.join(dir, 'deskflow-server.conf');
  const settingsPath = path.join(dir, 'flow.conf');
  fs.writeFileSync(serverPath, serverConf(cfg));
  fs.writeFileSync(settingsPath, settingsConf(cfg, serverPath));
  return settingsPath;
}

function running() { return !!(child && !child.killed); }

function start() {
  if (running()) return { ok: true, already: true };
  const cfg = flowCfg();
  if (!cfg.peers.some(p => p && p.name)) return { ok: false, error: 'Add a computer first.' };
  let settingsPath;
  try { settingsPath = writeConfigs(cfg); } catch (e) { push('error', 'Could not write the Flow config.'); return { ok: false, error: String(e) }; }
  lastSettings = settingsPath;
  peerConnected = false;
  push('starting');
  let p;
  try {
    const [cmd, args] = coreArgv('server', settingsPath);
    // Own process group: the flatpak child runs deskflow-core under bwrap, so killing the
    // wrapper alone leaves it running. Starting a group lets stop() take down the whole tree.
    p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  } catch (e) { push('error', 'Could not start Flow.'); return { ok: false, error: String(e) }; }
  child = p;
  const line = buf => {
    const s = buf.toString();
    // Deskflow logs client connect/disconnect; surface those as status
    if (/client "?[^"]*"? has connected|entering screen|connected to server/i.test(s)) { peerConnected = true; push('peer'); }
    else if (/client "?[^"]*"? has disconnected|has disconnected/i.test(s)) { peerConnected = false; push('running'); }
    else if (/started server|server started|accepting clients/i.test(s) && lastStatus === 'starting') push('running');
  };
  p.stdout.on('data', line);
  p.stderr.on('data', line);
  // if nothing told us otherwise, the server is up a moment after it launches
  setTimeout(() => { if (running() && lastStatus === 'starting') push('running'); }, 1500);
  p.on('error', () => { child = null; push('error', 'Flow failed to start.'); });
  p.on('exit', code => { child = null; peerConnected = false; push(code && code !== 0 && code !== 143 ? 'error' : 'stopped'); });
  return { ok: true };
}

function killChild() {
  const settings = lastSettings;
  if (child) {
    const pid = child.pid;
    // kill the wrapper's whole group (covers a native deskflow-core cleanly)
    try { process.kill(-pid, 'SIGTERM'); } catch (e) { try { child.kill('SIGTERM'); } catch (e2) {} }
    setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch (e) {} }, 1200);
    child = null;
  }
  // The flatpak sandbox runs deskflow-core in its own session, so the group kill can't
  // reach it. Target exactly our instance by the settings path we passed (unique to us,
  // so a manual Deskflow the person may be running is left alone).
  if (settings) { try { execFile('pkill', ['-f', 'deskflow-core .*' + settings.replace(/[.[\]]/g, '\\$&')]); } catch (e) {} }
}

function stop() {
  killChild();
  peerConnected = false; push('stopped');
  return { ok: true };
}

function install() {
  if (installing) return { ok: true, already: true };
  push('installing');
  let p;
  try { p = spawn('flatpak', ['install', '-y', '--noninteractive', 'flathub', APP_ID], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { push('error', 'Could not run flatpak.'); return { ok: false, error: String(e) }; }
  installing = p;
  const line = buf => { const s = buf.toString().trim(); if (s) push('installing', s.split('\n').pop().slice(0, 80)); };
  p.stdout.on('data', line); p.stderr.on('data', line);
  p.on('exit', code => {
    installing = null; installed = null;
    checkInstalled(ok => push(ok ? 'stopped' : 'error', ok ? 'Flow support installed.' : 'Install did not complete.'));
  });
  return { ok: true };
}

function info() {
  return new Promise(resolve => {
    checkInstalled(ok => {
      const cfg = flowCfg();
      resolve({ installed: ok, ip: lanIp(), port: PORT, name: cfg.name, peers: cfg.peers,
        clipboard: cfg.clipboard, running: running(), status: lastStatus, peer: peerConnected, installing: !!installing });
    });
  });
}

// wiring --------------------------------------------------------------------
function init(opts) {
  win = opts.win;
  getUi = opts.getUi;
  setUi = opts.setUi;
  ipcMain.handle('flow-info', () => info());
  ipcMain.handle('flow-config', (_e, patch) => saveCfg(patch));
  ipcMain.handle('flow-start', () => start());
  ipcMain.handle('flow-stop', () => stop());
  ipcMain.handle('flow-install', () => install());
}

function setWindow(w) { win = w; }
function shutdown() { stop(); }

module.exports = { init, setWindow, shutdown };
