// Where NotLogi runs from: the platform, the app's own folder, how it is launched, the agent's socket.
const { app } = require('electron');
const path = require('path');
const plat = require('../platform');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder

exports.link = () => {};

const PACKAGED = app.isPackaged;
const APPIMAGE = process.env.APPIMAGE || '';
// the window's class on X11: the app's name in lower case (Electron 38 and later lower-case it, "notlogi"); every
// desktop entry names it as StartupWMClass, which GNOME matches exactly to show the logo instead of a cog
const WM_CLASS = 'notlogi';
// files shipped next to the app: repo root in development, resources/ in a package
const resPath = (...p) => PACKAGED ? path.join(process.resourcesPath, ...p) : path.join(ROOT, '..', ...p);
// how to launch this very app again (autostart, desktop entry)
const launchCmd = () => APPIMAGE ? `"${APPIMAGE}"` : PACKAGED ? process.execPath : `${process.execPath} ${ROOT} --no-sandbox --class=${WM_CLASS}`;

const SOCKET = plat.agentEndpoint();

exports.provide = { PACKAGED, APPIMAGE, WM_CLASS, resPath, launchCmd, SOCKET };
