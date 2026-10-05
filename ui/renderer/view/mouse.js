// View: a mouse's pages: its photo with the buttons, gestures, haptics, point and scroll.
import { isNative } from '../../shared/profiles.mjs';

// from the rest of the window, filled in by link()
let S, SLOTS, assignment, backlightPanel, card, deviceProfiles, drawerUp, drop, esc, gestureCapable, gestureControl, gestureObject, isRingAction, overridden, presetLabel, range, ringStage, ringState, row, sec, sw;
export function link(ctx) { ({ S, SLOTS, assignment, backlightPanel, card, deviceProfiles, drawerUp, drop, esc, gestureCapable, gestureControl, gestureObject, isRingAction, overridden, presetLabel, range, ringStage, ringState, row, sec, sw } = ctx); }

// ----------------------------------------------------------- photos
// One photo per mouse model, keyed by device id like the keyboards. A spot is a control id (or
// 'thumb' for the thumb wheel) and where it is on the photo; its number is the row it has on the
// Buttons page, so the two always agree. A mouse without an entry shows the rows only.
const MOUSE_PHOTOS = (() => {
  const s3 = { src: '../assets/devices/b034.png', w: 1021, h: 1644, pt: [['wheel', 690, 300, 'r'], ['thumb', 520, 770, 'l'], ['pointer', 840, 800, 'r']], spots: [[82, 690, 300], [196, 815, 590], [86, 357, 707], ['thumb', 520, 770], [83, 450, 975], [195, 82, 954]] };
  const m4 = { src: '../assets/devices/b042.png', w: 1021, h: 1594, pt: [['wheel', 771, 303, 'r'], ['thumb', 577, 899, 'l'], ['pointer', 850, 840, 'r']], spots: [[82, 771, 303], [196, 822, 630], [195, 394, 575], [86, 434, 749], [83, 483, 956], ['thumb', 577, 899], [416, 310, 779]] };
  return { b034: s3, b035: s3, b043: s3, b042: m4, b048: m4 };
})();
// the underside, for Easy-Switch: where the printed 1, 2 and 3 sit above the switch button
const MOUSE_BOTTOMS = (() => {
  const s3 = { src: '../assets/devices/b034-bottom.png', w: 692, h: 1024, hosts: [[0, 225, 672, 'l'], [1, 266, 650, 'r'], [2, 307, 672, 'r']] };
  return { b034: s3, b035: s3, b043: s3 };
})();
const buttonRows = d => PHYS.filter(([cid]) => d.controls.some(c => c.cid === cid));
// The mouse photo: a ring on each button and its name beside it, on the side away from the mouse.
// A ring opens that button's panel (like a key on the keyboard); the one being edited is filled.
function mousePhoto(d, plain) {
  const P = MOUSE_PHOTOS[d.id];
  if (!P) return '';
  if (plain) return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/></svg>`;
  const order = buttonRows(d).map(([cid]) => cid);
  const editing = k => drawerUp() && String(S.picker.cid) === String(k);
  const shown = P.spots.filter(([k]) => k === 'thumb' ? d.controls.length : order.includes(k));
  const spots = shown.map(([k, x, y]) => {
    const a = k === 'thumb' ? assignment(d, 'thumbwheel') : assignment(d, 'buttons', k);
    const nm = k === 'thumb' ? 'Thumb wheel' : ((PHYS.find(x => x[0] === k) || [])[1] || (d.controls.find(c => c.cid === k) || {}).label || 'Button');
    return `<g class="hotspot ms ${editing(k) ? 'selected' : ''}" data-section="${k === 'thumb' ? 'thumbwheel' : 'buttons'}" data-cid="${k}" data-name="${esc(nm)}" data-does="${esc(presetLabel(a))}" data-custom="${isNative(a) ? '' : '1'}"><circle class="ring" cx="${x}" cy="${y}" r="40"/></g>`;
  }).join('');
  // names sit in two columns just outside the photo, each joined to its ring by a thin line; on
  // each side they are spaced so none overlaps the one above
  const GAP = 150, place = {};
  for (const side of ['l', 'r']) {
    let prev = -Infinity;
    shown.filter(([, x]) => (x < P.w / 2) === (side === 'l')).sort((p, q) => p[2] - q[2]).forEach(([k, , y]) => { const ly = Math.max(y, prev + GAP); place[k] = ly; prev = ly; });
  }
  const lines = shown.map(([k, x, y]) => { const left = x < P.w / 2, ly = place[k]; return `<polyline class="ms-line ${editing(k) ? 'on' : ''}" points="${left ? x - 40 : x + 40},${y} ${left ? -20 : P.w + 20},${ly}"/>`; }).join('');
  const labels = shown.map(([k, x]) => {
    const a = k === 'thumb' ? assignment(d, 'thumbwheel') : assignment(d, 'buttons', k);
    const nm = k === 'thumb' ? 'Thumb wheel' : ((PHYS.find(x => x[0] === k) || [])[1] || (d.controls.find(c => c.cid === k) || {}).label || 'Button');
    const left = x < P.w / 2;
    const ov = k === 'thumb' ? overridden(d, 'thumbwheel') : overridden(d, 'buttons', k);
    return `<div class="ms-lab ${left ? 'l' : 'r'} ${editing(k) ? 'on' : ''} ${isNative(a) ? '' : 'custom'} ${ov ? 'pv' : ''}" data-ring="${k}" style="top:${(place[k] / P.h * 100).toFixed(2)}%"><span class="k">${esc(nm)}</span><span class="d">${esc(presetLabel(a))}</span></div>`;
  }).join('');
  return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${lines}${spots}</svg>${labels}`;
}

