// LogiMX UI: Electron main process. Talks to the C++ agent over a Unix socket (a named pipe on
// Windows), keeps a tray indicator with battery levels and raises low battery notifications.
const { app, BrowserWindow, ipcMain, nativeTheme, Tray, Menu, Notification, nativeImage, dialog, shell, clipboard, globalShortcut, screen } = require('electron');
app.setName('LogiMX');
const plat = require('./platform');
// Windows ties notifications to the Start-menu shortcut through this id (the installer sets it)
if (plat.IS_WIN) app.setAppUserModelId('io.github.aabdelghani.logimx');
const PACKAGED = app.isPackaged;
const APPIMAGE = process.env.APPIMAGE || '';
const WM_CLASS = PACKAGED ? 'logimx' : 'LogiMX';
// files shipped next to the app: repo root in development, resources/ in a package
const resPath = (...p) => PACKAGED ? path.join(process.resourcesPath, ...p) : path.join(__dirname, '..', ...p);
// how to launch this very app again (autostart, desktop entry)
const launchCmd = () => APPIMAGE ? `"${APPIMAGE}"` : PACKAGED ? process.execPath : `${process.execPath} ${__dirname} --no-sandbox --class=LogiMX`;
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const UI_SETTINGS_PATH = path.join(app.getPath('userData'), 'ui-settings.json');
function loadUi() {
  try { return JSON.parse(fs.readFileSync(UI_SETTINGS_PATH, 'utf8')); } catch (e) {}
  // the app was called OpenOptions before 0.4: keep the window settings across the rename
  for (const old of ['OpenOptions', 'openoptions-ui']) {
    try { return JSON.parse(fs.readFileSync(path.join(app.getPath('appData'), old, 'ui-settings.json'), 'utf8')); } catch (e) {}
  }
  return { tray: true, minimize: true, updates: true };
}
function saveUi(u) { try { fs.mkdirSync(path.dirname(UI_SETTINGS_PATH), { recursive: true }); fs.writeFileSync(UI_SETTINGS_PATH, JSON.stringify(u, null, 2)); } catch (e) {} }
let uiSettings = null;
const net = require('net');
const os = require('os');
const flow = require('./flow');

const SOCKET = plat.agentEndpoint();
const LOW = 20, CRITICAL = 10;

let win = null;
let tray = null;
let sock = null;
let connected = false;
let buffer = '';
let nextId = 1;
const pending = new Map();
let devices = [];                 // last known device summaries
let general = {};                 // agent general settings (notifications, overlays)
let paused = false;
let osdWin = null;
let osdTimer = null;
const alerted = new Map();        // device id -> 'low' | 'critical'
app.isQuitting = false;

function send(obj) {
  if (!sock || !connected) return false;
  sock.write(JSON.stringify(obj) + '\n');
  return true;
}

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    if (!connected) return reject(new Error('agent not connected'));
    const id = nextId++;
    pending.set(id, { resolve, reject });
    send({ id, method, params: params || {} });
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('timeout')); }
    }, 8000);
  });
}

function notify(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// ------------------------------------------------------------------ battery
const lastPercent = new Map();
const lowNotice = new Map();      // the warning we showed, so it can be taken down again
const wasCharging = new Map();
const lowStreak = new Map();      // consecutive low readings, so one stale value cannot warn
const chargeNotice = new Map();   // the 'is charging' notice, superseded once it is full
const fullNotice = new Map();     // told them it is full, until the cable comes out
function dropChargeNotice(id) {
  const n = chargeNotice.get(id);
  if (n) { try { n.close(); } catch (e) {} chargeNotice.delete(id); }
}
function dropLowNotice(id) {
  const n = lowNotice.get(id);
  if (n) { try { n.close(); } catch (e) {} lowNotice.delete(id); }
}
function checkBattery(d) {
  const b = d.battery;
  if (!b) return;
  // The first reading after a device links is what the firmware stored before sleeping, and the
  // agent replaces it a few seconds later. Alerting on it produces a warning about a battery
  // that is actually full.
  if (b.confirmed === false) return;
  const seen = lastPercent.get(d.id);
  lastPercent.set(d.id, b.percent);
  // a battery does not fall thirty points between two readings: wait for the next one
  if (seen !== undefined && !b.charging && seen - b.percent > 30) return;
  // Plugging in answers the warning: take it off screen and say what is happening instead of
  // leaving 'battery critical' sitting there while the device charges.
  const before = wasCharging.get(d.id);
  wasCharging.set(d.id, b.charging);
  // A device at 100% usually stops charging with the cable still in, reporting charging false
  // and external power true, so either flag counts as plugged in.
  const plugged = !!(b.charging || b.external_power);
  if (!plugged) { fullNotice.delete(d.id); dropChargeNotice(d.id); }
  else if (b.percent >= 100 && !fullNotice.get(d.id)) {
    fullNotice.set(d.id, true);
    dropLowNotice(d.id);
    dropChargeNotice(d.id);
    alerted.delete(d.id);
    if (general.notify_low !== false && Notification.isSupported()) {
      new Notification({
        title: `${d.name} is fully charged`,
        body: 'You can unplug the charger.',
        icon: path.join(__dirname, 'assets', d.kind === 'keyboard' ? 'full-keyboard.png' : 'full-mouse.png'),
      }).show();
    }
    return;
  }
  if (b.charging && before === false) {
    dropLowNotice(d.id);
    alerted.delete(d.id);
    if (general.notify_low !== false && Notification.isSupported()) {
      dropChargeNotice(d.id);
      const c = new Notification({
        title: `${d.name} is charging`,
        icon: path.join(__dirname, 'assets', d.kind === 'keyboard' ? 'charging-keyboard.png' : 'charging-mouse.png'),
      });
      c.show();
      chargeNotice.set(d.id, c);
    }
    return;
  }
  if (general.notify_low === false) return;
  const low = general.notify_low_threshold || LOW;
  const prev = alerted.get(d.id);
  if (b.charging || b.percent > low) { lowStreak.delete(d.id); dropLowNotice(d.id); if (prev) alerted.delete(d.id); return; }
  // A device waking from sleep can report the level it stored before it slept, and on the first
  // reading after a start there is no earlier value to compare against, so the implausible-drop
  // check above cannot catch it. A real low battery is still low on the next reading; a stale one
  // is not. Wait for a second low reading before saying anything.
  const streak = (lowStreak.get(d.id) || 0) + 1;
  lowStreak.set(d.id, streak);
  if (streak < 2) return;
  const level = b.percent <= CRITICAL ? 'critical' : 'low';
  if (prev === level || (prev === 'critical' && level === 'low')) return;
  alerted.set(d.id, level);
  if (Notification.isSupported()) {
    dropLowNotice(d.id);
    const n = new Notification({
      title: `${d.name}: battery ${level}`,
      body: `${b.percent}% left. ${d.kind === 'keyboard' ? 'Plug in the USB-C cable to charge.' : 'Charge it soon.'}`,
      urgency: 'normal',
      icon: path.join(__dirname, 'assets', d.kind === 'keyboard' ? 'low-keyboard.png' : 'low-mouse.png'),
    });
    n.show();
    lowNotice.set(d.id, n);
  }
}

// --------------------------------------------------------------------- tray
function trayIcon(warn) {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', warn ? 'tray-warn.png' : 'tray.png'));
  img.setTemplateImage(false);
  return img;
}

const menuIcon = n => nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray', n + '.png'));
const batteryBar = pct => { const n = Math.round(Math.max(0, Math.min(100, pct)) / 10); return '▰'.repeat(n) + '▱'.repeat(10 - n); };
function updateTray() {
  if (!tray) return;
  const warn = devices.some(d => d.battery && !d.battery.charging && d.battery.percent <= LOW);
  tray.setImage(trayIcon(warn));
  const lines = devices.map(d => {
    const b = d.battery;
    return `${d.name}: ${b ? b.percent + '%' + (b.charging ? ' charging' : '') : 'battery n/a'}`;
  });
  tray.setToolTip(connected ? (lines.length ? lines.join('\n') + (paused ? '\nCustom buttons paused' : '') : 'LogiMX: no devices') : 'LogiMX: agent not running');
  const items = [];
  if (!connected) items.push({ label: 'Agent not running', enabled: false });
  else if (!devices.length) items.push({ label: 'No devices', enabled: false });
  for (const d of devices) {
    const b = d.battery;
    // not connected: its name only, nothing to switch or read until it is back
    if (d.online === false) { items.push({ label: `${d.name}   not connected`, icon: menuIcon(d.kind === 'keyboard' ? 'keyboard' : 'mouse'), enabled: false }, { type: 'separator' }); continue; }
    const bat = b ? `${b.percent}%${b.charging ? ' · charging' : b.percent <= LOW ? ' · charge soon' : ''}` : 'battery n/a';
    items.push({ label: `${d.name}   ${bat}`, icon: menuIcon(d.kind === 'keyboard' ? 'keyboard' : 'mouse'), enabled: false });
    if (b) items.push({ label: `      ${batteryBar(b.percent)}`, enabled: false });
    if (d.state && d.state.hosts) {
      items.push({ label: '      Easy-Switch', enabled: false });
      for (const h of d.state.hosts.names.filter(h => h.paired)) {
        const cur = h.index === d.state.hosts.current;
        items.push({ label: `      ${cur ? '●' : '○'}  ${h.index + 1}   ${h.name || 'host ' + (h.index + 1)}`, enabled: !cur, click: () => rpc('change_host', { id: d.id, host: h.index }).catch(() => {}) });
      }
    }
    items.push({ type: 'separator' });
  }
  items.push({ label: 'Open LogiMX', icon: menuIcon('window'), click: showWindow });
  items.push({ label: paused ? 'Resume custom buttons' : 'Pause custom buttons', icon: menuIcon(paused ? 'play' : 'pause'), enabled: connected, click: () => rpc(paused ? 'resume_diversion' : 'pause_diversion').then(() => refreshGeneral().then(updateTray)).catch(() => {}) });
  items.push({ label: 'Status panel', icon: menuIcon('panel'), click: () => showTrayPanel() });
  items.push({ label: 'Quit', icon: menuIcon('power'), click: () => { app.isQuitting = true; app.quit(); } });
  tray.setContextMenu(Menu.buildFromTemplate(items));
  pushTrayState();
}

// --------------------------------------------------------- tray status panel
let trayWin = null;
const TRAY_W = 340;
function trayState() { uiSettings = uiSettings || loadUi(); return { connected, paused, devices, theme: uiSettings.theme || 'light' }; }
function pushTrayState() { if (trayWin && !trayWin.isDestroyed()) trayWin.webContents.send('tray-state', trayState()); }
function ensureTrayPanel() {
  if (trayWin && !trayWin.isDestroyed()) return trayWin;
  trayWin = new BrowserWindow({
    width: TRAY_W, height: 320, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-tray.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  trayWin.loadFile(path.join(__dirname, 'renderer', 'tray.html'));
  trayWin.on('blur', () => { if (trayWin && !trayWin.isDestroyed() && trayWin.isVisible()) trayWin.hide(); });
  return trayWin;
}
function showTrayPanel() {
  const w = ensureTrayPanel();
  if (w.isVisible()) { w.hide(); return; }
  const n = devices.length || 1;
  const height = 8 + n * 96 + 9 + 3 * 40 + 8;
  let a; try { const tb = tray && tray.getBounds(); a = screen.getDisplayNearestPoint(tb && tb.width ? { x: tb.x, y: tb.y } : screen.getCursorScreenPoint()).workArea; } catch (e) { a = screen.getPrimaryDisplay().workArea; }
  w.setBounds({ x: Math.round(a.x + a.width - TRAY_W - 12), y: Math.round(a.y + 8), width: TRAY_W, height });
  const send = () => { w.show(); offTaskbar(w); w.focus(); pushTrayState(); };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
}
ipcMain.handle('tray-state', () => trayState());
ipcMain.handle('tray-panel', () => showTrayPanel());
ipcMain.handle('tray-action', async (_e, name, params) => {
  if (name === 'close') { if (trayWin && !trayWin.isDestroyed()) trayWin.hide(); return; }
  if (name === 'open') { if (trayWin && !trayWin.isDestroyed()) trayWin.hide(); showWindow(); return; }
  if (name === 'quit') { app.isQuitting = true; app.quit(); return; }
  if (name === 'pause') { const want = !paused; paused = want; pushTrayState(); try { await rpc(want ? 'pause_diversion' : 'resume_diversion'); await refreshGeneral(); } catch (e) {} updateTray(); return; }
  if (name === 'host') { try { await rpc('change_host', { id: params.id, host: params.host }); } catch (e) {} return; }
});

async function refreshDevices() {
  try {
    const st = await rpc('status');
    general = st.general || {};
    paused = !!st.paused;
    currentApp = st.app || currentApp;
    devices = await rpc('devices');
    devices.forEach(checkBattery);
  } catch (e) { devices = []; }
  updateTray();
}
async function refreshGeneral() { try { const st = await rpc('status'); general = st.general || {}; paused = !!st.paused; } catch (e) {} }

function mergeDevice(summary) {
  const i = devices.findIndex(d => d.id === summary.id);
  if (i >= 0) devices[i] = summary; else devices.push(summary);
  checkBattery(summary);
  updateTray();
}

// ------------------------------------------------------------------- socket
let autoRestarts = 0;
let restartAgent = null;      // set once the app is ready (see startAgent below)
function connect() {
  if (sock) return;
  sock = net.createConnection(SOCKET);
  sock.setEncoding('utf8');
  sock.on('connect', () => {
    connected = true;
    autoRestarts = 0;
    notify('agent-status', { connected: true });
    refreshDevices();
  });
  sock.on('data', chunk => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { continue; }
      if (msg.event) {
        handleEvent(msg.event, msg.data);
        if (msg.event !== 'ring_move') notify('agent-event', msg);   // the ring's movement stream is for the overlay only
        continue;
      }
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg.result);
      }
    }
  });
  const drop = () => {
    connected = false;
    sock = null;
    buffer = '';
    for (const [, p] of pending) p.reject(new Error('agent disconnected'));
    pending.clear();
    devices = [];
    updateTray();
    notify('agent-status', { connected: false });
    setTimeout(connect, 1500);
    // the agent went away while we were running: bring it back, but do not fight a crash loop
    if (restartAgent && autoRestarts < 3) { autoRestarts++; setTimeout(() => { if (!connected && restartAgent) restartAgent().catch(() => {}); }, 3000); }
  };
  sock.on('error', drop);
  sock.on('close', drop);
}

