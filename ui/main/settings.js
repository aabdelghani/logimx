// The window's own settings (tray, autostart, theme, …), kept in ui-settings.json in the user data folder.
const path = require('path');
const { app, ipcMain } = require('electron');
const fs = require('fs');
const state = require('./state');

// from the other parts of the main process, filled in by link()
let btSetMode, createTray, setAutostart;
exports.link = ctx => { ({ btSetMode, createTray, setAutostart } = ctx); };

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
ipcMain.handle('set-theme', (_e, theme) => { state.uiSettings = state.uiSettings || loadUi(); state.uiSettings.theme = theme; saveUi(state.uiSettings); });
ipcMain.handle('ui-settings', (_e, patch) => {
  state.uiSettings = state.uiSettings || loadUi();
  if (patch) {
    Object.assign(state.uiSettings, patch);
    saveUi(state.uiSettings);
    if ('tray' in patch) { if (patch.tray && !state.tray) createTray(); else if (!patch.tray && state.tray) { state.tray.destroy(); state.tray = null; } }
    if ('autostart' in patch) setAutostart(!!patch.autostart);
    if ('bt_watch' in patch) btSetMode();
  }
  return state.uiSettings;
});

exports.provide = { UI_SETTINGS_PATH, loadUi, saveUi };
