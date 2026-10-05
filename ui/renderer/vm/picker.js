// View model: the action picker: what each control can do, what is recommended for it, and
// assigning the picked action.
import { PRESET_ICON, ICON } from '../../shared/actions.mjs';

// from the rest of the window, filled in by link()
let ALT, META, S, actionIcon, api, assignment, dev, deviceProfiles, gestureControl, gestureObject, presetItem, presetLabel, render, renderAppList, ringSlots, saveRingSlots, sec, setAssign, toast;
export function link(ctx) { ({ ALT, META, S, actionIcon, api, assignment, dev, deviceProfiles, gestureControl, gestureObject, presetItem, presetLabel, render, renderAppList, ringSlots, saveRingSlots, sec, setAssign, toast } = ctx); }

// ----------------------------------------------------------- dialogs
const PICKER_CATS = [['all', 'All', 'fa-list'], ['key', 'Keystroke', 'fa-keyboard'], ['media', 'Media', 'fa-play'], ['window', 'Window', 'fa-window-maximize'], ['ws', 'Workspaces', 'fa-table-cells-large'], ['cmd', 'Command', 'fa-terminal'], ['app', 'Apps', 'fa-rocket'], ['device', 'Device', 'fa-computer-mouse']];
const CAT_OF = { media: ['volume_up', 'volume_down', 'mute', 'mic_mute', 'play_pause', 'next_track', 'prev_track', 'brightness_up', 'brightness_down'],
  window: ['close_window', 'maximize', 'minimize', 'tile_left', 'tile_right', 'show_desktop', 'app_switcher', 'screenshot', 'screenshot_area', 'lock', 'terminal', 'calculator', 'emoji_picker', 'action_ring', 'emoji', 'context_menu', 'copy', 'paste', 'undo', 'redo', 'zoom_in', 'zoom_out', 'tab_next', 'tab_prev'],
  ws: ['overview', 'workspace_next', 'workspace_prev'],
  device: ['native', 'nothing', 'middle_click', 'back', 'forward', 'easy_switch_1', 'easy_switch_2', 'easy_switch_3', 'dpi_cycle', 'smartshift_toggle', 'open_home', 'gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan', 'hscroll', 'vscroll', 'zoom_wheel', 'volume_wheel', 'tabs_wheel', 'workspaces_wheel', 'brightness_wheel'] };