// ----------------------------------------------------------- pages
const PHYS = [[82, 'Middle button'], [83, 'Back'], [86, 'Forward'], [195, 'Gesture button'], [196, 'Mode shift'], [416, 'Haptic panel']];
function pageButtons(d) {
  const rows = buttonRows(d).map(([cid, label], i) => {
    const a = assignment(d, 'buttons', cid);
    return `<div class="row"><span class="num">${i + 1}</span><span class="grow lbl">${label}</span>${drop(a, `data-act="pick" data-section="buttons" data-cid="${cid}" data-label="${esc(label)}"`)}</div>`;
  }).join('');
  const tw = assignment(d, 'thumbwheel');
  const twInvert = !!((d.config.settings || {}).thumbwheel || {}).invert;
  const twGain = typeof tw === 'object' && tw && tw.gain ? tw.gain : 8;
  const twSpeed = Math.max(1, Math.min(10, Math.round(twGain / 1.6)));
  const twRow = d.controls.length ? `<div class="row"><span class="num">${buttonRows(d).length + 1}</span><span class="grow lbl">Thumb wheel</span>${drop(tw, `data-act="pick" data-section="thumbwheel" data-cid="thumb" data-label="Thumb wheel"`)}</div>` : '';
  const photo = mousePhoto(d);
  if (photo) return `<div class="photo-card ms-photo">${photo}</div>`;
  return `<div class="${photo ? 'photo-col' : ''}">${photo ? `<div class="photo-card">${photo}<div class="kb-tip" hidden></div></div>` : ''}
    <div style="display:flex;flex-direction:column;gap:18px">${sec('Buttons', card(rows + twRow) + `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="reset-buttons"><i class="fa-solid fa-rotate-left"></i>Restore defaults</button></div><div class="hint">Left and right click cannot be reassigned. Overrides for the focused app are set in <a href="#" data-act="page" data-page="apps">Profiles</a>.</div>`)}${twRow ? sec('Thumb wheel', card(
      row('Invert direction', '', sw(twInvert, 'data-act="setting" data-path="thumbwheel.invert"')) +
      `<div class="row"><span class="grow lbl">Speed</span>${range('data-act="thumb-speed" data-out="tws"', twSpeed, 1, 10, 1)}<span class="val" data-out="tws" style="width:24px;text-align:right">${twSpeed}</span></div>`)) : ''}</div></div>`;
}

