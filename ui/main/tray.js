// The tray icon, its menu, and the status panel that opens from it.
const { nativeImage, app, Menu, BrowserWindow, screen, ipcMain, Tray } = require('electron');
const path = require('path');
const state = require('./state');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder

// from the other parts of the main process, filled in by link()
let loadUi, offTaskbar, refreshGeneral, rpc, showWindow;
exports.link = ctx => { ({ loadUi, offTaskbar, refreshGeneral, rpc, showWindow } = ctx); };

// --------------------------------------------------------------------- tray
function trayIcon(warn) {
  const img = nativeImage.createFromPath(path.join(ROOT, 'assets', warn ? 'tray-warn.png' : 'tray.png'));
  img.setTemplateImage(false);
  return img;
}

const menuIcon = n => nativeImage.createFromPath(path.join(ROOT, 'assets', 'tray', n + '.png'));
const batteryBar = pct => { const n = Math.round(Math.max(0, Math.min(100, pct)) / 10); return '▰'.repeat(n) + '▱'.repeat(10 - n); };
function updateTray() {
  if (!state.tray) return;
  const warn = state.devices.some(d => state.Battery.isLow(d.battery));
  state.tray.setImage(trayIcon(warn));
  const lines = state.devices.map(d => {
    const b = d.battery;
    return `${d.name}: ${state.Battery.batteryText(b)}`;
  });
  state.tray.setToolTip(state.connected ? (lines.length ? lines.join('\n') + (state.paused ? '\nCustom buttons paused' : '') : 'NotLogi: no devices') : 'NotLogi: agent not running');
  const items = [];
  if (!state.connected) items.push({ label: 'Agent not running', enabled: false });
  else if (!state.devices.length) items.push({ label: 'No devices', enabled: false });
  for (const d of state.devices) {
    const b = d.battery;
    // not connected: its name only, nothing to switch or read until it is back
    if (d.online === false) { items.push({ label: `${d.name}   not connected`, icon: menuIcon(d.kind === 'keyboard' ? 'keyboard' : 'mouse'), enabled: false }, { type: 'separator' }); continue; }
    const bat = state.Battery.batteryText(b);
    items.push({ label: `${d.name}   ${bat}`, icon: menuIcon(d.kind === 'keyboard' ? 'keyboard' : 'mouse'), enabled: false });
    if (state.Battery.known(b)) items.push({ label: `      ${batteryBar(b.percent)}`, enabled: false });
    if (d.state && d.state.hosts) {
      items.push({ label: '      Easy-Switch', enabled: false });
      for (const h of d.state.hosts.names.filter(h => h.paired)) {
        const cur = h.index === d.state.hosts.current;
        items.push({ label: `      ${cur ? '●' : '○'}  ${h.index + 1}   ${h.name || 'host ' + (h.index + 1)}`, enabled: !cur, click: () => rpc('change_host', { id: d.id, host: h.index }).catch(() => {}) });
      }
    }
    items.push({ type: 'separator' });
  }
  items.push({ label: 'Open NotLogi', icon: menuIcon('window'), click: showWindow });
  items.push({ label: state.paused ? 'Resume custom buttons' : 'Pause custom buttons', icon: menuIcon(state.paused ? 'play' : 'pause'), enabled: state.connected, click: () => rpc(state.paused ? 'resume_diversion' : 'pause_diversion').then(() => refreshGeneral().then(updateTray)).catch(() => {}) });
  items.push({ label: 'Status panel', icon: menuIcon('panel'), click: () => showTrayPanel() });
  items.push({ label: 'Quit', icon: menuIcon('power'), click: () => { app.isQuitting = true; app.quit(); } });
  state.tray.setContextMenu(Menu.buildFromTemplate(items));
  pushTrayState();
}

// --------------------------------------------------------- tray status panel
let trayWin = null;
const TRAY_W = 340;
function trayState() { state.uiSettings = state.uiSettings || loadUi(); return { connected: state.connected, paused: state.paused, devices: state.devices, theme: state.uiSettings.theme || 'light' }; }
function pushTrayState() { if (trayWin && !trayWin.isDestroyed()) trayWin.webContents.send('tray-state', trayState()); }
function ensureTrayPanel() {
  if (trayWin && !trayWin.isDestroyed()) return trayWin;
  trayWin = new BrowserWindow({
    width: TRAY_W, height: 320, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, show: false,
    webPreferences: { preload: path.join(ROOT, 'preload-tray.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  trayWin.loadFile(path.join(ROOT, 'renderer', 'tray.html'));
  trayWin.on('blur', () => { if (trayWin && !trayWin.isDestroyed() && trayWin.isVisible()) trayWin.hide(); });
  return trayWin;
}
function showTrayPanel() {
  const w = ensureTrayPanel();
  if (w.isVisible()) { w.hide(); return; }
  const n = state.devices.length || 1;
  const height = 8 + n * 96 + 9 + 3 * 40 + 8;
  let a; try { const tb = state.tray && state.tray.getBounds(); a = screen.getDisplayNearestPoint(tb && tb.width ? { x: tb.x, y: tb.y } : screen.getCursorScreenPoint()).workArea; } catch (e) { a = screen.getPrimaryDisplay().workArea; }
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
  if (name === 'pause') { const want = !state.paused; state.paused = want; pushTrayState(); try { await rpc(want ? 'pause_diversion' : 'resume_diversion'); await refreshGeneral(); } catch (e) {} updateTray(); return; }
  if (name === 'host') { try { await rpc('change_host', { id: params.id, host: params.host }); } catch (e) {} return; }
});

// ----------------------------------------------------------------- the agent
// The agent runs as a user service (or a plain process); the window starts it, and can build it
// from source when there is no binary yet.
function createTray() {
  state.tray = new Tray(trayIcon(false));
  state.tray.on('click', showWindow);
  updateTray();
}

exports.provide = { trayIcon, menuIcon, batteryBar, updateTray, TRAY_W, trayState, pushTrayState, ensureTrayPanel, showTrayPanel, createTray };
