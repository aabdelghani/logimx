// The language of the windows, the tray and the notices: the one chosen in Settings, or the system's.
// Each window asks for it as it loads (window.i18n.load in its preload); the main process's own
// text uses the shared module's t().
const path = require('path');
const fs = require('fs');
const { app, ipcMain, BrowserWindow } = require('electron');
const state = require('./state');

// from the other parts of the main process, filled in by link()
let createTray;
exports.link = ctx => { ({ createTray } = ctx); };

function languageNow() {
  const I = state.I18n, pref = (state.uiSettings || {}).language || 'system';
  const sys = (app.getPreferredSystemLanguages && app.getPreferredSystemLanguages()[0]) || app.getLocale();
  const code = pref === 'system' ? I.pick(sys) : I.pick(pref);
  let dict = {};
  if (code !== 'en') { try { dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'locales', code + '.json'), 'utf8')); } catch (e) {} }
  return { lang: code, dict };
}
let current = null;
function applyLanguage() { current = languageNow(); state.I18n.setLanguage(current.lang, current.dict); }
ipcMain.on('i18n', e => { e.returnValue = current || languageNow(); });
// another language chosen: every window loads again in it, and the tray menu is made anew
function changeLanguage() {
  applyLanguage();
  for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.reload(); } catch (e) {} }
  if (state.tray) { state.tray.destroy(); state.tray = null; createTray(); }
}

exports.provide = { applyLanguage, changeLanguage };