const CAT_LABEL = { media: 'Media', window: 'Window', ws: 'Shell', device: 'Device' };
function pickerItems(p) {
  const all = S.presets.all;
  const allowed = new Set(p.section === 'ring' ? S.presets.buttons.filter(k => !['native', 'nothing', 'action_ring'].includes(k) && all[k] && all[k].type !== 'gesture') : p.section === 'thumbwheel' ? S.presets.wheel : p.section === 'gesture' ? Object.keys(all).filter(k => ['nothing', 'keystroke', 'button', 'command', 'change_host', 'dpi_cycle', 'scroll', 'smartshift_toggle', 'open'].includes(all[k].type)) : p.section === 'keys' ? S.presets.keys.filter(k => k !== 'action_ring') : S.presets.buttons);
  const items = [];
  for (const [cat, keys] of Object.entries(CAT_OF)) for (const k of keys) if (allowed.has(k) && all[k] && (p.cat === 'all' || p.cat === cat)) {
    if (all[k].type === 'gesture' && p.section !== 'buttons') continue;
    if (p.section === 'buttons' && all[k].type === 'gesture' && !(p.ctl && p.ctl.raw_xy)) continue;
    items.push({ key: k, cat, icon: PRESET_ICON[k] || ICON[all[k].type], label: all[k].label, meta: CAT_LABEL[cat] });
  }
  const q = (p.q || '').toLowerCase();
  return q ? items.filter(i => i.label.toLowerCase().includes(q)) : items;
}
// The key panel, laid out like Options+: RECOMMENDED open on top (from its per-key table,
// recommendations_slot_win.json: the key's own function, then a keystroke, then the action ring),
// then its categories folded, then what only LogiMX has. While searching, every match is listed.
// Options+ card -> LogiMX preset, for the cards it recommends past a key's own function
const OPTS_CARD = { win_print_screen: 'screenshot', win_emoji: 'emoji' };
// key control id -> what Options+ names the key's own function, plus any extra card it offers
const RECOMMEND = { 10: ['Calculator'], 110: ['Show desktop'], 111: ['Lock screen'], 191: ['Screen capture', 'win_print_screen'], 199: ['Brightness down'], 200: ['Brightness up'], 212: ['Search'], 224: ['Task view'], 225: ['Notifications'], 226: ['Backlight down'], 227: ['Backlight up'], 228: ['Previous track'], 229: ['Play / Pause'], 230: ['Next track'], 231: ['Mute'], 232: ['Volume down'], 233: ['Volume up'], 234: ['Context menu'], 259: ['Dictation'], 264: ['Emoji menu', 'win_emoji'], 266: ['Screen snip'], 284: ['Mute microphone'] };
// a mouse's buttons and thumb wheel: what Options+ recommends for each (recommendations_slot_win.json,
// MX Master 3S), as LogiMX presets; its own function comes first as Default
const MOUSE_RECOMMEND = { 82: ['smartshift_toggle', 'overview', 'show_desktop', 'gesture_navigation', 'action_ring'], 83: ['copy', 'volume_down', 'undo', 'action_ring'], 86: ['paste', 'volume_up', 'redo', 'action_ring'],
  195: ['gesture_navigation', 'overview', 'show_desktop', 'screenshot_area', 'screenshot', 'app_switcher', 'action_ring'], 196: ['overview', 'middle_click', 'gesture_navigation', 'screenshot_area', 'screenshot', 'action_ring'], 416: ['action_ring', 'smartshift_toggle', 'overview', 'screenshot'],
  thumb: ['zoom_wheel', 'volume_wheel', 'tabs_wheel'] };
// Options+ tailors the recommended list to the application being edited (Chrome, Word, Zoom, ...);
// these are the Linux equivalents. 'app:' items are ready-made keystrokes, the rest are presets.
const AK = (keys, label, icon) => ({ type: 'keystroke', keys, label, icon });
const AW = (plus, minus, label) => ({ type: 'adapter', step: 120, label, plus: { type: 'keystroke', keys: plus }, minus: { type: 'keystroke', keys: minus } });
const APP_ACTIONS = {
  new_tab: AK(['KEY_LEFTCTRL', 'KEY_T'], 'New tab'), close_tab: AK(['KEY_LEFTCTRL', 'KEY_W'], 'Close tab'), reopen_tab: AK(['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_T'], 'Reopen closed tab'),
  refresh: AK(['KEY_F5'], 'Refresh page'), save: AK(['KEY_LEFTCTRL', 'KEY_S'], 'Save'), find: AK(['KEY_LEFTCTRL', 'KEY_F'], 'Find'),
  paste_special: AK(['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_V'], 'Paste special'), page_up: AK(['KEY_PAGEUP'], 'Page up'), page_down: AK(['KEY_PAGEDOWN'], 'Page down'),
  slide_prev: AK(['KEY_PAGEUP'], 'Previous slide'), slide_next: AK(['KEY_PAGEDOWN'], 'Next slide'), start_show: AK(['KEY_F5'], 'Start slide show'),
  zoom_mic: AK(['KEY_LEFTALT', 'KEY_A'], 'Mute / unmute microphone'), zoom_cam: AK(['KEY_LEFTALT', 'KEY_V'], 'Camera on / off'),
  teams_mic: AK(['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_M'], 'Mute / unmute microphone'), teams_cam: AK(['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_O'], 'Camera on / off'),
  back_forward_wheel: AW(['KEY_LEFTALT', 'KEY_RIGHT'], ['KEY_LEFTALT', 'KEY_LEFT'], 'Back / forward'), page_wheel: AW(['KEY_PAGEDOWN'], ['KEY_PAGEUP'], 'Page down / up'),
  slide_wheel: AW(['KEY_PAGEDOWN'], ['KEY_PAGEUP'], 'Next / previous slide'), undo_redo_wheel: AW(['KEY_LEFTCTRL', 'KEY_Y'], ['KEY_LEFTCTRL', 'KEY_Z'], 'Redo / undo'),
  text_size_wheel: AW(['KEY_LEFTCTRL', 'KEY_RIGHTBRACE'], ['KEY_LEFTCTRL', 'KEY_LEFTBRACE'], 'Text size'),
};
for (const [k, a] of Object.entries(APP_ACTIONS)) a.preset = 'app:' + k;   // so the list can tell which one is in use
const BROWSER = { name: 'browser', match: /chrom|firefox|edge|brave|vivaldi|opera|librewolf|zen/i,
  thumb: ['tabs_wheel', 'zoom_wheel', 'app:back_forward_wheel', 'volume_wheel'], 82: ['app:refresh', 'app:new_tab', 'smartshift_toggle', 'action_ring'],
  83: ['back', 'undo', 'copy', 'app:close_tab', 'app:new_tab'], 86: ['forward', 'redo', 'paste', 'app:reopen_tab', 'app:refresh', 'app:new_tab'],
  195: ['gesture_navigation', 'app:refresh', 'app:close_tab', 'app:reopen_tab', 'app:new_tab', 'action_ring'], 196: ['middle_click', 'gesture_navigation', 'app:refresh', 'app:new_tab'] };