function handleEvent(event, data) {
  if (event === 'device' || event === 'device_added') {
    const isNew = event === 'device_added' && !devices.some(d => d.id === data.id);
    mergeDevice(data);
    if (isNew && general.notify_connect && Notification.isSupported()) new Notification({ title: `${data.name} connected`, body: data.battery ? `Battery ${data.battery.percent}%` : '', icon: path.join(__dirname, 'assets', 'icon.png') }).show();
  }
  else if (event === 'device_removed') {
    const d = devices.find(x => x.id === data.id);
    devices = devices.filter(x => x.id !== data.id); alerted.delete(data.id); updateTray();
    if (d && general.notify_connect && Notification.isSupported()) new Notification({ title: `${d.name} disconnected`, icon: path.join(__dirname, 'assets', 'icon.png') }).show();
  }
  else if (event === 'action') { if (data.kind === 'emoji') showEmoji(`${data.device || 'Keyboard'} · Emoji key`); else if (data.kind === 'ring') showRing(data.id, !!data.raw); else if (data.kind === 'ring_release') releaseRing(); else showOsd(data); }
  else if (event === 'ring_move') moveRing(data.dx, data.dy);
  else if (event === 'app') currentApp = data.app || '';
  else if (event === 'paused') { paused = !!data.paused; updateTray(); }
  else if (event === 'battery') {
    const d = devices.find(x => x.id === data.id);
    if (d) { d.battery = data.battery; checkBattery(d); updateTray(); }
  } else if (event === 'profile') {
    const d = devices.find(x => x.id === data.id);
    if (d) { d.profile = data.profile; updateTray(); }
  }
}

