// View: the action picker, as a dialog or as the panel beside a device.
import { RING_BRIGHTNESS } from '../../shared/ring.mjs';
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let GESTURE_RECOMMEND, IS_LINUX, IS_MAC, IS_WIN, KEY_GROUP_NAMES, MOUSE_RECOMMEND, OPTS_CARD, PICKER_CATS, PICKER_FOLD, RECOMMEND, RING_DRAG, RING_RECOMMEND, RING_WHEEL, S, allowedFor, appLabel, appSet, brightnessStatus, curOf, drawerItems, easyLabel, esc, groupsFor, isRingAction, keyCur, keyGroups, keyName, onAction, pickerItems, presetItem, recItem, ringBehaviour, root, sec, sectionsFor, takeUnfolded;
export function link(ctx) { ({ GESTURE_RECOMMEND, IS_LINUX, IS_MAC, IS_WIN, KEY_GROUP_NAMES, MOUSE_RECOMMEND, OPTS_CARD, PICKER_CATS, PICKER_FOLD, RECOMMEND, RING_DRAG, RING_RECOMMEND, RING_WHEEL, S, allowedFor, appLabel, appSet, brightnessStatus, curOf, drawerItems, easyLabel, esc, groupsFor, isRingAction, keyCur, keyGroups, keyName, onAction, pickerItems, presetItem, recItem, ringBehaviour, root, sec, sectionsFor, takeUnfolded } = ctx); }

