// View model shared by every screen: the device and profile on screen, its pages, how actions are
// named and where the window goes next.
import * as Prof from '../../shared/profiles.mjs';
import { isMouse } from '../../shared/profiles.mjs';
import * as Act from '../../shared/actions.mjs';

// from the rest of the window, filled in by link()
let KEYBOARD_PHOTOS, MOUSE_BOTTOMS, MOUSE_PHOTOS, S, render, root, sec;
export function link(ctx) { ({ KEYBOARD_PHOTOS, MOUSE_BOTTOMS, MOUSE_PHOTOS, S, render, root, sec } = ctx); }

const dev = () => S.devices.find(d => d.id === S.dev) || null;
const profileOf = Prof.profileOf;
// The profile the device view shows: one being previewed (hover in the profile bar), else the one
// picked for editing, else the global one. An app profile only holds what it changes; anything
// it leaves alone comes from the global profile, the same way the agent applies it.
const shownProfile = () => S.previewProfile || S.editProfile || 'default';
const ownAssignment = Prof.ownAssignment;
const assignment = (d, section, cid, prof) => Prof.assignment(d, section, cid, prof || shownProfile());
// set in the shown profile (not the global one) on a control: marked on the photo
const overridden = (d, section, cid) => Prof.overridden(d, section, cid, shownProfile());
// names and icons of actions (shared/actions.mjs), with the agent's presets and this OS
const assignIcon = (a, native) => Act.assignIcon(a, native, S.presets);
const presetLabel = a => Act.presetLabel(a, S.presets, OS());
const actionIcon = a => Act.actionIcon(a, S.presets);
// which OS the app runs on: names of keys and settings follow it
const OS = () => (S.appInfo && S.appInfo.platform) || 'linux';
const IS_WIN = () => OS() === 'win32', IS_MAC = () => OS() === 'darwin', IS_LINUX = () => !IS_WIN() && !IS_MAC();
const META = () => IS_WIN() ? 'Win' : IS_MAC() ? 'Cmd' : 'Super';
const ALT = () => IS_MAC() ? 'Option' : 'Alt';
const keyName = k => Act.keyName(k, OS());
const agentNeedsBuild = () => !S.connected && !!S.agentInfo && !S.agentInfo.binary && !!S.agentInfo.canBuild;
const CID = { middle: 82, back: 83, forward: 86, gesture: 195, mode: 196 };

// ------------------------------------------------------------- nav
const PAGES = {
  buttons: ['Buttons', 'fa-computer-mouse'], gestures: ['Gestures & action ring', 'fa-hand-pointer'], pointer: ['Point & scroll', 'fa-arrow-pointer'], thumb: ['Thumb wheel', 'fa-arrows-left-right'],
  haptics: ['Haptic feedback', 'fa-wave-square'], easy: ['Easy-Switch', 'fa-right-left'], info: ['Battery & info', 'fa-battery-three-quarters'], keys: ['Keys', 'fa-keyboard'], backlight: ['Backlight', 'fa-lightbulb'],
  home: ['Home', 'fa-house'], apps: ['Profiles', 'fa-layer-group'], ring: ['Action ring', 'fa-circle-notch'], notif: ['Notifications', 'fa-bell'], backup: ['Backup & sync', 'fa-cloud-arrow-down'], settings: ['Settings', 'fa-sliders'], about: ['About', 'fa-circle-info'], flow: ['Flow', 'fa-diagram-project'],
};
const devicePages = d => isMouse(d) ? ['buttons', 'gestures', 'pointer'].concat((d.state || {}).haptic ? ['haptics'] : [], ['easy', 'flow', 'info']) : ['keys', 'backlight', 'easy', 'flow', 'info'];
// what the device's left bar lists; the other device pages (Gestures, opened from a button set to
// gestures, and the MX Master 4's haptics, folded into Settings) are reached from these
const navPages = d => isMouse(d) ? ['buttons', 'pointer', 'easy', 'flow'] : ['keys', 'backlight', 'easy', 'flow'];
const generalPagesAll = ['apps', 'ring', 'notif', 'backup', 'settings', 'about'];
const generalPages = () => S.devices.some(isMouse) ? generalPagesAll.filter(p => p !== 'ring') : generalPagesAll;
function go(page, devId) { S.ringPath = []; if (devId !== undefined && devId !== S.dev) { S.editProfile = null; S.previewProfile = null; } if (page !== 'gestures') S.cfgFrom = null; S.page = page; if (devId !== undefined) S.dev = devId; S.dlg = null; S.menu = null; S.appDetail = null; render(); }

const easyView = d => !!(d && (d.state || {}).hosts && (isMouse(d) ? MOUSE_BOTTOMS[d.id] : (KEYBOARD_PHOTOS[d.id] || {}).hosts));
const backlightPanel = d => !!(d && !S.blClosed && !S.appDetail && !S.previewProfile && ((S.page === 'backlight' && !isMouse(d) && (d.state || {}).backlight && KEYBOARD_PHOTOS[d.id]) || (S.page === 'pointer' && isMouse(d) && MOUSE_PHOTOS[d.id]) || (S.page === 'easy' && easyView(d))));

function countOverrides(d, key) {
  const p = profileOf(d, key), def = profileOf(d, 'default'); let n = 0;
  for (const sec of ['buttons', 'keys']) for (const [cid, a] of Object.entries(p[sec] || {})) if (JSON.stringify(a) !== JSON.stringify((def[sec] || {})[cid])) n++;
  if (p.thumbwheel !== undefined && JSON.stringify(p.thumbwheel) !== JSON.stringify(def.thumbwheel)) n++;
  return n;
}
const deviceProfiles = d => Object.entries(((d && d.config) || {}).profiles || {}).filter(([k]) => k !== 'default').map(([key, p]) => ({ key, name: p.name || key, match: p.match || [] }));
// a device the agent knows but cannot reach right now (receiver link down, or Bluetooth gone)
const isOffline = d => d.online === false || !!d.offline;
const drawerUp = () => !!(S.picker && S.picker.drawer && (S.dlg === 'picker' || (S.dlg === 'prompt' && S.prompt && S.prompt.back === 'picker')));
function prompt(title, fields, onOk, ok, note) { S.prompt = { title, fields, onOk, ok, note, back: drawerUp() ? 'picker' : null }; S.dlg = 'prompt'; render(); setTimeout(() => { const i = root.querySelector('.dlg input'); if (i) i.focus(); }, 30); }
// What the focus tracker will report for an application picked by name: its window class from the
// installed list (or its id), else the name itself in lower case
function appClass(name) {
  const n = (name || '').trim().toLowerCase(), a = (S.apps || []).find(x => (x.name || '').toLowerCase() === n);
  return a ? (a.wm_class || a.id || n) : n.replace(/\s+/g, '-');
}

export const provide = { dev, profileOf, shownProfile, ownAssignment, assignment, overridden, assignIcon, presetLabel, actionIcon, OS, IS_WIN, IS_MAC, IS_LINUX, META, ALT, keyName, agentNeedsBuild, CID, PAGES, devicePages, navPages, generalPagesAll, generalPages, go, easyView, backlightPanel, countOverrides, deviceProfiles, isOffline, drawerUp, prompt, appClass };
