// View model: a gesture button's directions, presets and sensitivity.
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, api, assignment, changed, setAssign, toast;
export function link(ctx) { ({ S, api, assignment, changed, setAssign, toast } = ctx); }

// the screen state this view model owns: the gesture button being configured from Hold
export const state = {
  holdCid: undefined,
};

const SLOTS = { tap: [t('Tap'), 'click'], up: [t('Swipe up'), 'up'], down: [t('Swipe down'), 'down'], left: [t('Swipe left'), 'left'], right: [t('Swipe right'), 'right'] };
// the buttons that can be held and swiped; not the MX Master 4's haptic panel, which is pressed, not held
const gestureCapable = d => d.controls.filter(c => c.divertable && c.raw_xy && c.cid !== 0xD7 && c.cid !== 416);
const isRingAction = a => a === 'action_ring' || (!!a && typeof a === 'object' && a.type === 'ui' && a.event === 'ring');
// the button that is held: the one carrying gestures or the action ring (they share it, one at a time)
function gestureControl(d) {
  const picked = (S.holdCid || {})[d.id];
  if (picked !== undefined && gestureCapable(d).some(c => c.cid === picked)) return picked;
  for (const c of gestureCapable(d)) { const a = assignment(d, 'buttons', c.cid); const r = typeof a === 'string' ? (S.presets.all[a] || {}) : (a || {}); if (r.type === 'gesture' || isRingAction(a)) return c.cid; }
  return 195;
}
function gestureObject(d, cid) {
  const a = assignment(d, 'buttons', cid);
  const src = typeof a === 'string' ? S.presets.all[a] : a;
  if (src && src.type === 'gesture') return JSON.parse(JSON.stringify(src));
  const kept = ((S.ui || {}).savedGesture || {})[d.id + ':' + cid] || ((S.ui || {}).savedGesture || {})[d.id];   // what the button did before the ring took it
  if (kept && kept.type === 'gesture') return JSON.parse(JSON.stringify(kept));
  const o = JSON.parse(JSON.stringify(S.presets.all.gesture_navigation)); o.label = 'Custom gestures'; return o;
}
// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'gesture-preset': async (it, e, d, key) => { await setAssign(d, 'buttons', gestureControl(d), key); changed(); return; },
  'gest-mode': async (it, e, d, key) => { const cid = gestureControl(d), g = gestureObject(d, cid); g.continuous = key === 'continuous'; if (g.continuous && !g.step) g.step = 40; g.type = 'gesture'; await setAssign(d, 'buttons', cid, g); changed(); return; },
  'gest-enable': async (it, e, d, key) => { const cid = gestureControl(d); const on = !it.on; if (on) { const g = gestureObject(d, cid); g.type = 'gesture'; await setAssign(d, 'buttons', cid, g); } else await setAssign(d, 'buttons', cid, 'native'); changed(); return; },
  'gest-button': async (it, e, d, key) => { S.holdCid = Object.assign({}, S.holdCid, { [d.id]: Number(it.value) }); changed(); return; },
  'hold-mode': async (it, e, d, key) => {
    // one button, one job: taking the ring keeps the gestures aside so they come back as they were
    const cid = gestureControl(d), cur = assignment(d, 'buttons', cid);
    const curType = (typeof cur === 'string' ? (S.presets.all[cur] || {}) : (cur || {})).type;
    if (curType === 'gesture') S.ui = await api.host.uiSettings({ savedGesture: Object.assign({}, (S.ui || {}).savedGesture, { [d.id + ':' + cid]: gestureObject(d, cid) }) }) || S.ui;
    if (key === 'ring') await setAssign(d, 'buttons', cid, 'action_ring');
    else if (key === 'gestures') { const g = gestureObject(d, cid); g.type = 'gesture'; await setAssign(d, 'buttons', cid, g); }
    else await setAssign(d, 'buttons', cid, 'native');
    toast(key === 'ring' ? t('Action ring on this button') : key === 'gestures' ? t('Gestures on this button') : t('Button left to the mouse'));
    changed(); return;
  },
  'gest-sens': async (it, e, d, key) => { const cid = gestureControl(d), g = gestureObject(d, cid); g.threshold = 165 - 15 * Number(it.value); g.type = 'gesture'; await setAssign(d, 'buttons', cid, g); return; },
  'gest-step': async (it, e, d, key) => { const cid = gestureControl(d), g = gestureObject(d, cid); g.step = Number(it.value); g.type = 'gesture'; await setAssign(d, 'buttons', cid, g); return; },
};

export const provide = { SLOTS, gestureCapable, isRingAction, gestureControl, gestureObject };
