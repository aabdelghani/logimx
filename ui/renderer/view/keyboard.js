// View: a keyboard's pages: its keys and the backlight.
import { isNative, isMouse } from '../../shared/profiles.mjs';

// from the rest of the window, filled in by link()
let S, assignment, card, drawerUp, esc, fmtOut, overridden, presetLabel, range, row, sec, sw;
export function link(ctx) { ({ S, assignment, card, drawerUp, esc, fmtOut, overridden, presetLabel, range, row, sec, sw } = ctx); }

// One photo per keyboard model, keyed by the device id the agent uses (its product id in hex:
// the Bluetooth pid, or the receiver-side pid when it comes through a receiver). Each spot is a
// control id with the centre of its key cap in photo pixels; only the controls the connected
// keyboard reports are drawn. A keyboard with no entry here gets no photo, only the key tiles.
const KEYBOARD_PHOTOS = (() => {
  const s = { src: '../assets/devices/b378.png', w: 2596, h: 800, kw: 99, kh: 75, hosts: [[0, 1800, 145], [1, 1915, 145], [2, 2030, 145]], spots: [[199, 288, 142], [200, 402, 142], [226, 517, 142], [227, 632, 142], [259, 749, 143], [264, 862, 142], [284, 976, 142], [228, 1090, 142], [229, 1206, 142], [230, 1320, 142], [231, 1433, 142], [232, 1547, 142], [233, 1663, 142], [10, 2157, 142], [266, 2274, 142], [234, 2388, 142], [111, 2503, 142]] };
  const keys = { src: '../assets/devices/b35b.png', w: 2004, h: 618, kw: 76, kh: 57, spots: [[199, 222, 109], [200, 310, 109], [224, 399, 109], [225, 488, 109], [110, 575, 109], [226, 665, 109], [227, 753, 109], [228, 842, 109], [229, 931, 109], [230, 1019, 109], [231, 1108, 109], [232, 1194, 109], [233, 1284, 109], [10, 1665, 109], [191, 1755, 109], [234, 1844, 109], [111, 1932, 109]] };
  const mac = { src: '../assets/devices/b361.png', w: 2004, h: 618, kw: 76, kh: 57, spots: [[199, 222, 109], [200, 310, 109], [224, 399, 109], [225, 488, 109], [226, 575, 109], [227, 665, 109], [228, 753, 109], [229, 842, 109], [230, 931, 109], [231, 1019, 109], [232, 1108, 109], [233, 1194, 109], [13, 1284, 109], [10, 1665, 109], [191, 1755, 109], [234, 1844, 109], [111, 1932, 109]] };
  const business = { src: '../assets/devices/b363.png', w: 2004, h: 618, kw: 76, kh: 57, spots: [[199, 222, 109], [200, 310, 109], [226, 399, 109], [227, 488, 109], [259, 575, 109], [264, 665, 109], [284, 753, 109], [228, 842, 109], [229, 931, 109], [230, 1019, 109], [231, 1108, 109], [232, 1194, 109], [233, 1284, 109], [10, 1665, 109], [266, 1755, 109], [234, 1844, 109], [111, 1932, 109]] };
  const mini = { src: '../assets/devices/b369.png', w: 1382, h: 616, kw: 77, kh: 58, spots: [[226, 424, 114], [227, 513, 114], [259, 602, 114], [264, 689, 114], [266, 778, 114], [284, 866, 114], [229, 955, 114], [231, 1043, 114], [232, 1132, 114], [233, 1220, 114]] };
  const miniMac = { src: '../assets/devices/b36a.png', w: 1634, h: 725, kw: 91, kh: 68, spots: [[226, 498, 125], [227, 604, 125], [259, 709, 125], [264, 815, 125], [266, 918, 125], [284, 1023, 125], [229, 1129, 125], [231, 1233, 125], [232, 1338, 125], [233, 1444, 125], [285, 1548, 125]] };
  const miniBusiness = { src: '../assets/devices/b36e.png', w: 1382, h: 616, kw: 77, kh: 58, spots: [[226, 424, 114], [227, 513, 114], [259, 602, 114], [264, 689, 114], [266, 778, 114], [284, 866, 114], [229, 955, 114], [231, 1043, 115], [232, 1132, 114], [233, 1220, 114]] };
  return { b378: s, b379: s, b37a: s, b35b: keys, '408a': keys, b361: mac, '4092': mac, b363: business, b369: mini, b36e: miniBusiness, b36a: miniMac };
})();
function keyboardPhoto(d, plain) {
  const P = KEYBOARD_PHOTOS[d.id];
  if (!P) return '';
  const hot = plain ? '' : P.spots.filter(([cid]) => d.controls.some(c => c.cid === cid)).map(([cid, x, y]) => {
    const a = assignment(d, 'keys', cid); const ctl = d.controls.find(c => c.cid === cid);
    const editing = drawerUp() && S.picker.cid === cid;
    return `<g class="hotspot key-photo ${isNative(a) ? '' : 'assigned'} ${overridden(d, 'keys', cid) ? 'pv' : ''} ${editing ? 'selected' : ''}" data-section="keys" data-cid="${cid}" data-name="${esc(ctl ? ctl.label : cid)}" data-does="${esc(isNative(a) ? (ctl ? ctl.label : 'Default') : presetLabel(a))}" data-custom="${isNative(a) ? '' : '1'}"><rect x="${x - P.kw / 2}" y="${y - P.kh / 2}" width="${P.kw}" height="${P.kh}" rx="12"/></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${hot}</svg>`;
}

const KEY_ICONS = { brightness_down: 'fa-sun', brightness_up: 'fa-sun', backlight_down: 'fa-lightbulb', backlight_up: 'fa-lightbulb', dictation: 'fa-microphone', emoji: 'fa-face-smile', emoji_heart_eyes: 'fa-face-smile', emoji_crying: 'fa-face-smile', emoji_smiley: 'fa-face-smile', emoji_tears: 'fa-face-smile', mic_mute: 'fa-microphone-slash', prev_track: 'fa-backward-step', play_pause: 'fa-play', next_track: 'fa-forward-step', mute: 'fa-volume-xmark', volume_down: 'fa-volume-low', volume_up: 'fa-volume-high', calculator: 'fa-calculator', screenshot: 'fa-camera', context_menu: 'fa-bars', screen_lock: 'fa-lock', mission_control: 'fa-table-cells-large', launchpad: 'fa-grip', show_desktop: 'fa-desktop', home_show_desktop: 'fa-desktop', screen_capture: 'fa-camera', eject: 'fa-eject', do_not_disturb: 'fa-moon', app_switch: 'fa-window-restore', app_switch_dashboard: 'fa-window-restore', search: 'fa-magnifying-glass', home: 'fa-house', virtual_keyboard: 'fa-keyboard', language_switch: 'fa-language', voice_assistant: 'fa-comment-dots', open_apps: 'fa-window-restore', all_apps: 'fa-grip', switch_app: 'fa-window-restore' };
// What the MX Keys S reports, used only when a keyboard gives no positions for its F row
const FROW_FALLBACK = [199, 200, 226, 227, 259, 264, 284, 228, 229, 230, 231, 232];
// The F row and the keys beside it come from the keyboard itself: every reprogrammable control
// says which F key it sits on (1-12, 0 for a dedicated key). The MX Keys, MX Keys S and Craft all
// put different functions on those keys, so nothing here is fixed to one model.
function keyLayout(d) {
  const ctls = (d.controls || []).filter(c => c.divertable);
  const byPos = ctls.filter(c => c.position >= 1 && c.position <= 12).sort((a, b) => a.position - b.position);
  const frow = (byPos.length ? byPos : FROW_FALLBACK.map((cid, i) => { const c = ctls.find(x => x.cid === cid); return c && Object.assign({}, c, { position: i + 1 }); }).filter(Boolean))
    .map(c => ({ cid: c.cid, pos: c.position, k: 'F' + c.position, icon: KEY_ICONS[c.name] || 'fa-keyboard', label: c.label }));
  const inRow = new Set(frow.map(k => k.cid));
  const special = ctls.filter(c => !inRow.has(c.cid)).map(c => ({ cid: c.cid, icon: KEY_ICONS[c.name] || 'fa-keyboard', label: c.label }));
  return { frow, special };
}
function pageKeys(d) {
  // only the keyboard: hovering a key says what it does, clicking it opens its actions beside it
  const photo = keyboardPhoto(d);
  return photo ? `<div class="kb-photo">${photo}</div><div class="kb-tip" hidden></div>` : sec('Keys', card(row('No photo for this keyboard', '', '')));
}
// the tag pinned above the keyboard on the Backlight page, saying how the backlight is set right now
function backlightTag(d) {
  const st = d.state.backlight, s = (d.config.settings || {}).backlight || {}, n = st.num_levels || 8;
  const on = s.enabled ?? st.enabled, auto = (s.mode || (st.mode === 3 ? 'manual' : 'auto')) !== 'manual';
  const level = s.level ?? st.level, dur = s.duration_hands_out ?? st.duration_hands_out ?? 5;
  const step = Math.max(1, Math.min(BL_STEPS, Math.round(level * BL_STEPS / (n - 1))));
  const bits = !on ? ['Off'] : [auto ? 'Automatic' : `Level ${step} of ${BL_STEPS}`, `${dur >= 60 ? Math.round(dur / 60) + ' min' : dur + ' s'} after hands leave`].concat(s.battery_saving ? ['Battery saving'] : []);
  return `<div class="kb-pin bl-pin" data-act="bl-open" title="Backlight settings"><span class="k">Backlight</span><span class="d">${esc(bits.join(' · '))}</span></div>`;
}
function pageBacklight(d) {
  if (!isMouse(d) && (d.state || {}).backlight && KEYBOARD_PHOTOS[d.id]) return `<div class="kb-photo">${keyboardPhoto(d, true)}${backlightTag(d)}</div>`;   // settings live in the panel
  const st = (d.state || {}).backlight, s = (d.config.settings || {}).backlight || {};
  if (!st) return sec('Backlight', card(row('Not supported by this device', '', '')));
  const on = s.enabled ?? st.enabled, manual = (s.mode || (st.mode === 3 ? 'manual' : 'auto')) === 'manual';
  const level = manual ? (s.level ?? st.level) : st.current_level;
  const levels = Array.from({ length: st.num_levels || 8 }, (_, i) => `<button class="${on && i < level + (manual ? 1 : 0) ? (manual ? 'on' : 'auto') : ''}" style="height:${8 + i * 2.8}px" data-act="bl-level" data-key="${i}" title="Level ${i}"></button>`).join('');
  const hint = !on ? 'Backlight is off' : manual ? `Level ${level} of ${(st.num_levels || 8) - 1}` : 'Set by the ambient light sensor';
  const timers = [['duration_hands_out', 'fa-hand', 'Hands away', 'No hands over the keyboard', 1, 60, 1], ['duration_hands_in', 'fa-keyboard', 'Hands present', 'Typing paused', 1, 60, 1], ['duration_powered', 'fa-plug', 'On power', 'Charging cable connected', 5, 600, 5]];
  const fmt = v => v >= 60 ? `${Math.round(v / 60)} min` : `${v} s`;
  return sec('Backlight', card(row('Backlight', '', sw(on, 'data-act="setting" data-path="backlight.enabled"')) +
      `<div class="row"><span class="grow lbl">Mode</span><span class="seg"><button class="${manual ? '' : 'on'}" data-act="setting-val" data-path="backlight.mode" data-val="auto">Automatic</button><button class="${manual ? 'on' : ''}" data-act="setting-val" data-path="backlight.mode" data-val="manual">Manual</button></span></div>` +
      `<div class="row"><div class="grow"><div class="lbl">Level</div><div class="sub">${hint}</div></div><div class="levels">${levels}</div></div>`)) +
    sec('Turn off after', card(timers.map(([k, icon, label, desc, lo, hi, stp]) => { const v = s[k] ?? st[k]; return `<div class="row"><i class="fa-solid ${icon}" style="width:20px;text-align:center;color:var(--dim)"></i><div class="grow"><div class="lbl">${label}</div><div class="sub">${desc}</div></div><span class="stepper"><button data-act="step" data-key="${k}" data-d="${-stp}" data-lo="${lo}" data-hi="${hi}">−</button><span>${fmt(v)}</span><button data-act="step" data-key="${k}" data-d="${stp}" data-lo="${lo}" data-hi="${hi}">+</button></span></div>`; }).join('')));
}
// Backlight, laid out like a key's panel: the keyboard stays where it is, its settings on the right
const BL_STEPS = 6;
function renderBacklightPanel(d) {
  const st = d.state.backlight, s = (d.config.settings || {}).backlight || {}, n = st.num_levels || 8;
  const on = s.enabled ?? st.enabled, auto = (s.mode || (st.mode === 3 ? 'manual' : 'auto')) !== 'manual';
  const level = s.level ?? st.level, dur = s.duration_hands_out ?? st.duration_hands_out ?? 5;
  // six steps spread over the keyboard's own levels (1 .. n-1)
  const stepLevel = i => Math.max(1, Math.round(i * (n - 1) / BL_STEPS));
  const steps = Array.from({ length: BL_STEPS }, (_, k) => k + 1).map(i => `<button class="${level >= stepLevel(i) ? 'on' : ''}" style="height:${10 + i * 5}px" data-act="bl-level" data-key="${stepLevel(i)}" title="Level ${i} of ${BL_STEPS}"></button>`).join('');
  const body = row('Backlighting', '', sw(on, 'data-act="setting" data-path="backlight.enabled"')) +
    (on ? `<div class="row"><div class="grow"><div class="lbl">Backlight duration</div><div class="sub">Stays on after your hands leave the keys</div></div></div>
      <div class="row bl-slider">${range('data-act="setting-range" data-path="backlight.duration_hands_out" data-out="bld"', dur, 1, 300, 1)}<span class="val" data-out="bld">${fmtOut('bld', dur)}</span></div>` +
      row('Automatic brightness', 'Follows the light in the room', sw(auto, 'data-act="setting" data-path="backlight.mode" data-on="auto" data-off="manual"')) +
      (auto ? '' : `<div class="row"><div class="grow"><div class="lbl">Brightness</div><div class="sub">Level ${Math.max(0, [...Array(BL_STEPS).keys()].filter(k => level >= stepLevel(k + 1)).length)} of ${BL_STEPS}</div></div><div class="levels">${steps}</div></div>`) : '') +
    row('Battery saving mode', 'Backlight off at 20% battery or less, until charging', sw(!!s.battery_saving, 'data-act="setting" data-path="backlight.battery_saving"'));
  return `<div class="drawer-wrap"><div class="dlg drawer bl-panel" data-stop>
    <div class="dlg-head"><span class="dh-key">Modify settings</span><span class="dh-sub">Backlight</span></div>
    <div class="dlg-body"><div class="card">${body}</div></div>
    <div class="dlg-foot"><button class="btn flat" data-act="bl-reset"><i class="fa-solid fa-rotate-left"></i>Reset backlighting</button></div>
  </div></div>`;
}

export const provide = { KEYBOARD_PHOTOS, keyboardPhoto, KEY_ICONS, FROW_FALLBACK, keyLayout, pageKeys, backlightTag, pageBacklight, BL_STEPS, renderBacklightPanel };