const OFFICE = { thumb: ['zoom_wheel', 'app:text_size_wheel', 'app:page_wheel', 'app:undo_redo_wheel'], 82: ['smartshift_toggle', 'app:paste_special', 'app:save', 'action_ring'],
  83: ['undo', 'copy', 'paste', 'app:page_up', 'app:page_down'], 86: ['redo', 'paste', 'copy', 'app:page_down', 'app:page_up'],
  195: ['gesture_navigation', 'app:save', 'app:find', 'app:paste_special', 'action_ring'], 196: ['middle_click', 'gesture_navigation', 'app:paste_special', 'app:save'] };
const CALL = (mic, cam) => ({ thumb: ['volume_wheel', 'brightness_wheel'], 82: [mic, cam, 'action_ring'], 83: [mic, cam], 86: [cam, mic], 195: ['gesture_navigation', mic, cam, 'action_ring'], 196: [mic, cam] });
const APP_SETS = [BROWSER,
  Object.assign({ name: 'Writer', match: /libreoffice-writer|soffice.*writer/i }, OFFICE),
  Object.assign({ name: 'Calc', match: /libreoffice-calc/i }, OFFICE),
  { name: 'Impress', match: /libreoffice-impress/i, thumb: ['app:slide_wheel', 'zoom_wheel'], 82: ['app:start_show', 'action_ring'], 83: ['app:slide_prev', 'undo'], 86: ['app:slide_next', 'redo'], 195: ['gesture_navigation', 'app:start_show', 'action_ring'], 196: ['app:start_show', 'middle_click'] },
  Object.assign({ name: 'Zoom', match: /zoom/i }, CALL('app:zoom_mic', 'app:zoom_cam')),
  Object.assign({ name: 'Teams', match: /teams/i }, CALL('app:teams_mic', 'app:teams_cam'))];