// --------------------------------------------------------------------- OSD
function osdEnabled(kind) {
  if (general.osd_enabled === false) return false;
  const ev = Object.assign({ mic: true, smartshift: true, backlight: true, host: true, dpi: false }, general.osd_events || {});
  return ev[kind] !== false;
}
function ensureOsd() {
  if (osdWin && !osdWin.isDestroyed()) return osdWin;
  osdWin = new BrowserWindow({
    width: 460, height: 90, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, focusable: false, resizable: false,
    hasShadow: false, show: false, type: plat.OVERLAY_TYPE,
    webPreferences: { preload: path.join(__dirname, 'preload-osd.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  osdWin.setIgnoreMouseEvents(true);
  osdWin.setAlwaysOnTop(true, 'screen-saver');
  osdWin.loadFile(path.join(__dirname, 'renderer', 'osd.html'));
  return osdWin;
}
function positionOsd() {
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const a = disp.workArea;
  const pos = general.osd_position || 'bottom';
  const x = Math.round(a.x + (a.width - 460) / 2);
  const y = pos === 'top' ? a.y + 40 : pos === 'center' ? Math.round(a.y + (a.height - 90) / 2) : a.y + a.height - 130;
  osdWin.setPosition(x, y);
}
async function micMuted() {
  if (!plat.IS_LINUX) return rpc('audio_get').then(a => !!a.mic_muted).catch(() => null);
  return new Promise(resolve => execFile('pactl', ['get-source-mute', '@DEFAULT_SOURCE@'], { timeout: 1500 }, (err, out) => resolve(err ? null : /yes/i.test(String(out)))));
}
async function showOsd(data) {
  if (!osdEnabled(data.kind)) return;
  let msg = { kind: data.kind, duration: general.osd_duration || 1500, theme: (uiSettings && uiSettings.theme) || 'light' };
  if (data.kind === 'mic') { const m = await micMuted(); msg.title = m === null ? 'Microphone' : m ? 'Microphone muted' : 'Microphone on'; msg.sub = m === null ? 'Toggled' : m ? 'Press again to unmute' : 'Press again to mute'; }
  else if (data.kind === 'smartshift') { msg.title = data.mode === 'ratchet' ? 'Ratchet' : 'Free-spin'; msg.sub = `Scroll wheel · SmartShift ${data.mode === 'ratchet' ? 'on' : 'off'}`; }
  else if (data.kind === 'backlight' && !(data.num_levels >= 2 && data.level >= 0 && data.level < data.num_levels)) return;   // not a level: nothing to show
  else if (data.kind === 'backlight') { msg.title = 'Backlight'; msg.sub = `Level ${data.level} of ${(data.num_levels || 8) - 1}`; msg.level = data.level; msg.num_levels = (data.num_levels || 8) - 1; }
  else if (data.kind === 'host') { const d = devices.find(x => x.id === data.id); const name = d && d.state && d.state.hosts && d.state.hosts.names[data.host] ? d.state.hosts.names[data.host].name : ''; msg.title = `Switched to ${name || 'host ' + (data.host + 1)}`; msg.sub = `${data.device || ''} · host ${data.host + 1}`; msg.host = data.host; }
  else if (data.kind === 'dpi') { msg.title = `${data.dpi} DPI`; msg.sub = data.device || ''; }
  const w = ensureOsd();
  const send = () => { positionOsd(); w.showInactive(); w.webContents.send('osd-show', msg); clearTimeout(osdTimer); osdTimer = setTimeout(() => { if (w && !w.isDestroyed()) w.hide(); }, (msg.duration || 1500) + 400); };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
}
ipcMain.on('osd-hidden', () => { if (osdWin && !osdWin.isDestroyed()) osdWin.hide(); });

// Overlays (tray panel, emoji picker, action ring) must never put the app in the dock or taskbar.
// The option given at creation is lost for a window created hidden, so it is set again on every
// show, and once more after the window manager has mapped it.
function offTaskbar(w) {
  if (!plat.IS_LINUX) return;   // skipTaskbar holds on Windows and macOS
  const set = () => {
    if (!w || w.isDestroyed()) return;
    // the agent asks the window manager on X11, which is what the dock and the taskbar listen to
    try { const xid = w.getNativeWindowHandle().readUInt32LE(0); if (xid) rpc('skip_taskbar', { xid }).catch(() => {}); } catch (e) {}
  };
  set(); setTimeout(set, 80);
}
// ------------------------------------------------------------- emoji picker
let emojiWin = null;
const EMOJI_W = 380, EMOJI_H = 460;
function ensureEmoji() {
  if (emojiWin && !emojiWin.isDestroyed()) return emojiWin;
  emojiWin = new BrowserWindow({
    width: EMOJI_W, height: EMOJI_H, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-emoji.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  emojiWin.setAlwaysOnTop(true, 'pop-up-menu');
  emojiWin.loadFile(path.join(__dirname, 'renderer', 'emoji.html'));
  emojiWin.on('blur', () => { if (emojiWin && !emojiWin.isDestroyed() && emojiWin.isVisible()) emojiWin.hide(); });
  return emojiWin;
}
// Electron's getCursorScreenPoint() goes stale on X11 while no Electron window has the pointer,
// so ask the X server directly when we can.
function cursorPoint() {
  return new Promise(resolve => {
    const fallback = () => resolve(screen.getCursorScreenPoint());
    if (!plat.IS_LINUX) return fallback();
    if ((process.env.XDG_SESSION_TYPE || '').toLowerCase() !== 'x11' && !process.env.DISPLAY) return fallback();
    execFile('xdotool', ['getmouselocation', '--shell'], { timeout: 500 }, (err, out) => {
      if (err) return fallback();
      const m = /X=(-?\d+)\s+Y=(-?\d+)/.exec(String(out));
      if (!m) return fallback();
      resolve({ x: Number(m[1]), y: Number(m[2]) });
    });
  });
}
async function showEmoji(source) {
  const w = ensureEmoji();
  if (w.isVisible()) { w.hide(); return; }
  uiSettings = uiSettings || loadUi();
  const pt = await cursorPoint();
  const a = screen.getDisplayNearestPoint(pt).workArea;
  const x = Math.max(a.x, Math.min(a.x + a.width - EMOJI_W, pt.x - EMOJI_W / 2));
  const y = Math.max(a.y, Math.min(a.y + a.height - EMOJI_H, pt.y + 24));
  const X = Math.round(x), Y = Math.round(y);
  const place = () => { if (w.isDestroyed()) return; const [cx, cy] = w.getPosition(); if (cx !== X || cy !== Y) w.setPosition(X, Y); };
  const send = () => {
    w.setPosition(X, Y); w.show(); offTaskbar(w); place(); w.focus();
    setTimeout(place, 40); setTimeout(place, 160);   // the window manager may re-place a freshly mapped window
    w.webContents.send('emoji-show', { theme: uiSettings.theme || 'light', recent: uiSettings.emojiRecent || [], source: source || 'Emoji key' });
  };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
}
ipcMain.on('emoji-close', () => { if (emojiWin && !emojiWin.isDestroyed()) emojiWin.hide(); });
ipcMain.on('emoji-pick', async (_e, { ch }) => {
  if (emojiWin && !emojiWin.isDestroyed()) emojiWin.hide();
  uiSettings = uiSettings || loadUi();
  uiSettings.emojiRecent = [ch].concat((uiSettings.emojiRecent || []).filter(x => x !== ch)).slice(0, 16);
  saveUi(uiSettings);
  const previous = clipboard.readText();
  clipboard.writeText(ch);
  await new Promise(r => setTimeout(r, 120));   // let focus return to the previous window
  try { await rpc('play_action', { action: { type: 'keystroke', keys: plat.PASTE_KEYS } }); }
  catch (e) { if (Notification.isSupported()) new Notification({ title: 'Emoji copied', body: `${ch} is on the clipboard (agent not reachable to paste)`, icon: path.join(__dirname, 'assets', 'icon.png') }).show(); }
  setTimeout(() => { try { if (clipboard.readText() === ch && previous) clipboard.writeText(previous); } catch (e) {} }, 800);
});
ipcMain.handle('emoji-show', () => showEmoji('Preview'));

// ------------------------------------------------------------- action ring
// Eight actions around the pointer, opened by the "Action ring" preset on any button or key.
// The window is a transparent square centred on the pointer; the page draws the wedges and
// reports the picked slot, and the action runs through the agent like any assignment would.
let ringRawMode = false;
let currentApp = '';       // window class of the focused application (the agent's 'app' event)
// the ring for the application in front: one set up for it (its class contains the key, as
// profiles match), else the ring profile in use
function ringFor(rs) {
  const app = (currentApp || '').toLowerCase();
  for (const [k, v] of Object.entries(rs.apps || {})) {
    if (!v || !Array.isArray(v.slots)) continue;
    const match = Array.isArray(v.match) && v.match.length ? v.match : [k];   // the app profile's own match strings
    if (app && match.some(m => m && app.includes(String(m).toLowerCase()))) return { slots: v.slots, app: k };
  }
  const prof = Array.isArray(rs.profiles) && rs.profiles.length ? rs.profiles[Math.max(0, Math.min(rs.profiles.length - 1, rs.active || 0))] : null;
  return { slots: (prof && prof.slots) || rs.slots || [], name: prof && prof.name };
}
const RING_SCALE = { small: 0.85, medium: 1, large: 1.2 };
// a slot by its place: [i] on the ring, [i, j] inside the folder at i
function ringSlotAt(path) {
  let list = ringSlots, slot = null;
  for (let k = 0; k < path.length; k++) {
    slot = list[path[k]];
    if (!slot) return null;
    if (k < path.length - 1) list = (slot.action && slot.action.slots) || [];
  }
  return slot;
}
// the device a ring action runs through: the one that opened it, else the first connected (so
// Easy-Switch works from Try it too)
const ringRunDevice = () => ringDevice || ((devices.find(d => d.online !== false) || devices[0] || {}).id) || null;
// adjustable actions: the wheel over them steps one way or the other
const RING_ADJUST = { brightness_up: ['brightness_up', 'brightness_down'], brightness_down: ['brightness_up', 'brightness_down'],
  zoom_in: ['zoom_in', 'zoom_out'], zoom_out: ['zoom_in', 'zoom_out'], next_track: ['next_track', 'prev_track'], prev_track: ['next_track', 'prev_track'] };
let ringWin = null, ringSlots = [], ringTravel = 30, ringDevice = null, ringOpening = false, ringReleasedEarly = false;
let ringPending = [0, 0];   // movement that arrived while the ring was still being placed
const ringLog = [];          // how the last openings found the pointer, for the problem report
const RING_W = 560, RING_H = 460;   // the ring itself; the window grows to the screen when shown
function ensureRing() {
  if (ringWin && !ringWin.isDestroyed()) return ringWin;
  // A notification-type window: the window manager neither animates it in (a screen-sized
  // window zooming in looks like the whole screen twitching) nor gives it focus. Keys reach the
  // ring through global shortcuts held only while it is open.
  ringWin = new BrowserWindow({
    width: RING_W, height: RING_H, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, show: false,
    focusable: false, type: plat.OVERLAY_TYPE,
    webPreferences: { preload: path.join(__dirname, 'preload-ring.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  ringWin.setAlwaysOnTop(true, 'pop-up-menu');
  ringWin.loadFile(path.join(__dirname, 'renderer', 'ring.html'));
  ringWin.on('hide', ringKeysOff);
  return ringWin;
}
// The button that opened the ring was let go: the page runs the hovered slot, or stays open when
// the press was only a tap so the slot can be clicked.
// The ring belongs to the desktop, not to the app's own theme: light or dark, the accent colour
// and the interface font are read from the desktop's settings each time it opens.
const GNOME_ACCENTS = { blue: '#3584e4', teal: '#2190a4', green: '#3a944a', yellow: '#c88800', orange: '#ed5b00', red: '#e62d42', pink: '#d56199', purple: '#9141ac', slate: '#6f8396' };
const YARU_ACCENTS = { '': '#e95420', bark: '#787859', sage: '#657b69', olive: '#4b8501', viridian: '#03875b', prussiangreen: '#308280', blue: '#0073e5', purple: '#7764d8', magenta: '#b34cb3', red: '#da3450' };
function gsetting(key) {
  // Electron renames the desktop in its own environment (Unity, for the tray), which makes gsettings
  // skip the distribution's per-desktop defaults such as Ubuntu's font and theme: ask as the real one
  const env = Object.assign({}, process.env, { XDG_CURRENT_DESKTOP: process.env.ORIGINAL_XDG_CURRENT_DESKTOP || process.env.XDG_CURRENT_DESKTOP || '' });
  return new Promise(resolve => execFile('gsettings', ['get', 'org.gnome.desktop.interface', key], { timeout: 700, env }, (err, out) => resolve(err ? '' : String(out).trim().replace(/^'|'$/g, ''))));
}
let lookCache = null, lookAt = 0;
async function systemLook() {
  if (!plat.IS_LINUX) return plat.systemLook();
  if (lookCache && Date.now() - lookAt < 4000) return lookCache;
  const [scheme, gtk, accentName, font] = await Promise.all(['color-scheme', 'gtk-theme', 'accent-color', 'font-name'].map(gsetting));
  const known = scheme || gtk;
  const dark = known ? /dark/i.test(scheme) || /-dark$/i.test(gtk) : nativeTheme.shouldUseDarkColors;
  let accent = GNOME_ACCENTS[accentName];
  if (!accent) { const m = /^Yaru(?:-([a-z]+?))?(?:-dark)?$/i.exec(gtk); if (m) accent = YARU_ACCENTS[(m[1] || '').toLowerCase()] || YARU_ACCENTS['']; }
  if (!accent) accent = GNOME_ACCENTS.blue;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16));
  const accentFg = (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1b1c1f' : '#ffffff';
  lookCache = { dark, accent, accentFg, font: font.replace(/\s+[\d.]+$/, '') };
  lookAt = Date.now();
  return lookCache;
}
function releaseRing() {
  if (ringWin && !ringWin.isDestroyed() && ringWin.isVisible()) ringWin.webContents.send('ring-release');
  else if (ringOpening) ringReleasedEarly = true;   // let go before the ring was even placed: a tap
}
// Esc closes and 1 to 8 pick while the ring is open; the window itself never has the focus
const RING_KEYS = ['Escape', '1', '2', '3', '4', '5', '6', '7', '8'];
function ringKeysOn() {
  for (const k of RING_KEYS) {
    try { globalShortcut.register(k, () => { if (!ringWin || ringWin.isDestroyed() || !ringWin.isVisible()) return; ringWin.webContents.send('ring-key', { key: k }); }); } catch (e) {}
  }
}
function ringKeysOff() { for (const k of RING_KEYS) { try { globalShortcut.unregister(k); } catch (e) {} } }
// Raw movement from the held button: it steers the ring while the pointer stays put.
function moveRing(dx, dy) {
  if (ringWin && !ringWin.isDestroyed() && ringWin.isVisible()) ringWin.webContents.send('ring-move', { dx, dy });
  else if (ringOpening) { ringPending[0] += dx; ringPending[1] += dy; }
}
async function showRing(deviceId, raw) {
  const w = ensureRing();
  if (w.isVisible()) { w.hide(); return; }
  if (ringOpening) return;
  uiSettings = uiSettings || loadUi();
  ringDevice = typeof deviceId === 'string' ? deviceId : null;
  const rs = (general || {}).ring || {};   // kept fresh by refreshGeneral, no round trip here
  const prof = Array.isArray(rs.profiles) && rs.profiles.length ? rs.profiles[Math.max(0, Math.min(rs.profiles.length - 1, rs.active || 0))] : null;
  const pick = ringFor(rs);
  ringSlots = pick.slots;
  ringRawMode = !!raw;
  ringTravel = rs.travel || 30;
  if (rs.free_pointer) raw = false;   // the pointer stays free: the ring follows it instead of taking the mouse
  ringOpening = true; ringReleasedEarly = false; ringPending = [0, 0];
  const [pt, look] = await Promise.all([cursorPoint(), systemLook()]);
  // The window covers every display and the page draws the ring where the pointer is. A window
  // cannot be placed at the pointer on Wayland (the compositor puts it where it likes, usually the
  // middle of the screen), and there the pointer's position is not even known until it moves over
  // the window; the page waits for that first movement. On X11 the position is known up front.
  const all = screen.getAllDisplays();
  const X = Math.min(...all.map(d => d.bounds.x)), Y = Math.min(...all.map(d => d.bounds.y));
  const R = Math.max(...all.map(d => d.bounds.x + d.bounds.width)), Bm = Math.max(...all.map(d => d.bounds.y + d.bounds.height));
  const known = !plat.IS_LINUX || (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'x11';
  const at = known ? { x: pt.x - X, y: pt.y - Y } : null;
  const guess = { x: pt.x - X, y: pt.y - Y };
  const place = () => { if (w.isDestroyed()) return; const b = w.getBounds(); if (b.x !== X || b.y !== Y || b.width !== R - X || b.height !== Bm - Y) w.setBounds({ x: X, y: Y, width: R - X, height: Bm - Y }); };
  const send = () => {
    place(); w.show(); offTaskbar(w); ringKeysOn();
    setTimeout(place, 60);   // once, in case the window manager moved it
    w.webContents.send('ring-show', { look, slots: ringSlots, travel: ringTravel, raw: !!raw, at, guess, size: { w: R - X, h: Bm - Y }, scale: RING_SCALE[rs.size] || 1 });
    ringOpening = false;
    if (ringPending[0] || ringPending[1]) w.webContents.send('ring-move', { dx: ringPending[0], dy: ringPending[1] });
    if (ringReleasedEarly) { ringReleasedEarly = false; w.webContents.send('ring-release'); }
    // whether the compositor kept the size asked for (a Wayland compositor may shrink or move it)
    setTimeout(() => { if (w.isDestroyed()) return; const b = w.getBounds(), c = w.getContentBounds(); ringLog.push({ when: new Date().toISOString().slice(11, 19), raw: ringRawMode, how: 'window', ms: 250, x: b.x, y: b.y, size: `${b.width}x${b.height} (asked ${R - X}x${Bm - Y}, content ${c.width}x${c.height})` }); if (ringLog.length > 10) ringLog.shift(); }, 250);
  };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
}
ipcMain.on('ring-close', () => { if (ringWin && !ringWin.isDestroyed()) ringWin.hide(); });
ipcMain.on('ring-diag', (_e, info) => { ringLog.push(Object.assign({ when: new Date().toISOString().slice(11, 19), raw: ringRawMode }, info)); if (ringLog.length > 10) ringLog.shift(); });
// haptic feedback on the mouse that opened the ring; mice without it, and rings opened from the
// page, simply get none
const ringCue = cue => { if (ringDevice) rpc('haptic_cue', { id: ringDevice, cue }).catch(() => {}); };
ipcMain.on('ring-hover', () => ringCue('ring_hover'));
ipcMain.on('ring-pick', async (_e, { index, path }) => {
  const slot = ringSlotAt(path || [index]);
  if (!slot || !slot.action) return;
  // Next ring profile: the ring stays open and shows the next profile's actions
  if (slot.action.type === 'ring_profile') {
    const rs = Object.assign({}, general.ring || {}), n = Array.isArray(rs.profiles) ? rs.profiles.length : 0;
    if (n < 2) return;
    rs.active = ((rs.active || 0) + 1) % n;
    rs.slots = rs.profiles[rs.active].slots;
    try { general = await rpc('set_general', { ring: rs }); } catch (e) { return; }
    ringSlots = rs.profiles[rs.active].slots || [];
    ringCue('ring_run');
    if (ringWin && !ringWin.isDestroyed()) ringWin.webContents.send('ring-slots', { slots: ringSlots, name: rs.profiles[rs.active].name });
    notify('agent-event', { event: 'general', data: general });
    return;
  }
  if (slot.action.type === 'folder' || slot.action.type === 'brightness_dial') return;   // the overlay opens folders and runs the brightness dial itself
  if (ringWin && !ringWin.isDestroyed()) ringWin.hide();
  ringCue('ring_run');
  const params = { action: slot.action };
  const runOn = ringRunDevice();
  if (runOn) params.id = runOn;
  try { await rpc('run_action', params); }
  catch (e) { if (Notification.isSupported()) new Notification({ title: 'Action ring', body: `${slot.label || 'Action'} did not run: ${e.message}` }).show(); }
});
ipcMain.handle('ring-show', () => showRing(null, false));
// the wheel over an adjustable slot: one step of it each notch, the ring staying open
ipcMain.on('ring-adjust', (_e, { path, dir }) => {
  const slot = ringSlotAt(path || []);
  if (!slot) return;
  const key = typeof slot.action === 'string' ? slot.action : slot.action && slot.action.preset;
  const pair = RING_ADJUST[key];
  if (!pair) return;
  const params = { action: pair[dir > 0 ? 0 : 1] }, runOn = ringRunDevice();
  if (runOn) params.id = runOn;
  rpc('run_action', params).catch(() => {});
});
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
// (logind, no root needed); an external monitor over DDC/CI with ddcutil, found by the name it
// reports matching the one Electron gives the display. Linux only for now.
let ddcList = null;   // [{ bus, model }], read once and again when displays change
const ddcMonitors = () => ddcList || (ddcList = new Promise(res => execFile('ddcutil', ['detect', '--terse'], { timeout: 15000 }, (err, out) => {
  if (err) { ddcList = null; return res([]); }
  const found = [];
  for (const block of String(out).split(/\n\s*\n/)) {
    const bus = /\/dev\/i2c-(\d+)/.exec(block), mon = /Monitor:\s*([^\n]*)/.exec(block);
    if (bus && !/Invalid display/i.test(block)) found.push({ bus: bus[1], model: mon ? (mon[1].split(':')[1] || '').trim() : '' });
  }
  res(found);
})));
app.whenReady().then(() => { const drop = () => { ddcList = null; }; screen.on('display-added', drop); screen.on('display-removed', drop); });
function backlightDev() {
  try { const n = fs.readdirSync('/sys/class/backlight')[0]; return n ? '/sys/class/backlight/' + n : null; } catch (e) { return null; }
}
let briTarget = null;   // what the open dial changes: { kind: 'backlight', dir, max } or { kind: 'ddc', bus }
ipcMain.handle('ring-bri-get', async () => {
  briTarget = null;
  if (!plat.IS_LINUX) return { level: null };
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const name = d.label || 'Screen';
  const bl = backlightDev();
  if (bl && (d.internal || screen.getAllDisplays().length === 1)) {
    try {
      const max = Number(fs.readFileSync(bl + '/max_brightness', 'utf8')), cur = Number(fs.readFileSync(bl + '/actual_brightness', 'utf8'));
      briTarget = { kind: 'backlight', dir: bl, max };
      return { level: Math.round(cur * 100 / max), name };
    } catch (e) {}
  }
  const mons = await ddcMonitors();
  const label = (d.label || '').toLowerCase();
  const m = mons.find(x => x.model && label && (x.model.toLowerCase() === label || label.includes(x.model.toLowerCase()))) || (mons.length === 1 ? mons[0] : null);
  if (!m) return { level: null, name };
  return new Promise(res => execFile('ddcutil', ['--bus', m.bus, 'getvcp', '10', '--brief'], { timeout: 4000 }, (err, out) => {
    const v = /VCP 10 C (\d+) (\d+)/.exec(out || '');
    if (err || !v) return res({ level: null, name });
    briTarget = { kind: 'ddc', bus: m.bus, max: Number(v[2]) || 100 };
    res({ level: Math.round(Number(v[1]) * 100 / briTarget.max), name });
  }));
});
let briPending = null, briBusy = false;
function briApply() {
  if (briBusy || briPending === null || !briTarget) return;
  const v = Math.max(0, Math.min(100, Math.round(briPending))); briPending = null; briBusy = true;
  const next = () => { briBusy = false; briApply(); };
  const t = briTarget;
  if (t.kind === 'backlight') {
    // logind lets the session's user set the backlight; a panel never goes fully dark
    const raw = Math.max(1, Math.round(v * t.max / 100));
    execFile('busctl', ['call', 'org.freedesktop.login1', '/org/freedesktop/login1/session/auto', 'org.freedesktop.login1.Session', 'SetBrightness', 'ssu', 'backlight', path.basename(t.dir), String(raw)], { timeout: 2000 }, next);
    return;
  }
  execFile('ddcutil', ['--bus', t.bus, 'setvcp', '10', String(Math.round(v * t.max / 100)), '--noverify', '--sleep-multiplier', '0.3'], { timeout: 4000 }, next);
}
ipcMain.on('ring-bri-set', (_e, v) => { briPending = Number(v); briApply(); });
ipcMain.handle('screen-info', () => ({ cursor: screen.getCursorScreenPoint(), displays: screen.getAllDisplays().map(d => ({ id: d.id, bounds: d.bounds, workArea: d.workArea, scale: d.scaleFactor })), picker: emojiWin && !emojiWin.isDestroyed() ? { visible: emojiWin.isVisible(), bounds: emojiWin.getBounds() } : null }));
ipcMain.handle('osd-test', (_e, kind) => kind === 'emoji' ? showEmoji('Preview') : showOsd({ kind, mode: 'freespin', level: 5, num_levels: 8, host: 1, dpi: 1600, device: 'MX Master 3S' }));
ipcMain.handle('general-changed', async () => { await refreshGeneral(); updateTray(); });
ipcMain.handle('set-theme', (_e, theme) => { uiSettings = uiSettings || loadUi(); uiSettings.theme = theme; saveUi(uiSettings); });

function registerShortcuts() {
  for (const n of [1, 2, 3]) globalShortcut.register(`Super+Alt+${n}`, () => { for (const d of devices) rpc('change_host', { id: d.id, host: n - 1 }).catch(() => {}); });
  globalShortcut.register('Super+Alt+O', async () => { const on = general.osd_enabled === false; try { general = await rpc('set_general', { osd_enabled: on }); } catch (e) {} if (Notification.isSupported()) new Notification({ title: `Overlays ${on ? 'on' : 'off'}`, icon: path.join(__dirname, 'assets', 'icon.png') }).show(); });
  globalShortcut.register('Super+Alt+P', () => rpc(paused ? 'resume_diversion' : 'pause_diversion').then(() => refreshGeneral().then(updateTray)).catch(() => {}));
}

// ------------------------------------------------------------------- window
function createWindow() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1420,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0e1116',
    title: 'LogiMX',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    frame: false,
    show: !plat.startedAtLogin() && !(uiSettings && uiSettings.start_hidden),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', e => {
    const keep = !uiSettings || uiSettings.minimize !== false;
    if (!app.isQuitting && tray && keep) { e.preventDefault(); win.hide(); }
  });
  win.on('show', () => btWatch(true));
  win.on('hide', () => btWatch(false));
  win.on('closed', () => { win = null; btWatch(false); });
  flow.setWindow(win);
}

// ---------------------------------------------------------------- pairing-mode watch
// While the window is open, a short Bluetooth scan now and then looks for an MX device that is
// advertising in pairing mode (its name shows up and BlueZ has not paired it). Found one: a
// notification names it, and clicking it pairs, trusts and connects it through bluetoothctl.
// The scan is brief and spaced out because discovery shares the radio with audio and the Bolt band.
const BT_SCAN_MS = 12000, BT_EVERY_MS = 90000, BT_RENOTIFY_MS = 10 * 60000;
const btNotified = new Map();     // address -> when we last told the user
let btScan = null, btTimer = null, btPairing = false;
const stripAnsi = t => t.replace(/\x1b\[[0-9;]*m/g, '');
const isMxName = n => /^(MX |MX-|Logi |Logitech MX|M7\d\d|Signature|Lift|Ergo)/i.test(n || '');
function btInfo(addr) {
  return new Promise(res => execFile('bluetoothctl', ['info', addr], { timeout: 4000 }, (err, out) => {
    if (err) return res(null);
    const get = k => { const m = new RegExp(`^\\s*${k}: (.*)$`, 'm').exec(out || ''); return m ? m[1].trim() : ''; };
    res({ name: get('Name') || get('Alias'), paired: get('Paired') === 'yes', connected: get('Connected') === 'yes', icon: get('Icon') });
  }));
}
async function btCandidate(addr, nameHint) {
  if (btPairing) return;
  const seen = btNotified.get(addr);
  if (seen && Date.now() - seen < BT_RENOTIFY_MS) return;
  const info = await btInfo(addr);
  const name = (info && info.name) || nameHint;
  if (!info || info.paired || info.connected || !isMxName(name)) return;
  btNotified.set(addr, Date.now());
  if (!Notification.isSupported()) return;
  const kbd = /keyboard/i.test(info.icon) || /keys/i.test(name);
  const n = new Notification({
    title: `${name} is ready to connect`,
    body: `It is in pairing mode. Click here to connect ${name} to this computer.`,
    icon: path.join(__dirname, 'assets', kbd ? 'full-keyboard.png' : 'full-mouse.png'),
    urgency: 'normal',
  });
  n.on('click', () => btPair(addr, name));
  n.show();
}
function btScanOnce() {
  if (btScan || btPairing) return;
  let p;
  try { p = spawn('bluetoothctl', ['--timeout', String(Math.round(BT_SCAN_MS / 1000)), 'scan', 'on']); } catch (e) { return; }
  btScan = p;
  let buf = '';
  p.stdout.on('data', d => {
    buf += stripAnsi(d.toString());
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      // [NEW] Device AA:BB:.. MX Master 3S   /   [CHG] Device AA:BB:.. Name: MX Master 3S
      const m = /\[(NEW|CHG)\] Device ([0-9A-F:]{17}) (?:Name: |Alias: )?(.*)$/i.exec(l);
      if (m && isMxName(m[3])) btCandidate(m[2].toUpperCase(), m[3].trim());
    }
  });
  p.on('error', () => { btScan = null; });
  p.on('exit', () => { btScan = null; });
}
function btWatch(on) {
  clearInterval(btTimer); btTimer = null;
  if (!on || !plat.IS_LINUX) return;   // bluetoothctl is BlueZ's; Windows and macOS announce pairing themselves
  setTimeout(btScanOnce, 1500);
  btTimer = setInterval(() => { if (win && !win.isDestroyed() && win.isVisible()) btScanOnce(); }, BT_EVERY_MS);
}
// pair, trust and connect in one bluetoothctl session; a keyboard's passkey is shown to type
function btPair(addr, name) {
  if (btPairing) return;
  btPairing = true;
  if (btScan) { try { btScan.kill(); } catch (e) {} btScan = null; }
  const say = (title, body) => { if (Notification.isSupported()) new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') }).show(); };
  say(`Connecting ${name}…`, 'Keep it in pairing mode for a few seconds.');
  let p;
  try { p = spawn('bluetoothctl'); } catch (e) { btPairing = false; return say(`Could not connect ${name}`, 'bluetoothctl is not available.'); }
  let out = '', done = false, step = 'pair';
  const send = c => { try { p.stdin.write(c + '\n'); } catch (e) {} };
  const finish = (ok, why) => {
    if (done) return; done = true; btPairing = false;
    send('scan off'); send('quit'); setTimeout(() => { try { p.kill(); } catch (e) {} }, 1500);
    if (ok) { btNotified.set(addr, Date.now() + 24 * 3600e3); say(`${name} is connected`, 'LogiMX will pick it up in a moment.'); }
    else say(`Could not connect ${name}`, why || 'Put it back in pairing mode and try again from the notification.');
  };
  p.stdout.on('data', d => {
    out += stripAnsi(d.toString());
    const pk = /Passkey:? (\d{6})/i.exec(out) || /Confirm passkey (\d{6})/i.exec(out);
    if (pk && !out.includes('[shown ' + pk[1] + ']')) { out += '[shown ' + pk[1] + ']'; say(`Type ${pk[1]} on ${name}`, 'Then press Enter on it.'); }
    if (/Confirm passkey|Request confirmation/i.test(out) && !out.includes('[confirmed]')) { out += '[confirmed]'; send('yes'); }
    if (step === 'pair' && /Pairing successful|AlreadyExists/i.test(out)) { step = 'connect'; send(`trust ${addr}`); send(`connect ${addr}`); }
    if (step === 'connect' && /Connection successful/i.test(out)) finish(true);
    if (/Failed to pair|AuthenticationFailed|AuthenticationCanceled|not available/i.test(out)) finish(false);
    if (step === 'connect' && /Failed to connect/i.test(out)) finish(false, `${name} paired, but did not connect. Turn it off and on again.`);
  });
  p.on('exit', () => finish(false));
  send('agent KeyboardDisplay'); send('default-agent'); send('scan on');
  setTimeout(() => send(`pair ${addr}`), 3000);
  setTimeout(() => finish(false, 'It took too long. Put it back in pairing mode and try again.'), 45000);
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  win.show();
  win.focus();
}

ipcMain.handle('rpc', (_e, method, params) => rpc(method, params));
ipcMain.handle('agent-connected', () => connected);
ipcMain.handle('save-json', async (_e, name, data) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(os.homedir(), name), filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2));
  return r.filePath;
});
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));
ipcMain.handle('open-path', (_e, p) => { const full = p.replace(/^~/, os.homedir()); if (fs.existsSync(full) && fs.statSync(full).isFile()) shell.showItemInFolder(full); else shell.openPath(full); });
ipcMain.handle('copy-text', (_e, t) => clipboard.writeText(String(t || '')));
ipcMain.handle('app-info', () => ({ version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron, platform: process.platform }));
ipcMain.handle('window-action', (_e, a) => {
  if (a === 'close') { if (win) win.close(); }
  else if (a === 'quit') { app.isQuitting = true; app.quit(); }
  else if (a === 'minimize') { if (win) win.minimize(); }
  else if (a === 'show') showWindow();
});
ipcMain.handle('ui-settings', (_e, patch) => {
  uiSettings = uiSettings || loadUi();
  if (patch) {
    Object.assign(uiSettings, patch);
    saveUi(uiSettings);
    if ('tray' in patch) { if (patch.tray && !tray) createTray(); else if (!patch.tray && tray) { tray.destroy(); tray = null; } }
    if ('autostart' in patch) setAutostart(!!patch.autostart);
  }
  return uiSettings;
});
function run(cmd, args) { return new Promise(resolve => execFile(cmd, args, { timeout: 60000 }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || ''), error: err ? String(stderr || err.message).trim() : '' }))); }
ipcMain.handle('stop-tool', async (_e, name) => {
  if (!plat.IS_LINUX) return plat.stopTool(name);
  if (name === 'solaar') return run('pkill', ['-x', 'solaar']).then(r => ({ ok: true }));
  if (name === 'logid') { const r = await run('pkexec', ['systemctl', 'stop', 'logid']); return r.ok ? { ok: true } : { ok: false, error: r.error || 'cancelled' }; }
  return { ok: false, error: 'unknown tool' };
});
ipcMain.handle('install-udev', async () => {
  if (!plat.IS_LINUX) return { ok: false, error: 'not needed on this system' };
  const rule = resPath('udev', '60-logimx.rules');
  if (!fs.existsSync(rule)) return { ok: false, error: 'rule file missing' };
  const script = `cp '${rule}' /etc/udev/rules.d/60-logimx.rules && udevadm control --reload && udevadm trigger`;
  const r = await run('pkexec', ['sh', '-c', script]);
  return r.ok ? { ok: true } : { ok: false, error: r.error || 'cancelled' };
});
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
  if (!PACKAGED) c.push(path.join(__dirname, '..', 'agent', 'build', 'logimx-agent'));
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
    const unit = `[Unit]\nDescription=LogiMX agent for MX Master and MX Keys devices\nAfter=graphical-session.target\nPartOf=graphical-session.target\n\n[Service]\nType=simple\nExecStart=${agentBin}\nRestart=on-failure\nRestartSec=2\n\n[Install]\nWantedBy=graphical-session.target\n`;
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
  if (on) { try { fs.mkdirSync(autostartDir, { recursive: true }); fs.writeFileSync(desktop, `[Desktop Entry]\nType=Application\nName=LogiMX\nIcon=logimx\nExec=${launchCmd()} --hidden\nStartupWMClass=${WM_CLASS}\nX-GNOME-Autostart-enabled=true\n`); } catch (e) {} }
  else { try { fs.unlinkSync(desktop); } catch (e) {} }
}
// An application's icon for the profile bar, as a data URL. Linux names icons by theme name
// (looked up in hicolor and pixmaps, the way a launcher would); Windows and macOS ask the shell for
// the icon of the app's shortcut or bundle. null when there is none to show.
const appIcons = new Map();
ipcMain.handle('app-icon', async (_e, spec) => {
  const key = JSON.stringify(spec || {});
  if (appIcons.has(key)) return appIcons.get(key);
  let url = null;
  try {
    if (!plat.IS_LINUX) {
      if (spec && spec.id && fs.existsSync(spec.id)) url = (await app.getFileIcon(spec.id, { size: 'normal' })).toDataURL();
    } else if (spec && spec.icon) {
      const name = spec.icon;
      const roots = [path.join(os.homedir(), '.local/share/icons'), '/usr/share/icons', '/var/lib/flatpak/exports/share/icons', path.join(os.homedir(), '.local/share/flatpak/exports/share/icons')];
      const sizes = ['64x64', '48x48', '128x128', '96x96', '256x256', '32x32', 'scalable'];
      const tries = path.isAbsolute(name) ? [name] : [];
      for (const r of roots) for (const s of sizes) for (const ext of ['png', 'svg']) tries.push(path.join(r, 'hicolor', s, 'apps', `${name}.${ext}`));
      for (const ext of ['png', 'svg', 'xpm']) tries.push(path.join('/usr/share/pixmaps', `${name}.${ext}`));
      const hit = tries.find(f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
      if (hit && !hit.endsWith('.xpm')) {
        // only real images: some packages ship a placeholder (a Git LFS pointer) under an icon's name
        const buf = fs.readFileSync(hit), svg = hit.endsWith('.svg');
        const real = svg ? /<svg[\s>]/i.test(buf.slice(0, 4096).toString('utf8')) : buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;
        if (real) url = `data:${svg ? 'image/svg+xml' : 'image/png'};base64,${buf.toString('base64')}`;
      }
    }
  } catch (e) {}
  appIcons.set(key, url);
  return url;
});
// macOS: posting key and button actions needs the Accessibility permission for LogiMX
ipcMain.handle('accessibility', (_e, prompt) => ({ trusted: plat.accessibilityTrusted(prompt), needed: plat.IS_MAC }));
ipcMain.handle('open-accessibility', () => plat.openAccessibilitySettings());
ipcMain.handle('open-bluetooth', () => { if (!plat.IS_LINUX) return plat.openBluetooth(); execFile('gnome-control-center', ['bluetooth'], () => execFile('systemsettings', ['kcm_bluetooth'], () => {})); });
ipcMain.handle('check-updates', () => new Promise(resolve => {
  const https = require('https');
  const req = https.get({ host: 'api.github.com', path: '/repos/aabdelghani/logimx/releases/latest', headers: { 'User-Agent': 'LogiMX' }, timeout: 8000 }, res => {
    let body = ''; res.on('data', c => body += c); res.on('end', () => { try { const j = JSON.parse(body); resolve({ ok: true, latest: (j.tag_name || '').replace(/^v/, ''), url: j.html_url, current: app.getVersion() }); } catch (e) { resolve({ ok: false, error: 'unexpected reply' }); } });
  });
  req.on('error', e => resolve({ ok: false, error: e.message })); req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
}));
// A report for a public issue: what is needed to reproduce a problem and nothing that identifies the
// person. Serial numbers, host names, the user name and the home directory are taken out, and
// custom actions are reduced to their kind (a command or a typed text never leaves the machine).
ipcMain.handle('diag-report', async () => {
  const os = require('os');
  let distro = plat.IS_LINUX ? '' : plat.systemName(); try { if (plat.IS_LINUX) distro = (/^PRETTY_NAME="?([^"\n]*)/m.exec(fs.readFileSync('/etc/os-release', 'utf8')) || [])[1] || ''; } catch (e) {}
  const install = process.env.APPIMAGE ? 'AppImage' : app.isPackaged ? (plat.IS_WIN ? 'installer' : plat.IS_MAC ? '.dmg' : app.getAppPath().startsWith('/opt/') ? '.deb' : 'packaged') : 'from source';
  let st = {}, devs = [], logs = [];
  try { st = await rpc('status', {}); } catch (e) {}
  try { for (const d of await rpc('devices', {})) devs.push(await rpc('device', { id: d.id })); } catch (e) {}
  try { logs = await rpc('logs', {}); } catch (e) {}
  const secrets = new Set([os.hostname(), os.userInfo().username]);
  for (const d of devs) {
    if (d.serial) secrets.add(d.serial);
    for (const h of (((d.state || {}).hosts || {}).names || [])) if (h.name) secrets.add(h.name);
  }
  const redact = t => { let o = String(t).split(os.homedir()).join('~'); for (const x of secrets) if (x && x.length > 2) o = o.split(x).join('[removed]'); return o; };
  const kindOf = a => typeof a === 'string' ? a : a && a.type ? (a.preset || a.type) : 'native';
  const lines = [];
  lines.push('| | |', '|---|---|');
  lines.push(`| LogiMX | ${app.getVersion()} (agent ${st.version || 'not running'}), ${install} |`);
  lines.push(plat.IS_LINUX ? `| System | ${distro || os.type()}, kernel ${os.release()} |` : `| System | ${distro}, ${os.arch()} |`);
  if (plat.IS_LINUX) lines.push(`| Desktop | ${process.env.ORIGINAL_XDG_CURRENT_DESKTOP || process.env.XDG_CURRENT_DESKTOP || 'unknown'}, ${process.env.XDG_SESSION_TYPE || 'unknown session'} |`);
  lines.push(`| Electron | ${process.versions.electron} |`);
  lines.push(`| Agent | ${connected ? 'connected' : 'not connected'}, focus tracking ${st.tracker || 'n/a'}, receivers ${st.receivers || 'none'}, other tools running: ${((st.conflicts || []).map(c => c.name).join(', ')) || 'none'}${st.paused ? ', paused' : ''} |`);
  for (const d of devs) {
    const stt = d.state || {}, prof = ((d.config || {}).profiles || {}).default || {};
    lines.push('', `**${d.name}** (${d.id}, ${d.kind}, ${d.transport || 'unknown link'}) firmware ${d.firmware || '?'}, battery ${d.battery ? d.battery.percent + '%' : 'n/a'}`);
    lines.push(`- features: ${(d.features || []).join(' ')}`);
    lines.push(`- controls: ${(d.controls || []).map(c => c.cid + (c.diverted ? '*' : '')).join(' ')} (* = diverted)`);
    const asg = [];
    for (const sec of ['buttons', 'keys']) for (const [cid, a] of Object.entries(prof[sec] || {})) if (kindOf(a) !== 'native') asg.push(`${cid} ${kindOf(a)}`);
    if (prof.thumbwheel && kindOf(prof.thumbwheel) !== 'native') asg.push(`thumb wheel ${kindOf(prof.thumbwheel)}`);
    lines.push(`- assignments: ${asg.join(', ') || 'all default'}`);
    const bits = [];
    if (stt.dpi) bits.push(`dpi ${stt.dpi.dpi}`);
    if (stt.smartshift) bits.push(`smartshift ${stt.smartshift.mode}/${stt.smartshift.threshold}`);
    if (stt.haptic) bits.push(`haptic ${stt.haptic.enabled ? 'on' : 'off'}/${stt.haptic.level}`);
    if (stt.backlight) bits.push(`backlight ${stt.backlight.enabled ? 'on' : 'off'}`);
    if (stt.fn_swap !== undefined) bits.push(`fn swap ${stt.fn_swap}`);
    if (bits.length) lines.push(`- state: ${bits.join(', ')}`);
  }
  if (!devs.length) lines.push('', 'No devices found.');
  const ring = (general || {}).ring || {};
  lines.push('', `Action ring: ${Array.isArray(ring.profiles) ? ring.profiles.length + ' profile(s)' : 'not set up'}, ${ring.free_pointer ? 'pointer free' : 'steered'}`);
  // how the ring found the pointer on its last openings: the thing that goes wrong on Wayland
  const disp = screen.getAllDisplays().map(d => `${d.bounds.width}x${d.bounds.height}@${d.bounds.x},${d.bounds.y}${d.scaleFactor !== 1 ? ' x' + d.scaleFactor : ''}`).join(', ');
  if (!plat.IS_LINUX) lines.push(`Displays: ${disp}`);
  else lines.push(`Displays: ${disp}; session ${process.env.XDG_SESSION_TYPE || '?'}, DISPLAY ${process.env.DISPLAY ? 'set' : 'unset'}, WAYLAND_DISPLAY ${process.env.WAYLAND_DISPLAY ? 'set' : 'unset'}, ozone ${process.env.ELECTRON_OZONE_PLATFORM_HINT || 'default'}`);
  if (ringLog.length) lines.push('Ring openings (last first): ' + ringLog.slice().reverse().map(r => r.how === 'window' ? `${r.when} window ${r.size} at (${r.x}, ${r.y})` : `${r.when} ${r.raw ? 'steered' : 'pointer'}: ${r.how} at ${r.ms} ms, drawn at (${r.x}, ${r.y})${r.dx !== undefined ? `, moved by (${r.dx}, ${r.dy})` : ''}${r.guess ? `, last known (${Math.round(r.guess.x)}, ${Math.round(r.guess.y)})` : ''}`).join('; '));
  else lines.push('Ring openings: none since the app started');
  const summary = redact(lines.join('\n'));
  const log = redact((logs || []).slice(-40).join('\n'));
  return { summary, log, title: `Problem report: ${devs.map(d => d.name).join(', ') || 'no device'} · LogiMX ${app.getVersion()}` };
});
ipcMain.handle('open-json', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
});