function gestureStage(d, cid, g, sens) {
  const on = k => drawerUp() && S.picker.section === 'gesture' && S.dir === k;
  const cell = (k, icon) => { const sub = g[SLOTS[k][1]]; return `<button class="gs-cell ${k === 'tap' ? 'tap' : ''} ${on(k) ? 'on' : ''} ${isNative(sub) || !sub || (sub.type === 'nothing') ? 'empty' : ''}" data-act="dir-pick" data-key="${k}"><i class="fa-solid ${icon}"></i><span class="gs-k">${SLOTS[k][0]}</span><span class="gs-d">${esc(sub ? presetLabel(sub.preset || sub) : 'Do nothing')}</span></button>`; };
  const pad = `<div class="gs-pad"><div></div>${cell('up', 'fa-arrow-up')}<div></div>${cell('left', 'fa-arrow-left')}${cell('tap', 'fa-hand-pointer')}${cell('right', 'fa-arrow-right')}<div></div>${cell('down', 'fa-arrow-down')}<div></div></div>`;
  const presets = ['gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan'].map(k => `<button class="pill ${g.label === S.presets.all[k].label ? 'on' : ''}" data-act="gesture-preset" data-key="${k}">${esc(S.presets.all[k].label.replace('Gestures: ', ''))}</button>`).join('');
  const opts = card(`<div class="row"><span class="grow lbl">Mode</span><span class="seg"><button class="${g.continuous ? '' : 'on'}" data-act="gest-mode" data-key="once">One-shot</button><button class="${g.continuous ? 'on' : ''}" data-act="gest-mode" data-key="continuous">Continuous</button></span></div>` +
    `<div class="row"><span class="grow lbl">Sensitivity</span>${range('data-act="gest-sens"', sens, 1, 10, 1)}<span class="val" style="width:24px;text-align:right">${sens}</span></div>`);
  return `<div class="ring-page gest-page">${pad}<div class="gs-opts">${opts}<div class="chips">${presets}</div></div></div>`;
}
function pageGestures(d) {
  const cid = gestureControl(d), g = gestureObject(d, cid), slot = SLOTS[S.dir][1];
  const a = assignment(d, 'buttons', cid); const active = (typeof a === 'string' ? (S.presets.all[a] || {}) : (a || {})).type === 'gesture';
  const mode = isRingAction(a) ? 'ring' : active ? 'gestures' : 'off';
  const sens = Math.max(1, Math.min(10, Math.round((165 - (g.threshold ?? 60)) / 15)));
  // opened from a button's Configure gestures: laid out like the action ring, the directions as a pad
  // in the middle naming what each runs, the picked one's actions in the panel on the right
  // an app hovered in the bar while configuring: its own ring or gestures are shown in place; when the
  // button does something else in that app, a note says what, and the view keeps its kind
  if (S.cfgFrom && S.previewProfile) {
    const own = assignment(d, 'buttons', cid, S.editProfile || 'default'), viewRing = isRingAction(own);
    if (!(viewRing ? mode === 'ring' : active)) {
      const pk = S.previewProfile, pn = pk === 'default' ? 'Global settings' : ((deviceProfiles(d).find(x => x.key === pk) || {}).name || pk);
      const bn = (gestureCapable(d).find(c => c.cid === cid) || {}).label || 'This button';
      return `<div class="ring-stage"><div class="pv-note"><i class="fa-solid fa-circle-info"></i><div>In <b>${esc(pn)}</b>, ${esc(bn)} does <b>${esc(presetLabel(a))}</b>.</div><div class="sub">${viewRing ? 'Its action ring applies' : 'Its gestures apply'} where the button is set to ${viewRing ? 'the action ring' : 'gestures'}.</div></div></div>`;
    }
  }
  if (active && S.cfgFrom) return gestureStage(d, cid, g, sens);
  const seg = (k, l) => `<button class="${mode === k ? 'on' : ''}" data-act="hold-mode" data-key="${k}">${l}</button>`;
  // gestures and the action ring share the held button: choosing one turns the other off
  const holdRows = `<div class="row"><div class="grow"><div class="lbl">When held</div><div class="sub">${mode === 'ring' ? 'Opens the action ring; gestures are off' : mode === 'gestures' ? 'Swipes run gestures; the action ring is off' : 'The button does what the mouse does by itself'}</div></div><span class="seg">${seg('gestures', 'Gestures')}${seg('ring', 'Action ring')}${seg('off', 'Off')}</span></div>` +
    `<div class="row"><div class="grow"><div class="lbl">Button</div><div class="sub">Each button that can be held has its own choice</div></div><select class="sel" data-act="gest-button">${gestureCapable(d).map(c => { const ca = assignment(d, 'buttons', c.cid); const ct = (typeof ca === 'string' ? (S.presets.all[ca] || {}) : (ca || {})).type; return `<option value="${c.cid}" ${c.cid === cid ? 'selected' : ''}>${esc(c.label)}${isRingAction(ca) ? ' · action ring' : ct === 'gesture' ? ' · gestures' : ''}</option>`; }).join('')}</select></div>`;
  if (mode === 'ring') {
    const rs = ringState();
    const pchips = rs.profiles.map((p, i) => `<button class="pill ${i === rs.active ? 'on' : ''}" data-act="ring-profile" data-key="${i}">${esc(p.name)}</button>`).join('') + '<button class="pill" data-act="ring-profile-add" title="New profile"><i class="fa-solid fa-plus"></i>New</button>';
    const free = row('Keep the pointer visible and free', rs.free_pointer ? 'The pointer moves anywhere; the action under it is chosen' : 'The pointer hides and the mouse steers the ring', sw(rs.free_pointer, 'data-act="ring-free"'));
    const feel = rs.free_pointer ? '' : `<div class="row"><span class="grow lbl">Travel before it picks</span>${range('data-act="ring-travel" data-out="rtravel"', rs.travel, 10, 80, 5)}<span class="val" data-out="rtravel" style="width:24px;text-align:right">${rs.travel}</span></div>`;
    return `<div class="ring-page">${ringStage()}<div class="rs-bar"><span></span><button class="btn" data-act="ring-test"><i class="fa-solid fa-play"></i>Try it</button></div></div>`;
  }
  if (mode === 'off') return sec('Gesture button', card(holdRows)) + `<div class="hint" style="margin-top:12px">Pick Gestures or Action ring to give the button something to do while it is held.</div>`;
  const cell = (k, txt, cls = '') => `<button class="${cls} ${S.dir === k ? 'on' : ''}" data-act="dir-pick" data-key="${k}">${txt}</button>`;
  const grid = `<div class="gest-grid"><div></div>${cell('up', '↑')}<div></div>${cell('left', '←')}${cell('tap', 'Tap', 'tap')}${cell('right', '→')}<div></div>${cell('down', '↓')}<div></div></div>`;
  const presetsRow = ['gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan'].map(k => `<button class="pill ${g.label === S.presets.all[k].label ? 'on' : ''}" data-act="gesture-preset" data-key="${k}">${esc(S.presets.all[k].label.replace('Gestures: ', ''))}</button>`).join('');
  return `<div class="photo-col" style="grid-template-columns:240px 1fr">${grid}
    <div style="display:flex;flex-direction:column;gap:22px">
      ${sec(SLOTS[S.dir][0], card(
        `<div class="row"><span class="grow lbl">Action</span>${drop(g[slot] && g[slot].preset ? g[slot].preset : (g[slot] || { type: 'nothing' }), `data-act="pick-gesture" data-slot="${slot}"`)}</div>` +
        `<div class="row"><span class="grow lbl">Mode</span><span class="seg"><button class="${g.continuous ? '' : 'on'}" data-act="gest-mode" data-key="once">One-shot</button><button class="${g.continuous ? 'on' : ''}" data-act="gest-mode" data-key="continuous">Continuous</button></span></div>`))}
      ${sec('Gesture button', card(holdRows +
        `<div class="row"><span class="grow lbl">Sensitivity</span>${range('data-act="gest-sens"', sens, 1, 10, 1)}<span class="val" style="width:24px;text-align:right">${sens}</span></div>` +
        (g.continuous ? `<div class="row"><span class="grow lbl">Repeat distance</span>${range('data-act="gest-step"', g.step ?? 40, 5, 120, 5)}<span class="val" style="width:24px;text-align:right">${g.step ?? 40}</span></div>` : '')))}
      ${sec('Presets', `<div class="chips">${presetsRow}</div>`)}
    </div></div>`;
}