// the set for the application profile being edited, if it has one
function appSet(p) {
  const key = p && p.profile; if (!key || key === 'default') return null;
  const prof = deviceProfiles(dev()).find(x => x.key === key);
  const hay = [key].concat(prof ? prof.match : []).join(' ');
  return APP_SETS.find(a => a.match.test(hay)) || null;
}
const appLabel = set => set.name === 'browser' ? 'For browsers' : 'For ' + set.name;
// an item of the list: a preset, or one of the ready-made keystrokes above
const recItem = k => k.startsWith('app:') ? { key: k, icon: (APP_ACTIONS[k.slice(4)].type === 'adapter' ? 'fa-arrows-up-down' : 'fa-keyboard'), label: APP_ACTIONS[k.slice(4)].label } : presetItem(k);
const MOUSE_GROUP = ['middle_click', 'back', 'forward', 'dpi_cycle', 'smartshift_toggle', 'gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan', 'action_ring'];
const WHEEL_GROUP = ['hscroll', 'vscroll', 'zoom_wheel', 'volume_wheel', 'tabs_wheel', 'workspaces_wheel', 'brightness_wheel', 'nothing'];
const K = (code, label) => ({ code: 'KEY_' + code, label: label || code });
const keyRange = (a, f) => a.split(' ').map(c => K(c, f ? f(c) : c));
// built when first needed, once the OS (and so the modifier names) is known
const keyGroups = () => ({
  fkeys: keyRange('F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12'),
  letters: keyRange('A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'),
  numbers: keyRange('1 2 3 4 5 6 7 8 9 0'),
  symbols: [K('GRAVE', '`'), K('MINUS', '-'), K('EQUAL', '='), K('LEFTBRACE', '['), K('RIGHTBRACE', ']'), K('BACKSLASH', '\\'), K('SEMICOLON', ';'), K('APOSTROPHE', "'"), K('COMMA', ','), K('DOT', '.'), K('SLASH', '/'), K('102ND', '< >')],
  numpad: keyRange('KP0 KP1 KP2 KP3 KP4 KP5 KP6 KP7 KP8 KP9', c => 'Num ' + c.slice(2)).concat([K('KPENTER', 'Num Enter'), K('KPEQUAL', 'Num ='), K('NUMLOCK', 'Num Lock'), K('KPMINUS', 'Num -'), K('KPDOT', 'Num .'), K('KPPLUS', 'Num +'), K('KPSLASH', 'Num /'), K('KPASTERISK', 'Num *')]),
  modifiers: [K('LEFTCTRL', 'Left Ctrl'), K('RIGHTCTRL', 'Right Ctrl'), K('LEFTSHIFT', 'Left Shift'), K('RIGHTSHIFT', 'Right Shift'), K('LEFTALT', 'Left ' + ALT()), K('RIGHTALT', 'Right ' + ALT()), K('LEFTMETA', 'Left ' + META()), K('RIGHTMETA', 'Right ' + META())],
  arrows: [K('UP', 'Up arrow'), K('DOWN', 'Down arrow'), K('LEFT', 'Left arrow'), K('RIGHT', 'Right arrow'), K('HOME', 'Home'), K('END', 'End'), K('PAGEUP', 'Page up'), K('PAGEDOWN', 'Page down'), K('INSERT', 'Insert')],
  others: [K('CAPSLOCK', 'Caps Lock'), K('SCROLLLOCK', 'Scroll Lock'), K('BACKSPACE', 'Backspace'), K('DELETE', 'Delete'), K('ESC', 'Escape'), K('TAB', 'Tab'), K('SPACE', 'Space'), K('ENTER', 'Enter')],
});