const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);   // macOS: the Dock icon was clicked
  function createTray() {
    tray = new Tray(trayIcon(false));
    tray.on('click', showWindow);
    updateTray();
  }
  function ensureDesktopEntry() {
    if (!plat.IS_LINUX) return;          // the installer made the shortcuts
    if (PACKAGED && !APPIMAGE) return;   // the .deb installs its own entry
    try {
      const iconDir = path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor', '256x256', 'apps');
      const appDir = path.join(os.homedir(), '.local', 'share', 'applications');
      fs.mkdirSync(iconDir, { recursive: true }); fs.mkdirSync(appDir, { recursive: true });
      const iconSrc = path.join(__dirname, 'assets', 'icon.png'), iconDst = path.join(iconDir, 'logimx.png');
      if (!fs.existsSync(iconDst) || fs.statSync(iconDst).size !== fs.statSync(iconSrc).size) fs.copyFileSync(iconSrc, iconDst);
      const entry = `[Desktop Entry]\nType=Application\nName=LogiMX\nComment=Buttons, gestures, keys and Easy-Switch for MX mice and keyboards\nExec=${launchCmd()}\nIcon=logimx\nTerminal=false\nCategories=Settings;HardwareSettings;\nKeywords=mouse;keyboard;MX;Bolt;\nStartupWMClass=${WM_CLASS}\nStartupNotify=true\n`;
      const dst = path.join(appDir, 'logimx.desktop');
      let cur = ''; try { cur = fs.readFileSync(dst, 'utf8'); } catch (e) {}
      if (cur !== entry) { fs.writeFileSync(dst, entry); execFile('update-desktop-database', [appDir], () => {}); execFile('gtk-update-icon-cache', ['-f', '-t', path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor')], () => {}); }
    } catch (e) {}
  }
  // The agent is what actually talks to the devices. Start it ourselves so the app works on a
  // fresh machine without anyone having to run something in a terminal first.
  const AGENT_UNITS = [
    path.join(os.homedir(), '.config', 'systemd', 'user', 'logimx.service'),
    '/usr/lib/systemd/user/logimx.service',
    '/usr/local/lib/systemd/user/logimx.service',
  ];
  function agentCandidates() {
    const c = [];
    if (PACKAGED) c.push(resPath('agent', plat.AGENT_EXE));
    if (!plat.IS_LINUX) {
      // a checkout: single-config builds put the exe in build/, Visual Studio's in build/Release/
      c.push(path.join(__dirname, '..', 'agent', 'build', plat.AGENT_EXE), path.join(__dirname, '..', 'agent', 'build', 'Release', plat.AGENT_EXE));
      return c.filter(p => fs.existsSync(p));
    }
    c.push('/usr/bin/logimx-agent',
           '/usr/local/bin/logimx-agent',
           path.join(os.homedir(), '.local', 'bin', 'logimx-agent'),
           path.join(__dirname, '..', 'agent', 'build', 'logimx-agent'));   // running from a checkout
    return c.filter(p => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch (e) { return false; } });
  }
  const agentRunning = plat.agentRunning;

  let starting = null;
  function startAgent() {
    if (connected) return Promise.resolve({ ok: true });
    if (starting) return starting;
    starting = (async () => {
      if (await agentRunning()) return { ok: true, already: true };
      notify('agent-status', { connected: false, starting: true });
      if (plat.IS_LINUX && AGENT_UNITS.some(u => { try { return fs.existsSync(u); } catch (e) { return false; } })) {
        const viaUnit = await new Promise(res =>
          execFile('systemctl', ['--user', 'start', 'logimx'], { timeout: 8000 }, e => res(!e)));
        if (viaUnit) return { ok: true, unit: true };
      }
      const bin = agentCandidates()[0];
      if (!bin) return { ok: false, error: PACKAGED ? 'agent binary missing from this install' : 'agent is not built yet' };
      try {
        // detached on purpose: the agent is a daemon and keeps the devices configured
        // after this window is closed
        plat.spawnAgent(bin);
      } catch (e) {
        return { ok: false, error: e.message };
      }
      for (let i = 0; i < 24 && !connected; i++) await new Promise(r => setTimeout(r, 250));
      return connected || (await agentRunning()) ? { ok: true } : { ok: false, error: 'the agent exited on startup' };
    })();
    starting.finally(() => { starting = null; });
    return starting;
  }
  restartAgent = startAgent;
  ipcMain.handle('start-agent', () => startAgent());

  // Building from a source checkout, so the app can compile the agent instead of telling
  // someone to open a terminal.
  const sourceRoot = () => path.join(__dirname, '..');
  function canBuildAgent() {
    if (PACKAGED || !plat.IS_LINUX) return false;
    try { fs.accessSync(path.join(sourceRoot(), 'agent', 'CMakeLists.txt'), fs.constants.R_OK); return true; }
    catch (e) { return false; }
  }
  ipcMain.handle('agent-info', () => ({
    binary: agentCandidates()[0] || null,
    canBuild: canBuildAgent(),
    unit: AGENT_UNITS.some(u => { try { return fs.existsSync(u); } catch (e) { return false; } }),
  }));

  const haveCmd = c => new Promise(r => execFile('sh', ['-c', 'command -v ' + c], e => r(!e)));
  function buildProblem(out) {
    const line = String(out).split('\n').find(l => /Could NOT find|No such file or directory|error:|fatal error/i.test(l));
    return line ? line.trim().slice(0, 160) : '';
  }
  let building = null;
  function buildAgent() {
    if (building) return building;
    building = (async () => {
      if (!canBuildAgent()) return { ok: false, error: 'no source checkout to build from' };
      for (const [cmd, hint] of [['cmake', 'cmake'], ['c++', 'g++']]) {
        if (!(await haveCmd(cmd))) return { ok: false, error: `${hint} is not installed (sudo apt install cmake ninja-build g++ libx11-dev)` };
      }
      const root = sourceRoot(), src = path.join(root, 'agent'), out = path.join(root, 'agent', 'build');
      const run = (cmd, args) => new Promise(res => execFile(cmd, args, { cwd: root, timeout: 420000, maxBuffer: 8 << 20 },
        (err, so, se) => res({ ok: !err, out: String(so || '') + String(se || '') })));
      const gen = (await haveCmd('ninja')) ? ['-G', 'Ninja'] : [];
      notify('agent-build', { step: 'Configuring the build…' });
      let r = await run('cmake', ['-B', out, '-S', src, ...gen, '-DCMAKE_BUILD_TYPE=Release']);
      if (!r.ok) return { ok: false, error: buildProblem(r.out) || 'cmake could not configure the build' };
      notify('agent-build', { step: 'Compiling the agent…' });
      r = await run('cmake', ['--build', out, '-j', String(Math.max(2, os.cpus().length))]);
      if (!r.ok) return { ok: false, error: buildProblem(r.out) || 'the build failed' };
      return { ok: true };
    })();
    building.finally(() => { building = null; });
    return building;
  }
  ipcMain.handle('build-agent', async () => {
    const b = await buildAgent();
    if (!b.ok) return b;
    notify('agent-build', { step: 'Starting the agent…' });
    return startAgent();
  });
  app.whenReady().then(() => {
    ensureDesktopEntry();
    ensureAutostart();
    setTimeout(() => { startAgent().catch(() => {}); }, 600);
    uiSettings = loadUi();
    if (uiSettings.tray !== false) createTray();
    connect();
    createWindow();
    flow.init({ win, getUi: () => (uiSettings = uiSettings || loadUi()), setUi: p => { uiSettings = uiSettings || loadUi(); Object.assign(uiSettings, p); saveUi(uiSettings); } });
    try { registerShortcuts(); } catch (e) {}
  });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); flow.shutdown(); });
  app.on('window-all-closed', () => { /* stay in the tray */ });
  app.on('before-quit', () => { app.isQuitting = true; flow.shutdown(); });
}
