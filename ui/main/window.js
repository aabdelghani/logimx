// The settings window: creating and showing it, what it asks of the system (files, links, the
// clipboard), and the global shortcuts.
const plat = require('../platform');
const { ipcMain, screen, globalShortcut, Notification, nativeTheme, BrowserWindow, app, dialog, shell, clipboard } = require('electron');
const path = require('path');
const flow = require('../flow');
const os = require('os');
const fs = require('fs');
const state = require('./state');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder
const t = (s, v) => (state.I18n ? state.I18n.t(s, v) : s);

// from the other parts of the main process, filled in by link()
let refreshGeneral, rpc, updateTray;
exports.link = ctx => { ({ refreshGeneral, rpc, updateTray } = ctx); };

function notify(channel, data) {
  if (state.win && !state.win.isDestroyed()) state.win.webContents.send(channel, data);
}

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
ipcMain.handle('screen-info', () => ({ cursor: screen.getCursorScreenPoint(), displays: screen.getAllDisplays().map(d => ({ id: d.id, bounds: d.bounds, workArea: d.workArea, scale: d.scaleFactor })), picker: state.emojiWin && !state.emojiWin.isDestroyed() ? { visible: state.emojiWin.isVisible(), bounds: state.emojiWin.getBounds() } : null }));

function registerShortcuts() {
  for (const n of [1, 2, 3]) globalShortcut.register(`Super+Alt+${n}`, () => { for (const d of state.devices) rpc('change_host', { id: d.id, host: n - 1 }).catch(() => {}); });
  globalShortcut.register('Super+Alt+O', async () => { const on = state.general.osd_enabled === false; try { state.general = await rpc('set_general', { osd_enabled: on }); } catch (e) {} if (Notification.isSupported()) new Notification({ title: on ? t('Overlays on') : t('Overlays off'), icon: path.join(ROOT, 'assets', 'icon.png') }).show(); });
  globalShortcut.register('Super+Alt+P', () => rpc(state.paused ? 'resume_diversion' : 'pause_diversion').then(() => refreshGeneral().then(updateTray)).catch(() => {}));
}

// ------------------------------------------------------------------- window
// The window and everything in it scaled together. Auto fits the 1420 × 800 layout into about
// 80% of the screen it opens on: a 1080p monitor keeps it at 100%, a 13" laptop (1440 × 900)
// shows it at about 80%. A size chosen in the settings is used as it is.
const BASE = { w: 1420, h: 800, minW: 980, minH: 640 };
function windowScale() {
  const s = (state.uiSettings || {}).scale;
  if (typeof s === 'number' && s >= 0.5 && s <= 1.5) return s;
  const wa = screen.getPrimaryDisplay().workAreaSize;
  return Math.round(Math.max(0.7, Math.min(1, wa.width * 0.8 / BASE.w, wa.height * 0.8 / BASE.h)) * 100) / 100;
}
const scaled = (v, f) => Math.round(v * f);
// a new size from the settings: the window keeps its place and grows or shrinks with its contents
function applyWindowScale() {
  const w = state.win;
  if (!w || w.isDestroyed()) return;
  const f = windowScale(), old = w.webContents.getZoomFactor() || 1;
  w.webContents.setZoomFactor(f);
  w.setMinimumSize(scaled(BASE.minW, f), scaled(BASE.minH, f));
  if (!w.isMaximized() && !w.isFullScreen()) { const [cw, ch] = w.getSize(); w.setSize(scaled(cw * f / old, 1), scaled(ch * f / old, 1)); }
}

function createWindow() {
  nativeTheme.themeSource = 'dark';
  const f = windowScale();
  state.win = new BrowserWindow({
    width: scaled(BASE.w, f),
    height: scaled(BASE.h, f),
    minWidth: scaled(BASE.minW, f),
    minHeight: scaled(BASE.minH, f),
    backgroundColor: '#0e1116',
    title: 'NotLogi',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    frame: false,
    show: !plat.startedAtLogin() && !(state.uiSettings && state.uiSettings.start_hidden),
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  state.win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  state.win.webContents.on('did-finish-load', () => { if (state.win && !state.win.isDestroyed()) state.win.webContents.setZoomFactor(windowScale()); });
  state.win.on('close', e => {
    const keep = !state.uiSettings || state.uiSettings.minimize !== false;
    if (!app.isQuitting && state.tray && keep) { e.preventDefault(); state.win.hide(); }
  });
  state.win.on('closed', () => { state.win = null; });
  flow.setWindow(state.win);
}

function showWindow() {
  if (!state.win || state.win.isDestroyed()) createWindow();
  state.win.show();
  state.win.focus();
}
ipcMain.handle('save-json', async (_e, name, data) => {
  const r = await dialog.showSaveDialog(state.win, { defaultPath: path.join(os.homedir(), name), filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2));
  return r.filePath;
});
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));
ipcMain.handle('open-path', (_e, p) => { const full = p.replace(/^~/, os.homedir()); if (fs.existsSync(full) && fs.statSync(full).isFile()) shell.showItemInFolder(full); else shell.openPath(full); });
ipcMain.handle('copy-text', (_e, t) => clipboard.writeText(String(t || '')));
ipcMain.handle('app-info', () => ({ version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron, platform: process.platform }));
ipcMain.handle('window-action', (_e, a) => {
  if (a === 'close') { if (state.win) state.win.close(); }
  else if (a === 'quit') { app.isQuitting = true; app.quit(); }
  else if (a === 'minimize') { if (state.win) state.win.minimize(); }
  else if (a === 'show') showWindow();
});
ipcMain.handle('open-json', async () => {
  const r = await dialog.showOpenDialog(state.win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
});

exports.provide = { notify, offTaskbar, registerShortcuts, createWindow, showWindow, applyWindowScale };