// Options+'s action categories with the LogiMX presets that belong to each
const OPTS_CATS = {
  nav: ['overview', 'show_desktop', 'app_switcher', 'workspace_prev', 'workspace_next', 'close_window', 'maximize', 'minimize', 'tile_left', 'tile_right', 'tab_next', 'tab_prev', 'zoom_in', 'zoom_out', 'screenshot', 'screenshot_area', 'lock', 'calculator', 'emoji_picker', 'emoji', 'dictation', 'context_menu', 'brightness_up', 'brightness_down', 'terminal'],
  edit: ['copy', 'paste', 'undo', 'redo', 'open_home'],
  media: ['volume_dial', 'play_pause', 'prev_track', 'next_track', 'volume_up', 'volume_down', 'mute', 'mic_mute'],
  other: ['easy_switch_1', 'easy_switch_2', 'easy_switch_3', 'nothing'],
  mouse: MOUSE_GROUP, wheel: WHEEL_GROUP,
};
// three sections, as Options+ shows a key: what it recommends, Smart actions (things that run,
// type or open), and every other action grouped under small headings
const DRAWER_SECTIONS = [['rec', 'Recommended'], ['smart', 'Smart actions'], ['more', 'Other actions']];
const ACTION_GROUPS = [['nav', 'Navigate computer'], ['edit', 'Edit files and folders'], ['media', 'Media and audio'], ['other', 'Device']];
// what each kind of control lists: a key, a mouse button (with a mouse group first), or the thumb wheel
const groupsFor = p => p.section === 'thumbwheel' ? [['wheel', 'Wheel']] : p.section === 'buttons' ? [['mouse', 'Mouse']].concat(ACTION_GROUPS) : ACTION_GROUPS;
const sectionsFor = p => p.section === 'thumbwheel' ? DRAWER_SECTIONS.filter(([k]) => k !== 'smart') : DRAWER_SECTIONS;
const KEY_GROUP_NAMES = [['fkeys', 'F keys'], ['letters', 'Letters'], ['numbers', 'Numbers'], ['symbols', 'Symbols'], ['numpad', 'Num pad'], ['modifiers', 'Modifier keys'], ['arrows', 'Arrow and navigation'], ['others', 'Others']];
const curOf = p => typeof p.current === 'string' ? p.current : (p.current && (p.current.preset || (p.current.type === 'brightness_dial' ? 'ring:brightness' : undefined)));
// a single key: its keystroke, so the panel can say which one is in use
const keyCur = p => p.current && typeof p.current === 'object' && p.current.type === 'keystroke' && (p.current.keys || []).length === 1 ? p.current.keys[0] : null;
// the presets a control can take: keys never get the ring, gestures only on a button that can be held and moved
const RING_RECOMMEND = ['volume_dial', 'overview', 'show_desktop', 'screenshot_area', 'lock', 'calculator', 'emoji_picker', 'terminal', 'play_pause', 'easy_switch_1', 'easy_switch_2', 'easy_switch_3'];
// a ring action that changes a level in place: hold and drag it, or scroll over it, with the
// ring open. Marked in the lists with a small sliders badge.
const RING_DRAG = new Set(['volume_dial', 'ring:brightness']);
// turned with the wheel while the ring is open
const RING_WHEEL = new Set(['volume_dial', 'volume_up', 'volume_down', 'brightness_up', 'brightness_down', 'zoom_in', 'zoom_out', 'next_track', 'prev_track']);
// Easy-Switch named after the computer on that channel, when the mouse knows it
function easyLabel(k) {
  const m = /^easy_switch_(\d)$/.exec(k || ''); if (!m) return null;
  const d = S.devices.find(x => x.id === S.dev && (x.state || {}).hosts) || S.devices.find(x => (x.state || {}).hosts);
  const n = d && ((d.state.hosts.names || [])[Number(m[1]) - 1] || {}).name;
  return n ? `Switch to ${n}` : null;
}
const GESTURE_RECOMMEND = ['overview', 'show_desktop', 'app_switcher', 'workspace_next', 'workspace_prev', 'volume_up', 'volume_down', 'play_pause'];
const GESTURE_TYPES = ['nothing', 'keystroke', 'button', 'command', 'change_host', 'dpi_cycle', 'scroll', 'smartshift_toggle', 'open'];
const allowedFor = p => new Set(p.section === 'ring' ? S.presets.buttons.filter(k => !['native', 'nothing', 'action_ring'].includes(k) && (S.presets.all[k] || {}).type !== 'gesture')
  : p.section === 'gesture' ? Object.keys(S.presets.all).filter(k => GESTURE_TYPES.includes(S.presets.all[k].type))
  : p.section === 'thumbwheel' ? S.presets.wheel.filter(k => k !== 'volume_dial') : p.section === 'buttons' ? S.presets.buttons.filter(k => k !== 'volume_dial' && ((S.presets.all[k] || {}).type !== 'gesture' || (p.ctl && p.ctl.raw_xy))) : S.presets.keys.filter(k => k !== 'volume_dial'));
