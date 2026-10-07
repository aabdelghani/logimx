// View: the action ring's settings page: the ring, its folders, its profiles and behaviour.
import { isFolderSlot, RING_DIRS } from '../../shared/ring.mjs';
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, appRing, card, esc, range, ringApp, ringAppName, ringEditing, ringFolder, ringInserting, ringSlots, ringState, ringTop, ringViewApp, row, sec, sw, takeCue;
export function link(ctx) { ({ S, appRing, card, esc, range, ringApp, ringAppName, ringEditing, ringFolder, ringInserting, ringSlots, ringState, ringTop, ringViewApp, row, sec, sw, takeCue } = ctx); }

// which ring an app uses, as one sentence (the app's name already escaped)
const usesLine = (app, rs, k) => { const ar = appRing(rs, k); return !ar ? t('{app} · uses the global ring', { app }) : ar.legacy ? t('{app} · uses its own ring', { app }) : t('{app} · uses {ring}', { app, ring: esc(t(rs.profiles[ar.i].name)) }); };   // i18n: data

// The action ring's own profiles, where the applications usually are: pick the one in use, make a
// blank one to drag actions onto. With an application picked in the mouse window, the choice is
// that application's ring; otherwise it is the global one.
function ringProfileBar() {
  const rs = ringState(), k = ringApp(), ar = k ? appRing(rs, k) : null;
  const cur = k ? (ar ? (ar.legacy ? '#own' : rs.profiles[ar.i].id) : '') : rs.profiles[rs.active].id;
  const pill = (id, label, icon) => {
    const on = cur === id, edit = on && id && id !== '#own';
    return `<div class="rp ${on ? 'on' : ''}" data-act="rp-use" data-key="${esc(id)}" title="${esc(label)}"><i class="fa-solid ${icon}"></i><span>${esc(label)}</span>${edit ? `<i class="fa-solid fa-pen rp-ed" data-act="rp-rename" data-key="${esc(id)}" title="${t('Rename')}"></i>${rs.profiles.length > 1 ? `<i class="fa-solid fa-xmark rp-ed" data-act="rp-delete" data-key="${esc(id)}" title="${t('Delete')}"></i>` : ''}` : ''}</div>`;
  };
  const pills = (k ? pill('', t('Same as global'), 'fa-globe') : '') + (ar && ar.legacy ? pill('#own', t('Own ring'), 'fa-circle-notch') : '') + rs.profiles.map(p => pill(p.id, t(p.name), 'fa-circle-notch')).join('');   // i18n: data
  return `<div class="pbar rpbar"><span class="rp-for">${k ? esc(ringAppName(k)) : t('Global')}</span>${pills}<button class="rp rp-new" data-act="rp-new" title="${t('A blank ring to drag actions onto')}"><i class="fa-solid fa-plus"></i><span>${t('New profile')}</span></button></div>`;
}
// Gestures & action ring in a device's view, laid out like the keyboard: the ring in the middle with
// each slot's action beside it; a slot opens its actions in the panel on the right
function ringStage() {
  const slots = ringSlots(true);   // the hovered app's ring, else the one being edited
  const top = ringTop(ringState(), true), f = ringFolder(top);
  // into a folder: the page grows out of the folder's place and its actions pop in one by one;
  // back out: the ring settles in and the folder's place gives a pulse
  const anim = takeCue('ringAnim');
  const at = anim ? (() => { const a = (anim.from * 45 - 90) * Math.PI / 180; return { x: 30 * Math.cos(a), y: 30 * Math.sin(a) }; })() : null;
  let order = 0;
  const parts = f ? ringParentRing(top) + ringFolderRow(slots) : slots.map((sl, i) => {
    const k = order++;
    const a = (i * 45 - 90) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const x = 50 + 30 * c, y = 50 + 30 * sn, lx = 50 + 41 * c, ly = 50 + 41 * sn;
    const tx = c > 0.3 ? '0' : c < -0.3 ? '-100%' : '-50%', ty = sn > 0.3 ? '0' : sn < -0.3 ? '-100%' : '-50%';
    // the ⋯ on a slot: make it a folder, open it, or clear it (inside a folder: clear only)
    const dots = !f || sl ? `<span class="rs-dots" data-act="rs-menu" data-key="${i}" title="${t('More')}"><i class="fa-solid fa-ellipsis"></i></span>` : '';
    const label = sl ? t(sl.label) : f ? t('Add') : t('Add action');   // i18n: data
    // back out of a folder: each button starts where the dimmed inner ring had it
    const from = anim && anim.kind === 'out' ? `;--ix:${(50 + RING_IN * c).toFixed(1)}%;--iy:${(50 + RING_IN * sn).toFixed(1)}%` : '';
    return `<button class="rs-chip ${sl ? '' : 'empty'} ${isFolderSlot(sl) ? 'folder' : ''} ${ringEditing(i) ? 'selected' : ''} ${anim && anim.kind === 'out' && i === anim.from ? 'just-closed' : ''}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--k:${k}${from}" data-act="pick" data-section="ring" data-cid="${i}" data-label="${esc(f ? t('Action {n}', { n: i + 1 }) : RING_DIRS[i])}" title="${esc(f ? t('Action {n}', { n: i + 1 }) : RING_DIRS[i])}"><i class="fa-solid ${sl ? esc(sl.icon || 'fa-circle-dot') : 'fa-plus'}"></i>${dots}</button>` +
      `<div class="rs-lab ${ringEditing(i) ? 'on' : ''} ${sl ? '' : 'empty'}" data-act="pick" data-section="ring" data-cid="${i}" data-label="${esc(f ? t('Action {n}', { n: i + 1 }) : RING_DIRS[i])}" style="left:${lx.toFixed(1)}%;top:${ly.toFixed(1)}%;transform:translate(${tx},${ty});--k:${k}">${esc(label)}${isFolderSlot(sl) ? ' <i class="fa-solid fa-chevron-right rs-more"></i>' : ''}</div>` +
      (S.menu === 'rs:' + i ? ringSlotMenu(sl, i, x, y, !!f) : '');
  }).join('');
  // in a folder the middle is the folder itself; its name and the way back are top-left
  const hub = f ? `<button class="rs-hub back" data-act="ring-up" title="${t('Back to the ring')}"><i class="fa-solid fa-arrow-left"></i></button>` : `<div class="rs-hub"><i class="fa-solid fa-circle-notch"></i></div>`;
  const where = !f && ringViewApp() ? `<div class="rs-where ${S.previewProfile ? 'preview' : ''}"><i class="fa-solid fa-window-maximize"></i>${usesLine(esc(ringAppName()), ringState(), ringViewApp())}</div>` : '';
  const animCls = anim ? (anim.kind === 'in' ? 'anim-in' : 'anim-out') : '', animVars = at ? `style="--fx:${at.x.toFixed(1)}%;--fy:${at.y.toFixed(1)}%"` : '';
  return `<div class="ring-stage">${where}<div class="rs-disc ${f ? 'in-folder' : ''} ${animCls}" ${animVars}>${parts}${hub}</div></div>`;
}
// A folder's page: its actions in order along a crescent around the folder, centred on the folder's
// direction, with an Add at each end (the start puts the new action first, the end last); with
// more of them the crescent grows into a bigger circle so they stay apart
// In a folder's page the ring is drawn as the real ring shows it: the inner ring smaller and dimmed
// with the folder lit, the folder's actions on a second circle around the same middle (twice the
// radius, 20° apart), in a row centred on the folder's direction with an Add
// at each end (the start puts a new action first, the end last)
const RING_IN = 20, RING_OUT = 40;   // radii in % of the drawing, the outer twice the inner
function ringParentRing(top) {
  const open = S.ringPath[0];
  return top.map((sl, i) => {
    if (!sl && i !== open) return '';
    const a = (i * 45 - 90) * Math.PI / 180, x = 50 + RING_IN * Math.cos(a), y = 50 + RING_IN * Math.sin(a);
    return `<button class="rs-chip parent ${i === open ? 'open' : ''}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%" data-act="rs-parent" data-key="${i}" title="${esc(sl ? t(sl.label) : RING_DIRS[i])}"><i class="fa-solid ${esc((sl && sl.icon) || 'fa-folder')}"></i></button>`;   // i18n: data
  }).join('');
}
function ringFolderRow(slots) {
  const items = []; slots.forEach((sl, i) => { if (sl) items.push(i); });
  const full = items.length >= 8;
  const row = full ? items.map(i => ({ i })) : items.length ? [{ add: 'start' }].concat(items.map(i => ({ i })), [{ add: 'end' }]) : [{ add: 'end' }];
  const m = row.length, step = 20, r = RING_OUT, base = S.ringPath[0] * 45 - 90;
  return row.map((it, k) => {
    const a = (base + (k - (m - 1) / 2) * step) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const x = 50 + r * c, y = 50 + r * sn, lx = 50 + (r + 10) * c, ly = 50 + (r + 10) * sn;
    const tx = c > 0.3 ? '0' : c < -0.3 ? '-100%' : '-50%', ty = sn > 0.3 ? '0' : sn < -0.3 ? '-100%' : '-50%';
    const pos = `left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--k:${k}`, lpos = `left:${lx.toFixed(1)}%;top:${ly.toFixed(1)}%;transform:translate(${tx},${ty});--k:${k}`;
    if (it.add) {
      const on = ringInserting(it.add), tip = it.add === 'start' ? t('Add at the start') : t('Add at the end');
      return `<button class="rs-chip empty add ${on ? 'selected' : ''}" style="${pos}" data-act="pick" data-section="ring" data-ins="${it.add}" data-cid="${it.add}" data-label="${t('New action')}" title="${tip}"><i class="fa-solid fa-plus"></i></button>` +
        `<div class="rs-lab empty ${on ? 'on' : ''}" data-act="pick" data-section="ring" data-ins="${it.add}" data-cid="${it.add}" data-label="${t('New action')}" style="${lpos}">${t('Add')}</div>`;
    }
    const i = it.i, sl = slots[i];
    return `<button class="rs-chip ${ringEditing(i) ? 'selected' : ''}" style="${pos}" data-act="pick" data-section="ring" data-cid="${i}" data-label="${t('Action {n}', { n: i + 1 })}" title="${esc(t(sl.label))}"><i class="fa-solid ${esc(sl.icon || 'fa-circle-dot')}"></i><span class="rs-dots" data-act="rs-menu" data-key="${i}" title="${t('More')}"><i class="fa-solid fa-ellipsis"></i></span></button>` +   // i18n: data
      `<div class="rs-lab ${ringEditing(i) ? 'on' : ''}" data-act="pick" data-section="ring" data-cid="${i}" data-label="${t('Action {n}', { n: i + 1 })}" style="${lpos}">${esc(t(sl.label))}</div>` +   // i18n: data
      (S.menu === 'rs:' + i ? ringSlotMenu(sl, i, x, y, true) : '');
  }).join('');
}
// the ⋯ menu of a slot, beside it
function ringSlotMenu(sl, i, x, y, inFolder) {
  const it = (act, icon, label, cls) => `<button data-act="${act}" data-key="${i}" class="${cls || ''}"><i class="fa-solid ${icon}"></i>${label}</button>`;
  const items = inFolder ? (sl ? it('rs-clear', 'fa-trash', t('Clear slot'), 'danger') : '')
    : isFolderSlot(sl) ? it('rs-open', 'fa-folder-open', t('Open folder')) + it('rs-clear', 'fa-trash', t('Remove folder'), 'danger')
    : it('rs-folder', 'fa-folder-plus', t('Add folder')) + (sl ? it('rs-clear', 'fa-trash', t('Clear slot'), 'danger') : '');
  return `<div class="menu rs-menu" data-menu style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%">${items}</div>`;
}

