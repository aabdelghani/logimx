// Starting with the session: the agent's user service and the window's autostart entry.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const plat = require('../platform');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder

// from the other parts of the main process, filled in by link()
let APPIMAGE, PACKAGED, WM_CLASS, launchCmd, loadUi, resPath;
exports.link = ctx => { ({ APPIMAGE, PACKAGED, WM_CLASS, launchCmd, loadUi, resPath } = ctx); };

// Artefacts left by an older name of the project: a stale enabled unit points at a binary
// that no longer exists and quietly fails at login.
const LEGACY_NAMES = ['openoptions'];
function cleanupLegacyAutostart() {
  const autostartDir = path.join(os.homedir(), '.config', 'autostart');
  const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  for (const n of LEGACY_NAMES) {
    try { fs.unlinkSync(path.join(autostartDir, n + '.desktop')); } catch (e) {}
    const u = path.join(unitDir, n + '.service');
    try { if (!fs.existsSync(u)) continue; } catch (e) { continue; }
    execFile('systemctl', ['--user', 'disable', '--now', n + '.service'], () => {
      try { fs.unlinkSync(u); } catch (e) {}
      execFile('systemctl', ['--user', 'daemon-reload'], () => {});
    });
  }
}

// Re-apply the login setting every time the app starts, so a rename, a moved checkout or a
// hand-edited unit cannot leave 'start at login' switched on but broken.
function ensureAutostart() {
  if (!plat.IS_LINUX) { try { if (loadUi().autostart) plat.setLoginItem(true); } catch (e) {} return; }
  cleanupLegacyAutostart();
  // a unit written by an AppImage points into a mount that no longer exists: rewrite or drop it
  try {
    const unitPath = path.join(os.homedir(), '.config', 'systemd', 'user', 'logimx.service');
    const cur = fs.readFileSync(unitPath, 'utf8');
    const m = /^ExecStart=(.*)$/m.exec(cur);
    if (m && !fs.existsSync(m[1].trim())) { fs.unlinkSync(unitPath); execFile('systemctl', ['--user', 'daemon-reload'], () => {}); }
  } catch (e) {}
  try { if (loadUi().autostart) setAutostart(true); } catch (e) {}
}

// A path that will still exist at the next login. The agent inside an AppImage lives on a
// temporary mount that disappears when the app quits, so it can never go into a unit file.
function stableAgentBin() {
  const c = ['/usr/bin/logimx-agent', '/usr/local/bin/logimx-agent', path.join(os.homedir(), '.local', 'bin', 'logimx-agent')];
  if (!PACKAGED) c.push(path.join(ROOT, '..', 'agent', 'build', 'logimx-agent'));
  else if (!APPIMAGE) c.push(resPath('agent', 'logimx-agent'));
  for (const p of c) { try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) {} }
  return null;
}

// true when a unit exists but its ExecStart no longer resolves, e.g. one written by a previous
// AppImage run into a mount that is long gone
function unitPointsAtMissingBinary(unitPath) {
  try {
    const m = /^ExecStart=(.*)$/m.exec(fs.readFileSync(unitPath, 'utf8'));
    if (!m) return true;
    fs.accessSync(m[1].trim(), fs.constants.X_OK);
    return false;
  } catch (e) {
    return fs.existsSync(unitPath);
  }
}

function removeAgentUnit(unitPath) {
  execFile('systemctl', ['--user', 'disable', '--now', 'logimx.service'], () => {
    try { fs.unlinkSync(unitPath); } catch (e) {}
    execFile('systemctl', ['--user', 'daemon-reload'], () => {});
  });
}

function setAutostart(on) {
  if (!plat.IS_LINUX) return plat.setLoginItem(on);
  cleanupLegacyAutostart();
  const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  const unitPath = path.join(unitDir, 'logimx.service');
  const agentBin = on ? stableAgentBin() : null;
  if (agentBin) {
    const unit = `[Unit]\nDescription=NotLogi agent for MX Master and MX Keys devices\nAfter=graphical-session.target\nPartOf=graphical-session.target\n\n[Service]\nType=simple\nExecStart=${agentBin}\nRestart=on-failure\nRestartSec=2\n\n[Install]\nWantedBy=graphical-session.target\n`;
    try {
      fs.mkdirSync(unitDir, { recursive: true });
      fs.writeFileSync(unitPath, unit);
      execFile('systemctl', ['--user', 'daemon-reload'], () => execFile('systemctl', ['--user', 'enable', 'logimx.service'], () => {}));
    } catch (e) {}
  } else if (unitPointsAtMissingBinary(unitPath)) {
    // nothing durable to point a unit at, and the one on disk is already broken. The desktop
    // entry starts the app, which starts its own agent, so drop the unit rather than let it
    // fail at every login. A unit that still resolves belongs to another install: leave it.
    removeAgentUnit(unitPath);
  }
  const autostartDir = path.join(os.homedir(), '.config', 'autostart'), desktop = path.join(autostartDir, 'logimx.desktop');
  if (on) { try { fs.mkdirSync(autostartDir, { recursive: true }); fs.writeFileSync(desktop, `[Desktop Entry]\nType=Application\nName=NotLogi\nIcon=notlogi\nExec=${launchCmd()} --hidden\nStartupWMClass=${WM_CLASS}\nX-GNOME-Autostart-enabled=true\n`); } catch (e) {} }
  else { try { fs.unlinkSync(desktop); } catch (e) {} }
}
function ensureDesktopEntry() {
  if (!plat.IS_LINUX) return;          // the installer made the shortcuts
  if (PACKAGED && !APPIMAGE) return;   // the .deb installs its own entry
  try {
    const iconDir = path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor', '256x256', 'apps');
    const appDir = path.join(os.homedir(), '.local', 'share', 'applications');
    fs.mkdirSync(iconDir, { recursive: true }); fs.mkdirSync(appDir, { recursive: true });
    // the icon goes by the name notlogi: the desktop keeps an icon it has shown by its name until the
    // next login, so the old penguin (named logimx) would stay in the dock after an update
    const iconSrc = path.join(ROOT, 'assets', 'icon.png'), iconDst = path.join(iconDir, 'notlogi.png');
    if (!fs.existsSync(iconDst) || fs.statSync(iconDst).size !== fs.statSync(iconSrc).size) fs.copyFileSync(iconSrc, iconDst);
    try { fs.unlinkSync(path.join(iconDir, 'logimx.png')); } catch (e) {}
    const entry = `[Desktop Entry]\nType=Application\nName=NotLogi\nComment=Unofficial mouse & keyboard tools for Linux\nExec=${launchCmd()}\nIcon=notlogi\nTerminal=false\nCategories=Settings;HardwareSettings;\nKeywords=mouse;keyboard;MX;Bolt;\nStartupWMClass=${WM_CLASS}\nStartupNotify=true\n`;
    const dst = path.join(appDir, 'logimx.desktop');
    let cur = ''; try { cur = fs.readFileSync(dst, 'utf8'); } catch (e) {}
    if (cur !== entry) { fs.writeFileSync(dst, entry); execFile('update-desktop-database', [appDir], () => {}); execFile('gtk-update-icon-cache', ['-f', '-t', path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor')], () => {}); }
  } catch (e) {}
}

exports.provide = { LEGACY_NAMES, cleanupLegacyAutostart, ensureAutostart, stableAgentBin, unitPointsAtMissingBinary, removeAgentUnit, setAutostart, ensureDesktopEntry };