function drawerItems(sec, p) {
  const ok = allowedFor(p || S.picker);
  return (OPTS_CATS[sec] || []).filter(k => ok.has(k) && S.presets.all[k]).map(presetItem);
}
function openPicker(t) {
  // what is open right now, so the launch list can lead with it instead of 122 alphabetical entries
  api.quiet('running_apps').then(r => { S.running = r; if (S.picker && S.picker.cat === 'app') renderAppList(); }).catch(() => { S.running = []; });
  const d = t.dev || dev();
  const section = t.section, cid = t.cid;
  const gslot = section === 'gesture' && d && t.slot ? gestureObject(d, cid)[t.slot] : null;
  const current = section === 'gesture' ? (gslot ? gslot.preset || gslot : null) : section === 'ring' ? (ringSlots()[cid] || {}).action || null : assignment(d, section, cid, t.profile);
  const ctl = typeof cid === 'number' && section !== 'ring' && d ? d.controls.find(c => c.cid === cid) : null;
  S.picker = { drawer: !!t.drawer, fold: t.drawer ? { rec: true } : null, dev: d ? d.id : null, section, cid, label: t.label, profile: t.profile || S.editProfile || 'default', cat: t.cat || 'all', current, ctl, sel: null, slot: t.slot, recording: t.drawer ? false : t.cat === 'key' };
  S.dlg = 'picker'; render();
}
async function assignPicked(action) {
  const p = S.picker; const d = S.devices.find(x => x.id === p.dev);
  if (p.section === 'ring') {
    const entry = { action, label: easyLabel(action) || presetLabel(action), icon: actionIcon(action) };
    if (p.insert) {
      const list = ringSlots().filter(Boolean);
      if (list.length >= 8) { toast('A folder holds 8 actions', true); return; }
      if (p.insert === 'start') list.unshift(entry); else list.push(entry);
      await saveRingSlots(list);
      p.cid = p.insert === 'start' ? 0 : list.length - 1; p.insert = null; p.label = `Action ${p.cid + 1}`;
    } else {
      const slots = ringSlots();
      slots[p.cid] = entry;
      await saveRingSlots(slots);
    }
    if (p.drawer) { p.current = action; p.sel = null; p.selKey = null; p.cat = 'all'; p.chord = []; p.typed = ''; render(); toast(`Slot ${p.cid + 1}: ${presetLabel(action)}`); return; }
    S.dlg = null; toast(`Slot ${p.cid + 1}: ${presetLabel(action)}`); render(); return;
  }
  if (p.section === 'gesture') {
    const cid = gestureControl(d), g = gestureObject(d, cid);
    let sub = typeof action === 'string' ? JSON.parse(JSON.stringify(S.presets.all[action])) : action;
    if (typeof action === 'string') sub.preset = action;
    if (sub.type === 'scroll' && !sub.amount) sub.amount = (p.slot === 'up' || p.slot === 'right') ? 360 : -360;
    g[p.slot] = sub; g.label = 'Custom gestures'; g.type = 'gesture';
    await setAssign(d, 'buttons', cid, g);
  } else {
    await setAssign(d, p.section, p.cid, action, p.profile);
  }
  if (p.drawer) { p.current = action; p.sel = null; p.selKey = null; p.cat = 'all'; p.chord = []; p.typed = ''; render(); toast('Assigned ' + presetLabel(action)); return; }
  S.dlg = null; toast('Assigned ' + presetLabel(action)); render();
}

export const provide = { PICKER_CATS, CAT_OF, CAT_LABEL, pickerItems, OPTS_CARD, RECOMMEND, MOUSE_RECOMMEND, AK, AW, APP_ACTIONS, BROWSER, OFFICE, CALL, APP_SETS, appSet, appLabel, recItem, MOUSE_GROUP, WHEEL_GROUP, K, keyRange, keyGroups, OPTS_CATS, DRAWER_SECTIONS, ACTION_GROUPS, groupsFor, sectionsFor, KEY_GROUP_NAMES, curOf, keyCur, RING_RECOMMEND, RING_DRAG, RING_WHEEL, easyLabel, GESTURE_RECOMMEND, GESTURE_TYPES, allowedFor, drawerItems, openPicker, assignPicked };