function renderPicker() {
  const p = S.picker;
  const cur = p.current;
  const curKey = typeof cur === 'string' ? cur : (cur && cur.preset);
  const foot = `<div class="dlg-foot">${p.section === 'ring' ? `<button class="btn flat danger" data-act="pick-default"><i class="fa-solid fa-trash"></i>${t('Clear slot')}</button>` : `<button class="btn flat" data-act="pick-default" title="${t('Back to what this control does out of the box')}"><i class="fa-solid fa-rotate-left"></i>${t('Reset to default')}</button><button class="btn flat danger" data-act="pick-disable">${p.section === 'gesture' ? t('Do nothing') : p.section === 'keys' ? t('Disable key') : p.section === 'thumbwheel' ? t('Disable wheel') : t('Disable button')}</button>`}<div class="r"><button class="btn" data-act="close-dlg">${t('Cancel')}</button><button class="btn primary" data-act="pick-assign">${t('Assign')}</button></div></div>`;
  if (p.drawer) return renderPickerDrawer(foot.replace(/<div class="r">[\s\S]*<\/div><\/div>$/, '</div>'));
  let body;
  if (p.cat === 'key') {
    body = `<div class="recbox" data-act="rec-start"><i class="fa-solid fa-keyboard big-ic"></i><div class="t">${p.recording ? t('Press the keys to record') : t('Click here, then press the keys')}</div><div class="keys">${(p.chord || []).length ? p.chord.map(k => `<span>${esc(keyName(k))}</span>`).join('') : '<span style="opacity:.5">…</span>'}</div><div class="hint">${t('Release to finish. Esc cancels.')}</div>${p.recording ? '' : `<button class="btn primary" data-act="rec-start">${t('Start recording')}</button>`}</div>
      <div class="hint">${t('Or type it:')} <input class="text" data-field="typed" placeholder="ctrl+alt+shift+z" style="width:200px;margin-left:8px" value="${esc(p.typed || '')}"></div>`;
  } else if (p.cat === 'cmd') {
    body = sec(t('Shell command'), `<input class="mono" data-field="cmd" placeholder="${IS_WIN() ? 'notepad.exe' : IS_MAC() ? 'open -a Calculator' : 'gnome-screenshot -i'}" value="${esc(p.cmd || '')}"><div class="hint">${t('Runs in the user session with your environment. Non-interactive.')}</div>`) +
      sec(t('Type text'), `<input class="mono" data-field="text" placeholder="${t('Text typed as keystrokes')}" value="${esc(p.text || '')}">`) +
      sec(t('Open URL, file or folder'), `<input class="mono" data-field="open" placeholder="${t('https://… or ~/Documents')}" value="${esc(p.open || '')}">`);
  } else if (p.cat === 'app') {
    body = `<div class="applist">${appTabHtml(p)}</div>`;
  } else {
    const items = pickerItems(p);
    body = `<div class="acts">${items.map(i => `<button class="act ${curKey === i.key || p.sel === i.key ? 'on' : ''}" data-act="pick-item" data-key="${i.key}"><i class="fa-solid ${i.icon} ic"></i><span class="t">${esc(i.label)}</span><span class="m">${i.meta}</span><i class="fa-solid fa-check chk"></i></button>`).join('') || `<div class="row hint">${t('No actions match')}</div>`}</div>`;
  }
  return `${p.drawer ? '<div class="drawer-wrap"><div class="dlg drawer" data-stop>' : '<div class="scrim" data-act="close-dlg"><div class="dlg" data-stop>'}
    <div class="dlg-head">${p.drawer ? `<span class="dh-key">${t('Action')}</span><span class="dh-sub">${t('Choose what it does')}</span>` : t('Choose action · {name}', { name: esc(p.label) })}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body">
      <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input data-field="q" placeholder="${t('Search actions')}" value="${esc(p.q || '')}"></div>
      <div class="cats">${PICKER_CATS.filter(([k]) => !(p.section === 'thumbwheel' && ['key', 'media', 'window', 'ws', 'app'].includes(k))).map(([k, l, i]) => `<button class="pill ${p.cat === k ? 'on' : ''}" data-act="pick-cat" data-key="${k}"><i class="fa-solid ${i}"></i>${l}</button>`).join('')}</div>
      ${body}
    </div>
    ${foot}
  </div></div>`;
}
const actRow = (p, i) => `<button class="act ${(p.selKey || curOf(p) || '') === i.key ? 'on' : ''}" data-act="pick-item" data-key="${i.key}"><i class="fa-solid ${i.icon} ic"></i><span class="t">${esc(i.label)}${i.key === 'action_ring' ? `<span class="new-tag">${t('New')}</span>` : ''}${p.section === 'ring' ? adjBadge(i.key) : ''}</span>${i.meta ? `<span class="m">${esc(i.meta)}</span>` : ''}<i class="fa-solid fa-check chk"></i></button>`;
const keyRow = (p, k, meta) => `<button class="act ${(p.selKey || (keyCur(p) && 'key:' + keyCur(p)) || '') === 'key:' + k.code ? 'on' : ''}" data-act="pick-key" data-key="${k.code}"><span class="kcap">${esc(k.label)}</span>${meta ? `<span class="m">${meta}</span>` : ''}<i class="fa-solid fa-check chk"></i></button>`;
const keyCap = (p, k) => `<button class="kc ${(p.selKey || (keyCur(p) && 'key:' + keyCur(p)) || '') === 'key:' + k.code ? 'on' : ''}" data-act="pick-key" data-key="${k.code}" title="${esc(k.label)}">${esc(k.label)}</button>`;
const adjBadge = k => RING_DRAG.has(k) ? `<span class="adj-tag" title="${t('Hold and drag, or scroll over it, to change')}"><i class="fa-solid fa-sliders"></i></span>`
  : RING_WHEEL.has(k) ? `<span class="adj-tag" title="${t('Scroll over it to change')}"><i class="fa-solid fa-sliders"></i></span>` : '';
// monitor brightness needs ddcutil and access to the monitors' I2C buses: asked once, offered
// under Brightness when this computer does not have it yet
function briSetupRow() {
  const st = brightnessStatus();
  if (!st || st.ok || !['ddcutil', 'i2c'].includes(st.reason)) return '';
  return `<button class="act ring-cfg" data-act="bri-setup"><i class="fa-solid fa-screwdriver-wrench ic"></i><span class="t">${t('Set up brightness')}</span><span class="m">${st.reason === 'ddcutil' ? t('Installs ddcutil') : t('Allows access')}</span><i class="fa-solid fa-arrow-right more"></i></button>`;
}
const ringSoonRows = () => [['fa-layer-group', t('Next ring profile')]]
  .map(([ic, l]) => `<div class="act soon" aria-disabled="true" title="${t('Coming soon')}"><i class="fa-solid ${ic} ic"></i><span class="t">${l}</span><span class="soon-tag">${t('Soon')}</span></div>`).join('');
