// LogiMX UI: Electron main process. Talks to the C++ agent over a Unix socket (a named pipe on
// Windows), keeps a tray indicator with battery levels and raises low battery notifications.
const { app, globalShortcut } = require('electron');
const plat = require('./platform');
const flow = require('./flow');
// People see NotLogi; settings stay in the folder earlier versions used (LogiMX), so an update keeps them
app.setName('NotLogi');
app.setPath('userData', require('path').join(app.getPath('appData'), 'LogiMX'));
// Windows ties notifications to the Start-menu shortcut through this id (the installer sets it)
if (plat.IS_WIN) app.setAppUserModelId('io.github.aabdelghani.logimx');
// The main process in parts (main/), loaded once the app's name and settings folder are set;
// each one gets what it uses from the others.
const parts = ['env', 'settings', 'window', 'tray', 'agent', 'osd', 'battery', 'emoji', 'ring', 'media', 'bluetooth', 'system', 'autostart'].map(n => require('./main/' + n));
const state = require('./main/state');
const ctx = Object.assign({}, ...parts.map(p => p.provide));
parts.forEach(p => p.link(ctx));
const { btSetMode, btStopScan, connect, createTray, createWindow, ensureAutostart, ensureRing, ensureDesktopEntry, loadUi, registerShortcuts, saveUi, showWindow, startAgent } = ctx;
// the logic shared with the windows (ES modules in shared/, loaded before the app starts)
const sharedReady = Promise.all([import('./shared/ring.mjs'), import('./shared/battery.mjs')]).then(([r, b]) => { state.Ring = r; state.Battery = b; });
app.isQuitting = false;

const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);   // macOS: the Dock icon was clicked
  app.whenReady().then(async () => {
    await sharedReady;
    ensureDesktopEntry();
    ensureAutostart();
    setTimeout(() => { startAgent().catch(() => {}); }, 600);
    state.uiSettings = loadUi();
    if (state.uiSettings.tray !== false) createTray();
    connect();
    createWindow();
    // the action ring's window, made and loaded ahead so the first press opens it like any other
    setTimeout(() => { try { ensureRing(); } catch (e) {} }, 1500);
    flow.init({ win: state.win, getUi: () => (state.uiSettings = state.uiSettings || loadUi()), setUi: p => { state.uiSettings = state.uiSettings || loadUi(); Object.assign(state.uiSettings, p); saveUi(state.uiSettings); } });
    try { registerShortcuts(); } catch (e) {}
    btSetMode();
  });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); flow.shutdown(); });
  app.on('window-all-closed', () => { /* stay in the tray */ });
  app.on('before-quit', () => { app.isQuitting = true; flow.shutdown(); state.btMode = null; clearTimeout(state.btTimer); btStopScan(); });
}