// the ring's profiles, from the panel head: switch, add one, or remove the one in use
function ringProfileMenu() {
  const rs = ringState(), cur = rs.profiles[rs.active];
  const k = ringApp();
  if (k) {
    const ar = appRing(rs, k), name = ringAppName(k);
    const item = (key, label, on, icon) => `<button data-act="ring-app-use" data-key="${esc(key)}"><i class="fa-solid ${icon}"></i>${esc(label)}${on ? '<i class="fa-solid fa-check chk"></i>' : ''}</button>`;
    const list = item('', t('Same as global'), !ar, 'fa-globe') + (ar && ar.legacy ? item('#own', t('Its own ring'), true, 'fa-circle-notch') : '') + rs.profiles.map(pr => item(pr.id, t(pr.name), ar && !ar.legacy && rs.profiles[ar.i].id === pr.id, 'fa-layer-group')).join('');   // i18n: data
    const menu = S.menu === 'ringprof' ? `<div class="menu prof-menu"><div class="mhead">${t('Ring for {name}', { name: esc(name) })}</div>${list}<div class="sep"></div><button data-act="ring-app-new"><i class="fa-solid fa-plus"></i>${t('New blank profile')}</button></div>` : '';
    return `<div class="prof-dd"><button class="hbtn prof-btn" data-act="menu-ringprof" title="${t('The ring {name} uses', { name: esc(name) })}"><i class="fa-solid ${ar ? 'fa-layer-group' : 'fa-globe'}"></i><span>${esc(ar ? (ar.legacy ? t('Own ring') : t(rs.profiles[ar.i].name)) : t('Same as global'))}</span><i class="fa-solid fa-chevron-down"></i></button>${menu}</div>`;   // i18n: data
  }
  const list = rs.profiles.map((pr, i) => `<button data-act="ring-profile" data-key="${i}"><i class="fa-solid fa-layer-group"></i>${esc(t(pr.name))}${i === rs.active ? '<i class="fa-solid fa-check chk"></i>' : ''}</button>`).join('');   // i18n: data
  const menu = S.menu === 'ringprof' ? `<div class="menu prof-menu"><div class="mhead">${t('Ring profiles')}</div>${list}<div class="sep"></div><button data-act="ring-profile-add"><i class="fa-solid fa-plus"></i>${t('New profile')}</button>${rs.profiles.length > 1 ? `<button data-act="ring-profile-delete" class="danger"><i class="fa-solid fa-trash"></i>${t('Remove "{name}"', { name: esc(t(cur.name)) })}</button>` : ''}</div>` : '';   // i18n: data
  return `<div class="prof-dd"><button class="hbtn prof-btn" data-act="menu-ringprof" title="${t('Ring profile')}"><i class="fa-solid fa-layer-group"></i><span>${esc(t(cur.name))}</span><i class="fa-solid fa-chevron-down"></i></button>${menu}</div>`;   // i18n: data
}
// how the ring behaves, shown at the foot of the ring's action panel
function ringBehaviour() {
  const rs = ringState();
  const free = row(t('Keep the pointer visible and free'), rs.free_pointer ? t('The pointer moves anywhere; the action under it is chosen') : t('The pointer hides and the mouse steers the ring'), sw(rs.free_pointer, 'data-act="ring-free"'));
  const feel = rs.free_pointer ? '' : `<div class="row"><span class="grow lbl">${t('Travel before it picks')}</span>${range('data-act="ring-travel" data-out="rtravel"', rs.travel, 10, 80, 5)}<span class="val" data-out="rtravel" style="width:24px;text-align:right">${rs.travel}</span></div>`;
  const sz = (key, l) => `<button class="${rs.size === key ? 'on' : ''}" data-act="ring-size" data-key="${key}">${l}</button>`;
  const size = `<div class="row"><span class="grow lbl">${t('Ring size')}</span><span class="seg">${sz('small', t('Small'))}${sz('medium', t('Medium'))}${sz('large', t('Large'))}</span></div>`;
  return `<div class="ring-behaviour">${sec(t('Ring behaviour'), card(size + free + feel))}</div>`;
}
// the Action ring page (no mouse here): the same editor as a button's Configure action ring, with how
// the ring behaves under it while no slot's actions are open on the right (the panel shows it then)
function pageRing() {
  const panel = S.dlg === 'picker' && S.picker && S.picker.drawer;
  return `<div class="ring-page">${ringStage()}<div class="rs-bar"><span></span><button class="btn" data-act="ring-test"><i class="fa-solid fa-play"></i>${t('Try it')}</button></div>${panel ? '' : ringBehaviour()}</div>`;
}

export const provide = { ringProfileBar, ringStage, RING_IN, RING_OUT, ringParentRing, ringFolderRow, ringSlotMenu, ringProfileMenu, ringBehaviour, pageRing };