const recBox = p => `<div class="recbox" data-act="rec-start"><i class="fa-solid fa-keyboard big-ic"></i><div class="t">${p.recording ? t('Press the keys to record') : t('Click here, then press the keys')}</div><div class="keys">${(p.chord || []).length ? p.chord.map(x => `<span>${esc(keyName(x))}</span>`).join('') : '<span style="opacity:.5">…</span>'}</div><div class="hint">${t('Release to finish. Esc cancels.')}</div></div>
      <div class="hint">${t('Or type it:')} <input class="text" data-field="typed" placeholder="ctrl+alt+shift+z" style="width:200px;margin-left:8px" value="${esc(p.typed || '')}"></div>`;
function drawerSection(p, k) {
  if (k === 'rec') {
    const ok = allowedFor(p), mouse = p.section === 'buttons' || p.section === 'thumbwheel';
    // a ring slot or a gesture has no function of its own: only suggestions
    if (p.section === 'ring' || p.section === 'gesture') {
      const ring = p.section === 'ring';
      const sugg = (ring ? RING_RECOMMEND : GESTURE_RECOMMEND).filter(k => ok.has(k) && S.presets.all[k]).map(k => { const i = presetItem(k), es = ring && easyLabel(k); if (es) i.label = es; return i; });
      // screen brightness sits next to Volume and works the same way
      const vi = sugg.findIndex(i => i.key === 'volume_dial');
      if (ring && IS_LINUX()) sugg.splice(vi + 1, 0, { key: 'ring:brightness', icon: 'fa-sun', label: t(RING_BRIGHTNESS.label) }); // i18n: data
      const ks = `<button class="act ${p.cat === 'key' ? 'on' : ''}" data-act="rec-open"><i class="fa-solid fa-keyboard ic"></i><span class="t">${t('Keystroke assignment')}</span><i class="fa-solid ${p.cat === 'key' ? 'fa-chevron-up' : 'fa-chevron-down'} more"></i></button>`;
      return `<div class="acts">${sugg.map(i => actRow(p, i) + (i.key === 'ring:brightness' ? briSetupRow() : '')).join('')}${ks}${ring ? ringSoonRows() : ''}</div>${p.cat === 'key' ? recBox(p) : ''}`;
    }
    const r = mouse ? null : RECOMMEND[p.cid];
    const own = r ? r[0] : p.section === 'thumbwheel' ? t('Horizontal scroll') : t((p.ctl && p.ctl.label) || p.label || 'Default');   // i18n: data
    // a button's own function comes first; the gesture button and the MX Master 4's haptic panel have
    // none worth choosing (left to the mouse they do nothing here), so their list starts with what they can do
    const rows = p.section === 'buttons' && (p.cid === 195 || p.cid === 416) ? [] : [Object.assign(presetItem('native'), { label: own, meta: t('Default') })];
    for (const c of (r || []).slice(1)) if (OPTS_CARD[c] && ok.has(OPTS_CARD[c])) rows.push(presetItem(OPTS_CARD[c]));
    // a button that can be held and moved offers the action ring and gestures right after its own
    // function; the fixed gesture presets give way to the button's own gestures
    const holdable = p.section === 'buttons' && !!(p.ctl && p.ctl.raw_xy);
    if (holdable) rows.push(presetItem('action_ring'), { key: 'gestures', icon: 'fa-hand-pointer', label: t('Gestures') });
    const aset = mouse ? appSet(p) : null, list = aset ? (aset[p.section === 'thumbwheel' ? 'thumb' : p.cid] || MOUSE_RECOMMEND[p.cid] || []) : (MOUSE_RECOMMEND[p.section === 'thumbwheel' ? 'thumb' : p.cid] || []);
    if (mouse) for (const k of list) {
      if (k.startsWith('app:')) { rows.push(Object.assign(recItem(k), { meta: appLabel(aset) })); continue; }
      if (ok.has(k) && S.presets.all[k] && !(holdable && (k === 'action_ring' || S.presets.all[k].type === 'gesture'))) rows.push(presetItem(k));
    }
    // 3. the thumb wheel: any two keystrokes, one for each way it turns
    if (p.section === 'thumbwheel') rows.push({ key: 'wheel:keys', icon: 'fa-keyboard', label: t('Two keystrokes'), meta: t('One each way') });
    // 2. a key can open the action ring, as in Options+
    if (!mouse && ok.has('action_ring')) rows.push(presetItem('action_ring'));
    if (p.section === 'thumbwheel') return `<div class="acts">${rows.map(i => actRow(p, i)).join('')}</div>`;
    const ks = `<button class="act ${p.cat === 'key' ? 'on' : ''}" data-act="rec-open"><i class="fa-solid fa-keyboard ic"></i><span class="t">${t('Keystroke assignment')}</span><i class="fa-solid ${p.cat === 'key' ? 'fa-chevron-up' : 'fa-chevron-down'} more"></i></button>`;
    // a button set to show the action ring gets a way straight to the ring's own settings
    // set to show the action ring: a way to the ring's own settings, tucked under that row
    const ringCfg = (p.section === 'buttons' || !mouse) && isRingAction(p.current) ? `<button class="act ring-cfg" data-act="ring-config"><i class="fa-solid fa-sliders ic"></i><span class="t">${t('Configure action ring')}</span><i class="fa-solid fa-arrow-right more"></i></button>` : '';
    const gesturesOn = p.section === 'buttons' && !!p.current && (typeof p.current === 'string' ? (S.presets.all[p.current] || {}) : p.current).type === 'gesture';
    const gestRow = `<button class="act ${gesturesOn ? 'on' : ''}" data-act="pick-gestures"><i class="fa-solid fa-hand-pointer ic"></i><span class="t">${t('Gestures')}</span><span class="m">${t('Hold and swipe')}</span><i class="fa-solid fa-check chk"></i></button>` +
      (gesturesOn ? `<button class="act ring-cfg" data-act="gest-config"><i class="fa-solid fa-sliders ic"></i><span class="t">${t('Configure gestures')}</span><i class="fa-solid fa-arrow-right more"></i></button>` : '');
    return `<div class="acts">${rows.map(i => i.key === 'gestures' ? gestRow : actRow(p, i) + (i.key === 'action_ring' ? ringCfg : '')).join('')}${ks}</div>${p.cat === 'key' ? recBox(p) : ''}`;
  }
  if (k === 'smart') return sec(t('Run a command'), `<input class="mono" data-field="cmd" placeholder="${IS_WIN() ? 'notepad.exe' : IS_MAC() ? 'open -a Calculator' : 'gnome-screenshot -i'}" value="${esc(p.cmd || '')}">`) +
      sec(t('Type text'), `<input class="mono" data-field="text" placeholder="${t('Text typed as keystrokes')}" value="${esc(p.text || '')}">`) +
      sec(t('Open URL, file or folder'), `<input class="mono" data-field="open" placeholder="${t('https://… or ~/Documents')}" value="${esc(p.open || '')}">`) +
      sec(t('Open application'), `<div class="applist smart-apps">${appTabHtml(Object.assign({}, p, { q: '' }))}</div>`);
  const groups = groupsFor(p).map(([g, l]) => { const items = drawerItems(g, p); return items.length ? `<div class="kgroup"><div class="kg-t">${l}</div><div class="acts">${items.map(i => actRow(p, i)).join('')}</div></div>` : ''; }).join('');
  if (p.section === 'thumbwheel') return groups;
  const keys = KEY_GROUP_NAMES.map(([g, l]) => `<div class="kgroup"><div class="kg-t">${l}</div><div class="kgrid">${keyGroups()[g].map(x => keyCap(p, x)).join('')}</div></div>`).join('');
  return groups + keys;
}
function renderPickerDrawer(foot) {
  const p = S.picker, q = (p.q || '').trim().toLowerCase();
  const fold = p.fold || PICKER_FOLD;
  let list;
  if (q) {
    const hits = [];
    for (const [g, l] of groupsFor(p)) for (const i of drawerItems(g, p)) if (i.label.toLowerCase().includes(q)) hits.push(actRow(p, Object.assign(i, { meta: l })));
    if (p.section !== 'thumbwheel') for (const [g, l] of KEY_GROUP_NAMES) for (const x of keyGroups()[g]) if (x.label.toLowerCase() === q || (q.length > 1 && x.label.toLowerCase().includes(q))) hits.push(keyRow(p, x, l));
    if (p.section !== 'thumbwheel' && ('keystroke assignment'.includes(q) || 'shortcut'.includes(q) || t('Keystroke assignment').toLowerCase().includes(q))) hits.unshift(`<button class="act" data-act="rec-open"><i class="fa-solid fa-keyboard ic"></i><span class="t">${t('Keystroke assignment')}</span><span class="m">${t('Recommended')}</span></button>`);
    list = `<div class="acts">${hits.join('') || `<div class="row hint">${t('No actions match')}</div>`}</div>`;
  } else {
    const unfolded = takeUnfolded();
    list = sectionsFor(p).map(([k, l]) => `<div class="acc ${fold[k] ? 'open' : ''}"><button class="acc-head" data-act="acc-toggle" data-key="${k}"><span class="grow">${l}</span><i class="fa-solid fa-chevron-down chev"></i></button>${fold[k] ? `<div class="acc-body ${unfolded === k ? 'unfold' : ''}">${drawerSection(p, k)}</div>` : ''}</div>`).join('');
  }
  return `<div class="drawer-wrap"><div class="dlg drawer" data-stop>
    <div class="dlg-head"><span class="dh-key">${t('Action')}</span><span class="dh-sub">${t('Choose what it does')}</span></div>
    <div class="dlg-body">
      <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input data-field="q" placeholder="${t('Search all actions')}" value="${esc(p.q || '')}"></div>
      <div class="acc-list">${list}</div>
      ${p.section === 'ring' ? ringBehaviour() : ''}
    </div>
    ${foot}
  </div></div>`;
}
function appTabHtml(p) {
  const q = (p.q || '').toLowerCase();
  const match = a => !q || (a.name || '').toLowerCase().includes(q) || (a.wm_class || '').toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q);
  const row = a => `<button class="act ${p.launch === a.id ? 'on' : ''}" data-act="pick-launch" data-key="${esc(a.id)}" title="${esc(a.wm_class || a.id)}"><i class="fa-solid ${a.source === 'steam' ? 'fa-gamepad' : 'fa-rocket'} ic"></i><span class="t">${esc(a.name)}</span>${a.source === 'steam' ? '<span class="m">Steam</span>' : ''}</button>`;
  const running = (S.running || []).filter(a => a.id && match(a));
  const runningIds = new Set(running.map(a => a.id));
  const rest = (S.apps || []).filter(a => match(a) && !runningIds.has(a.id));
  if (!running.length && !rest.length) return `<div class="row hint">${S.apps ? t('No application matches that search.') : t('Loading applications…')}</div>`;
  return (running.length ? sec(t('Running now'), `<div class="acts">${running.map(row).join('')}</div>`) : '') +
    (rest.length ? sec(running.length ? t('All applications') : t('Applications'), `<div class="acts">${rest.map(row).join('')}</div>`) : '');
}
// Replace only the list, so the search box keeps focus and the caret stays at the end.
function renderAppList() {
  const wrap = root.querySelector('.applist');
  if (!wrap) return;
  wrap.innerHTML = appTabHtml(S.picker);
  wrap.querySelectorAll('[data-act]').forEach(b => b.onclick = e => { e.stopPropagation(); onAction('pick-launch', b); });
}
function renderPickerList() { const p = S.picker; const list = root.querySelector('.acts'); if (!list) return; const items = pickerItems(p); const curKey = typeof p.current === 'string' ? p.current : (p.current && p.current.preset); list.innerHTML = items.map(i => `<button class="act ${curKey === i.key || p.sel === i.key ? 'on' : ''}" data-act="pick-item" data-key="${i.key}"><i class="fa-solid ${i.icon} ic"></i><span class="t">${esc(i.label)}</span><span class="m">${i.meta}</span><i class="fa-solid fa-check chk"></i></button>`).join('') || `<div class="row hint">${t('No actions match')}</div>`; list.querySelectorAll('[data-act]').forEach(b => b.onclick = e => { e.stopPropagation(); onAction('pick-item', b); }); }

export const provide = { renderPicker, actRow, keyRow, keyCap, adjBadge, briSetupRow, ringSoonRows, recBox, drawerSection, renderPickerDrawer, appTabHtml, renderAppList, renderPickerList };