const WAVES = { 0: 'Sharp tick', 1: 'Soft thud', 2: 'Sharp knock', 3: 'Soft knock', 4: 'Light tick', 5: 'Happy alert', 6: 'Angry alert', 7: 'Completed', 8: 'Square', 9: 'Wave', 10: 'Firework', 11: 'Mad', 12: 'Knock', 13: 'Jingle', 14: 'Ringing', 27: 'Whisper' };
function pageHaptics(d) {
  const st = (d.state || {}).haptic || {}, s = (d.config.settings || {}).haptic || {};
  const on = s.enabled ?? st.enabled ?? true, level = s.level ?? st.level ?? 50;
  const force = ((d.state || {}).force || [])[0], pf = (d.config.settings || {}).panel_force ?? (force ? force.current : 0);
  const step = force ? Math.max(1, Math.round((force.max - force.min) / 20)) : 1;
  const pct = force ? Math.round((pf - force.min) * 100 / Math.max(1, force.max - force.min)) : 0;
  const waves = (st.waveforms || []).map(w => `<button class="pill" data-act="haptic-play" data-key="${w}" ${on ? '' : 'disabled'}>${esc(WAVES[w] || 'Pattern ' + w)}</button>`).join('');
  return sec('Haptic feedback', card(
      row('Haptic feedback', 'The panel under the thumb answers with a short vibration', sw(on, 'data-act="setting" data-path="haptic.enabled"')) +
      `<div class="row"><div class="grow"><div class="lbl">Strength</div><div class="sub">${on ? 'Felt at once when you let go of the slider' : 'Feedback is off'}</div></div>${range('data-act="haptic-level" data-out="hl"', level, 5, 100, 5)}<span class="val" data-out="hl" style="width:32px;text-align:right">${level}</span></div>`)) +
    sec('Felt when', card(
      row('The action ring moves or runs', 'A light tick on each action, a soft thud when one runs', sw(s.ring ?? true, 'data-act="setting" data-path="haptic.ring"')) +
      row('A gesture is recognised', 'A sharp tick when a swipe does its action', sw(s.gestures ?? true, 'data-act="setting" data-path="haptic.gestures"')))) +
    (force ? sec('Haptic panel press', card(
      `<div class="row"><div class="grow"><div class="lbl">Press force</div><div class="sub">How hard the panel has to be pressed: lower is lighter</div></div>${range('data-act="setting-range" data-path="panel_force" data-out="pf"' + (force.changeable ? '' : ' disabled'), pf, force.min, force.max, step)}<span class="val" data-out="pf" style="width:40px;text-align:right">${pct}%</span></div>`) +
      `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="panel-force-reset"><i class="fa-solid fa-rotate-left"></i>Default force</button></div>`) : '') +
    sec('Try a pattern', `<div class="chips">${waves}</div>`, 'plays on the mouse');
}
// Point & scroll, laid out like the keyboard's Backlight: the mouse with a tag saying how it is set,
// its settings in the panel on the right (the tag opens the panel again once it is closed)
// Point & scroll on the mouse photo, laid out like Buttons: a ring on the scroll wheel, the thumb
// wheel and the body (pointer speed), each named beside it; a ring opens its settings on the right
const PT_NAMES = { wheel: 'Scroll wheel', thumb: 'Thumb wheel', pointer: 'Pointer speed' };
function ptSummary(d, k) {
  const st = d.state || {}, s = d.config.settings || {};
  if (k === 'pointer') { const dpi = s.dpi ?? (st.dpi ? st.dpi.dpi : 1000); return `${dpi} DPI · Speed ${Math.round(((s.pointer_speed ?? 0) + 1) * 50)}`; }
  if (k === 'wheel') {
    // all three of the wheel's settings: direction, smooth scrolling, SmartShift (one per line on the photo)
    const ss = s.smartshift || {}, hr = s.hires || {};
    const natural = hr.invert ?? (st.hires || {}).invert ?? false, smooth = (st.hires || {}).kernel || (hr.enabled ?? (st.hires || {}).hires ?? true);
    const shift = (ss.mode || (st.smartshift || {}).mode || 'ratchet') === 'ratchet';
    return `${natural ? 'Natural' : 'Standard'} · Smooth ${smooth ? 'on' : 'off'} · SmartShift ${shift ? 'on' : 'off'}`;
  }
  const t = thumbInfo(d);
  return `Speed ${t.speed} · ${t.invert ? 'Inverted' : 'Standard'}`;
}
function thumbInfo(d) {
  const tw = assignment(d, 'thumbwheel'), gain = typeof tw === 'object' && tw && tw.gain ? tw.gain : 8;
  return { speed: Math.max(1, Math.min(10, Math.round(gain / 1.6))), invert: !!((d.config.settings || {}).thumbwheel || {}).invert };
}
function pointPhoto(d) {
  const P = MOUSE_PHOTOS[d.id];
  const shown = P.pt.filter(([k]) => k !== 'thumb' || d.controls.length);
  const on = k => backlightPanel(d) && S.ptSel === k;
  const spots = shown.map(([k, x, y]) => `<g class="hotspot ms pt ${on(k) ? 'selected' : ''}" data-cid="${k}" data-name="${esc(PT_NAMES[k])}"><circle class="ring" cx="${x}" cy="${y}" r="40"/></g>`).join('');
  // names in a column just outside the photo on the side each spot names, as on Buttons
  const GAP = 150, place = {};
  for (const side of ['l', 'r']) {
    let prev = -Infinity;
    shown.filter(s => s[3] === side).sort((p, q) => p[2] - q[2]).forEach(([k, , y]) => { const ly = Math.max(y, prev + GAP); place[k] = ly; prev = ly; });
  }
  const lines = shown.map(([k, x, y, side]) => `<polyline class="ms-line ${on(k) ? 'on' : ''}" points="${side === 'l' ? x - 40 : x + 40},${y} ${side === 'l' ? -20 : P.w + 20},${place[k]}"/>`).join('');
  const labels = shown.map(([k, , , side]) => `<div class="ms-lab ${side} ${on(k) ? 'on' : ''}" data-ring="${k}" style="top:${(place[k] / P.h * 100).toFixed(2)}%"><span class="k">${esc(PT_NAMES[k])}</span>${ptSummary(d, k).split(' · ').map(t => `<span class="d">${esc(t)}</span>`).join('')}</div>`).join('');
  return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${lines}${spots}</svg>${labels}`;
}
function pagePointer(d) {
  if (MOUSE_PHOTOS[d.id]) return `<div class="photo-card ms-photo">${pointPhoto(d)}</div>`;
  return pointerSettings(d) + thumbSettings(d);
}
function pointerSettings(d, only) {
  const st = d.state || {}, s = d.config.settings || {};
  const dpi = s.dpi ?? (st.dpi ? st.dpi.dpi : 1000);
  const [min, max, step] = st.dpi && st.dpi.stepped ? st.dpi.levels : [200, 8000, 50];
  const speed = Math.round(((s.pointer_speed ?? 0) + 1) * 50);
  const ss = s.smartshift || {}, hr = s.hires || {};
  const ssOn = (ss.mode || (st.smartshift || {}).mode || 'ratchet') === 'ratchet';
  const pointer = sec('Pointer', card(
    `<div class="row" style="flex-direction:column;align-items:stretch;gap:8px"><div style="display:flex;justify-content:space-between"><span class="lbl">DPI</span><span class="val" data-out="dpi">${dpi}</span></div>${range('data-act="dpi" data-out="dpi" style="width:100%"', dpi, min, max, step)}<div style="display:flex;justify-content:space-between" class="hint"><span>${min}</span><span>${max}</span></div></div>` +
    `<div class="row"><span class="grow lbl">Desktop pointer speed</span>${range('data-act="pspeed" data-out="pspeed"', speed, 0, 100, 5)}<span class="val" data-out="pspeed" style="width:32px;text-align:right">${speed}</span></div>`));
  // the wheel's three settings: direction, smooth scrolling, and SmartShift (its sensitivity, and
  // the ratchet force on the MX Master 4, under it while it is on)
  const wheel = sec('Scroll wheel', card(
      row('Scroll direction', (hr.invert ?? (st.hires || {}).invert) ? 'Natural: the page follows your finger' : 'Standard', sw(hr.invert ?? (st.hires || {}).invert ?? false, 'data-act="setting" data-path="hires.invert"')) +
      // over Bluetooth Linux's own Logitech driver scales the wheel: smooth scrolling has to stay on
      ((st.hires || {}).kernel ? row('Smooth scrolling', 'Kept on for this connection: Linux\'s Logitech driver handles the wheel, and turning it off would make scrolling many times slower', sw(true, 'disabled title="Managed by Linux on this connection"'))
        : row('Smooth scrolling', 'High-resolution wheel events', sw(hr.enabled ?? (st.hires || {}).hires ?? true, 'data-act="setting" data-path="hires.enabled"'))) +
      row('SmartShift', 'Switch from ratchet to free-spin when the wheel is flicked', sw(ssOn, 'data-act="setting" data-path="smartshift.mode" data-on="ratchet" data-off="freespin"')) +
      (ssOn ? `<div class="row"><span class="grow lbl">SmartShift sensitivity</span>${range('data-act="setting-range" data-path="smartshift.threshold" data-out="sst"', ss.threshold ?? (st.smartshift || {}).threshold ?? 14, 1, 50, 1)}<span class="val" data-out="sst" style="width:24px;text-align:right">${ss.threshold ?? (st.smartshift || {}).threshold ?? 14}</span></div>` : '') +
      (ssOn && (st.smartshift || {}).tunable_torque ? `<div class="row"><div class="grow"><div class="lbl">Ratchet force</div><div class="sub">How firm each step of the wheel feels</div></div>${range('data-act="setting-range" data-path="smartshift.torque" data-out="sstq"', ss.torque ?? (st.smartshift || {}).torque ?? 75, 1, 100, 1)}<span class="val" data-out="sstq" style="width:24px;text-align:right">${ss.torque ?? (st.smartshift || {}).torque ?? 75}</span></div>` : '')));
  return only === 'pointer' ? pointer : only === 'wheel' ? wheel : pointer + wheel;
}
// the thumb wheel's speed and direction
function thumbSettings(d) {
  if (!d.controls.length) return '';
  const tw = assignment(d, 'thumbwheel');
  const twInvert = !!((d.config.settings || {}).thumbwheel || {}).invert;
  const twGain = typeof tw === 'object' && tw && tw.gain ? tw.gain : 8;
  const twSpeed = Math.max(1, Math.min(10, Math.round(twGain / 1.6)));
  // its two settings; what it does is chosen on Buttons, like any other control
  return sec('Thumb wheel', card(
    `<div class="row"><span class="grow lbl">Speed</span>${range('data-act="thumb-speed" data-out="tws"', twSpeed, 1, 10, 1)}<span class="val" data-out="tws" style="width:24px;text-align:right">${twSpeed}</span></div>` +
    row('Scroll direction', twInvert ? 'Inverted' : 'Standard', sw(twInvert, 'data-act="setting" data-path="thumbwheel.invert"'))));
}

const WHEEL_ACTIONS = [['hscroll', 'Horizontal scroll'], ['vscroll', 'Vertical scroll'], ['zoom_wheel', 'Zoom'], ['volume_wheel', 'Volume'], ['tabs_wheel', 'Switch tabs'], ['workspaces_wheel', 'Workspaces'], ['brightness_wheel', 'Brightness']];
function renderPointerPanel(d) {
  return `<div class="drawer-wrap"><div class="dlg drawer bl-panel" data-stop>
    <div class="dlg-head"><span class="dh-key">Modify settings</span><span class="dh-sub">${esc(PT_NAMES[S.ptSel] || 'Point & scroll')}</span></div>
    <div class="dlg-body">${S.ptSel === 'thumb' ? thumbSettings(d) : pointerSettings(d, S.ptSel)}</div>
  </div></div>`;
}

export const provide = { MOUSE_PHOTOS, MOUSE_BOTTOMS, buttonRows, mousePhoto, PHYS, pageButtons, gestureStage, pageGestures, WAVES, pageHaptics, PT_NAMES, ptSummary, thumbInfo, pointPhoto, pagePointer, pointerSettings, thumbSettings, WHEEL_ACTIONS, renderPointerPanel };
