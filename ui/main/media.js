// Volume and screen brightness, for the ring's dials: PipeWire/PulseAudio, backlight and DDC/CI.
const { ipcMain, app, screen } = require('electron');
const plat = require('../platform');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const state = require('./state');
const t = (s, v) => (state.I18n ? state.I18n.t(s, v) : s);

// from the other parts of the main process, filled in by link()
let resPath, rpc, run;
exports.link = ctx => { ({ resPath, rpc, run } = ctx); };

// the ring's Volume slot: read and set the default output's level (PipeWire's wpctl, else pactl;
// on Windows and macOS the agent's Core Audio)
ipcMain.handle('ring-vol-get', () => !plat.IS_LINUX ? rpc('audio_get').then(a => ({ level: a.volume, muted: !!a.muted })).catch(() => ({ level: 50, muted: false })) : new Promise(res => {
  execFile('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@'], { timeout: 2000 }, (err, out) => {
    if (!err) { const m = /Volume:\s*([\d.]+)/.exec(out || ''); return res({ level: m ? Math.round(parseFloat(m[1]) * 100) : 50, muted: /MUTED/.test(out || '') }); }
    execFile('pactl', ['get-sink-volume', '@DEFAULT_SINK@'], { timeout: 2000 }, (e2, o2) => { const m = /(\d+)%/.exec(o2 || ''); res({ level: m ? Number(m[1]) : 50, muted: false }); });
  });
}));
let volPending = null, volBusy = false;
function volApply() {
  if (volBusy || volPending === null) return;
  const v = Math.max(0, Math.min(100, Math.round(volPending))); volPending = null; volBusy = true;
  const next = () => { volBusy = false; volApply(); };
  if (!plat.IS_LINUX) { rpc('audio_set', { volume: v }).catch(() => {}).finally(next); return; }
  execFile('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', `${v}%`], { timeout: 2000 }, err => {
    if (!err) { execFile('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', '0'], { timeout: 2000 }, next); return; }
    execFile('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${v}%`], { timeout: 2000 }, next);
  });
}
ipcMain.on('ring-vol-set', (_e, v) => { volPending = Number(v); volApply(); });
// the ring's Brightness slot: the screen under the pointer. A laptop panel through its backlight
// (logind, brightnessctl or sysfs, no root needed); an external monitor over DDC/CI with ddcutil,
// found by the name it reports matching the one Electron gives the display. When the names do not
// match (Wayland may name screens differently) every monitor is set together. Linux only for now.
let ddcList = null;   // Promise of { ok, reason, list: [{ bus, model }] }, read again when displays change
const ddcMonitors = () => ddcList || (ddcList = new Promise(res => execFile('ddcutil', ['detect', '--terse'], { timeout: 20000 }, (err, out, errOut) => {
  if (err && err.code === 'ENOENT') { ddcList = null; return res({ ok: false, reason: 'ddcutil' }); }
  const list = [];
  for (const block of String(out || '').split(/\n\s*\n/)) {
    const bus = /\/dev\/i2c-(\d+)/.exec(block), mon = /Monitor:\s*([^\n]*)/.exec(block);
    if (bus && !/Invalid display/i.test(block)) list.push({ bus: bus[1], model: mon ? (mon[1].split(':')[1] || '').trim() : '' });
  }
  // nothing found and nothing to talk to: the I2C device nodes are missing or not ours to open
  if (!list.length) { ddcList = null; return res({ ok: false, reason: briI2cReady() ? 'none' : 'i2c' }); }
  res({ ok: true, list });
})));
app.whenReady().then(() => { const drop = () => { ddcList = null; }; screen.on('display-added', drop); screen.on('display-removed', drop); });
// at least one /dev/i2c-N this user can open
function briI2cReady() {
  try { return fs.readdirSync('/dev').filter(n => /^i2c-\d+$/.test(n)).some(n => { try { fs.accessSync('/dev/' + n, fs.constants.R_OK | fs.constants.W_OK); return true; } catch (e) { return false; } }); } catch (e) { return false; }
}
function backlightDev() {
  try { const n = fs.readdirSync('/sys/class/backlight')[0]; return n ? '/sys/class/backlight/' + n : null; } catch (e) { return null; }
}
const ddcGet = bus => new Promise(res => {
  const once = (n) => execFile('ddcutil', ['--bus', bus, 'getvcp', '10', '--brief'], { timeout: 5000 }, (err, out) => {
    const v = /VCP 10 C (\d+) (\d+)/.exec(out || '');
    if (v) return res({ level: Number(v[1]), max: Number(v[2]) || 100 });
    if (n) return once(n - 1);   // monitors sometimes miss the first request
    res(null);
  });
  once(1);
});
let briTarget = null;   // what the open dial changes: { kind: 'backlight', dir, max } or { kind: 'ddc', buses, max }
ipcMain.handle('ring-bri-get', async () => {
  briTarget = null;
  if (!plat.IS_LINUX) return { level: null, reason: 'platform' };
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const name = d.label || t('Screen');
  const bl = backlightDev();
  if (bl && (d.internal || screen.getAllDisplays().length === 1)) {
    try {
      const max = Number(fs.readFileSync(bl + '/max_brightness', 'utf8')), cur = Number(fs.readFileSync(bl + '/actual_brightness', 'utf8'));
      briTarget = { kind: 'backlight', dir: bl, max };
      return { level: Math.round(cur * 100 / max), name };
    } catch (e) {}
  }
  const found = await ddcMonitors();
  if (!found.ok) return { level: null, name, reason: found.reason };
  const label = (d.label || '').toLowerCase();
  const m = found.list.find(x => x.model && label && (x.model.toLowerCase() === label || label.includes(x.model.toLowerCase())));
  const buses = m ? [m.bus] : found.list.map(x => x.bus);
  const v = await ddcGet(buses[0]);
  if (!v) return { level: null, name, reason: 'ddc' };
  briTarget = { kind: 'ddc', buses, max: v.max };
  return { level: Math.round(v.level * 100 / v.max), name: m || buses.length === 1 ? (m ? name : found.list[0].model || name) : t('All screens') };
});
let briPending = null, briBusy = false, ddcSlow = false;
function ddcSet(bus, raw) {
  return new Promise(res => {
    const args = ['--bus', bus, 'setvcp', '10', String(raw), '--noverify'];
    execFile('ddcutil', ddcSlow ? args : args.concat('--sleep-multiplier', '0.3'), { timeout: 5000 }, err => {
      if (err && !ddcSlow) { ddcSlow = true; return execFile('ddcutil', args, { timeout: 8000 }, () => res()); }   // a slower monitor: its own timing from now on
      res();
    });
  });
}
function backlightSet(t, v) {
  const raw = Math.max(1, Math.round(v * t.max / 100));   // a panel never goes fully dark
  const name = path.basename(t.dir);
  return new Promise(res => execFile('busctl', ['call', 'org.freedesktop.login1', '/org/freedesktop/login1/session/auto', 'org.freedesktop.login1.Session', 'SetBrightness', 'ssu', 'backlight', name, String(raw)], { timeout: 2000 }, err => {
    if (!err) return res();
    execFile('brightnessctl', ['-q', '-d', name, 'set', String(raw)], { timeout: 2000 }, e2 => {
      if (e2) { try { fs.writeFileSync(t.dir + '/brightness', String(raw)); } catch (e) {} }
      res();
    });
  }));
}
function briApply() {
  if (briBusy || briPending === null || !briTarget) return;
  const v = Math.max(0, Math.min(100, Math.round(briPending))); briPending = null; briBusy = true;
  const t = briTarget;
  const work = t.kind === 'backlight' ? backlightSet(t, v) : Promise.all(t.buses.map(b => ddcSet(b, Math.round(v * t.max / 100))));
  work.then(() => { briBusy = false; briApply(); });
}
ipcMain.on('ring-bri-set', (_e, v) => { briPending = Number(v); briApply(); });
// what monitor brightness needs here, for the settings page
ipcMain.handle('bri-status', async () => {
  if (!plat.IS_LINUX) return { ok: false, reason: 'platform' };
  if (backlightDev()) return { ok: true, backlight: true };
  const found = await ddcMonitors();
  return found.ok ? { ok: true, monitors: found.list.map(x => x.model) } : { ok: false, reason: found.reason };
});
// one-time setup with the administrator's password: ddcutil from the distribution, the I2C device
// nodes loaded now and at boot, and the rule that lets the logged-in user open them
ipcMain.handle('bri-setup', async () => {
  if (!plat.IS_LINUX) return { ok: false, error: t('not needed on this system') };
  const rule = resPath('udev', '60-logimx.rules'), mod = resPath('udev', 'logimx-i2c.conf');
  const has = c => fs.existsSync('/usr/bin/' + c) || fs.existsSync('/bin/' + c);
  const install = has('ddcutil') ? 'true' : has('apt-get') ? 'DEBIAN_FRONTEND=noninteractive apt-get install -y ddcutil' : has('dnf') ? 'dnf install -y ddcutil'
    : has('pacman') ? 'pacman -S --noconfirm --needed ddcutil' : has('zypper') ? 'zypper --non-interactive install ddcutil' : null;
  if (!install) return { ok: false, error: t('Install ddcutil with your package manager, then try again') };
  const script = [install, `cp '${mod}' /etc/modules-load.d/logimx-i2c.conf`, 'modprobe i2c_dev',
    fs.existsSync(rule) ? `cp '${rule}' /etc/udev/rules.d/60-logimx.rules` : 'true',
    'udevadm control --reload', 'udevadm trigger --subsystem-match=i2c-dev --action=add', 'udevadm settle || true'].join(' && ');
  const r = await run('pkexec', ['sh', '-c', script]);
  ddcList = null;
  return r.ok ? { ok: true } : { ok: false, error: r.error || t('cancelled') };
});

exports.provide = { volApply, ddcMonitors, briI2cReady, backlightDev, ddcGet, ddcSet, backlightSet, briApply };
