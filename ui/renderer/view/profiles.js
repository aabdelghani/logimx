// View: application profiles: the bar at the top of a device and the Profiles pages.
import { isMouse } from '../../shared/profiles.mjs';

// from the rest of the window, filled in by link()
let PHYS, S, addLabel, appIcon, card, countOverrides, dev, deviceProfiles, drop, esc, keyLayout, onAction, presetLabel, previewProfile, profileOf, render, root, sec;
export function link(ctx) { ({ PHYS, S, addLabel, appIcon, card, countOverrides, dev, deviceProfiles, drop, esc, keyLayout, onAction, presetLabel, previewProfile, profileOf, render, root, sec } = ctx); }

// the applications' icons, as the main process found them (null: none, or still looking)
const icons = { byKey: {}, byId: {} };
// ----------------------------------------------------------- profile bar
// Top right of a device's view: the global settings, one icon per application profile, and +.
// Hovering an app previews its changes on the device; clicking it edits that profile; its ×
// removes it (after asking).
function profileIcon(p) {
  const cls = (p.match[0] || '').toLowerCase(), apps = S.apps || [];
  const a = apps.find(x => (x.wm_class || '').toLowerCase() === cls || (x.id || '').toLowerCase() === cls) || apps.find(x => (x.name || '').toLowerCase() === p.name.toLowerCase());
  const key = p.key;
  if (a && !(key in icons.byKey)) {
    icons.byKey[key] = null;
    appIcon(a).then(u => { if (u) { icons.byKey[key] = u; render(); } }).catch(() => {});
  }
  return icons.byKey[key] ? `<img src="${icons.byKey[key]}" alt="">` : `<span class="pf-letter" style="background:${colorFor(p.name)}">${esc(p.name.charAt(0).toUpperCase())}</span>`;
}
function profileBar() {
  const cur = S.editProfile || 'default';
  // the profile in use right now, from the app in front: a live dot on its icon
  const live = (dev() || {}).profile || 'default';
  const apps = deviceProfiles(dev()).map(p => `<div class="pf-wrap"><button class="pf pf-app ${cur === p.key ? 'on' : ''} ${live === p.key ? 'live' : ''}" data-act="pf-edit" data-key="${esc(p.key)}" data-tip="${esc(p.name)}${live === p.key ? ' · in use now' : ''}">${profileIcon(p)}</button><button class="pf-x" data-act="pf-remove" data-key="${esc(p.key)}" title="Remove"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
  // ticked in the add panel and not added yet: shown faded until Add, gone if the panel is closed
  const pending = (S.addPanel ? S.addSel || [] : []).map(id => (S.apps || []).find(a => a.id === id)).filter(Boolean).map(a => { const u = icons.byId[a.id]; return `<div class="pf-wrap"><span class="pf pending" data-tip="${esc(a.name)} (not added yet)">${u ? `<img src="${u}" alt="">` : `<span class="pf-letter" style="background:${colorFor(a.name)}">${esc(a.name.charAt(0).toUpperCase())}</span>`}</span></div>`; }).join('');
  return `<div class="pbar"><button class="pf ${cur === 'default' ? 'on' : ''} ${live === 'default' ? 'live' : ''}" data-act="pf-edit" data-key="default" data-tip="Global settings${live === 'default' ? ' · in use now' : ''}"><i class="fa-solid fa-globe"></i></button>${apps}${pending}<button class="pf pf-add" data-act="pf-add" data-tip="Add application"><i class="fa-solid fa-plus"></i></button></div>`;
}
function allProfiles() {
  const map = {};
  for (const d of S.devices) for (const [k, p] of Object.entries((d.config || {}).profiles || {})) { if (k === 'default') continue; map[k] = map[k] || { key: k, name: p.name || k, match: p.match || [], overrides: 0 }; map[k].overrides += countOverrides(d, k); }
  return Object.values(map);
}

function pageApps() {
  const profs = allProfiles();
  const rows = [`<div class="row click app-row" data-act="app-detail" data-key="default"><span class="ch" style="background:var(--dim)">∗</span><div class="grow"><div class="lbl">Default</div><div class="sub">all other windows</div></div><i class="fa-solid fa-chevron-right" style="color:var(--dim)"></i></div>`]
    .concat(profs.map(p => `<div class="row click app-row" data-act="app-detail" data-key="${esc(p.key)}"><span class="ch" style="background:${colorFor(p.name)}">${esc(p.name.charAt(0).toUpperCase())}</span><div class="grow"><div class="lbl">${esc(p.name)}</div><div class="sub">${esc(p.match.join(', '))}</div></div><span class="val">${p.overrides} override${p.overrides === 1 ? '' : 's'}</span><i class="fa-solid fa-chevron-right" style="color:var(--dim)"></i></div>`)).join('');
  const sugg = (S.apps || []).filter(a => !profs.some(p => p.match.includes(a.wm_class || a.id))).slice(0, 8);
  return sec('Profiles', card(rows) + `<div style="margin-top:8px"><button class="btn" data-act="add-app"><i class="fa-solid fa-plus"></i>Add application</button></div>`, 'Matched on the focused window class') +
    sec('Suggestions from installed applications', `<div class="chips">${sugg.map(a => `<button class="chip" data-act="add-app-quick" data-name="${esc(a.name)}" data-cls="${esc(a.wm_class || a.id)}">${esc(a.name)}</button>`).join('') || '<span class="hint">No suggestions</span>'}</div>`);
}
// a steady colour per name, dark enough for white letters on it (contrast above 4.5)
const colorFor = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 55% 34%)`; };
function pageAppDetail(ad) {
  const key = ad.key, isDef = key === 'default';
  const groups = S.devices.map(d => {
    const def = profileOf(d, 'default'), p = profileOf(d, key);
    const items = [];
    const ctls = isMouse(d) ? PHYS.filter(([cid]) => d.controls.some(c => c.cid === cid)).map(([cid, l]) => ['buttons', cid, l]) : (l => l.frow.concat(l.special).map(({ cid, label }) => ['keys', cid, label]))(keyLayout(d));
    for (const [secn, cid, label] of ctls) {
      const dv = (def[secn] || {})[String(cid)], v = (p[secn] || {})[String(cid)];
      const ov = !isDef && v !== undefined && JSON.stringify(v) !== JSON.stringify(dv);
      items.push(`<div class="row"><span class="ov-dot ${ov ? 'on' : ''}"></span><span class="grow lbl" style="${ov ? '' : 'color:var(--dim)'}">${esc(label)}</span>${ov ? `<span class="val">${esc(presetLabel(dv))}</span>` : ''}${drop(v !== undefined ? v : dv, `data-act="pick" data-dev="${d.id}" data-section="${secn}" data-cid="${cid}" data-label="${esc(label)}" data-profile="${esc(key)}"`)}${ov ? `<button class="btn sm flat" data-act="ov-reset" data-dev="${d.id}" data-section="${secn}" data-cid="${cid}" data-profile="${esc(key)}" title="Reset to default"><i class="fa-solid fa-rotate-left"></i></button>` : ''}</div>`);
    }
    if (isMouse(d)) { const dv = def.thumbwheel, v = p.thumbwheel; const ov = !isDef && v !== undefined && JSON.stringify(v) !== JSON.stringify(dv); items.push(`<div class="row"><span class="ov-dot ${ov ? 'on' : ''}"></span><span class="grow lbl" style="${ov ? '' : 'color:var(--dim)'}">Thumb wheel</span>${ov ? `<span class="val">${esc(presetLabel(dv))}</span>` : ''}${drop(v !== undefined ? v : dv, `data-act="pick" data-dev="${d.id}" data-section="thumbwheel" data-cid="thumb" data-label="Thumb wheel" data-profile="${esc(key)}"`)}</div>`); }
    return sec(d.name, card(items.join('')));
  }).join('');
  const prof = isDef ? { name: 'Default', match: [] } : (allProfiles().find(p => p.key === key) || { name: key, match: [] });
  return `<div class="row" style="border:0;padding:0 0 4px"><span class="ch app-row" style="width:36px;height:36px;border-radius:10px;background:${isDef ? 'var(--dim)' : colorFor(prof.name)};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${esc(prof.name.charAt(0).toUpperCase())}</span><div class="grow"><div class="lbl" style="font-size:17px;font-weight:600">${esc(prof.name)}</div><div class="sub">${isDef ? 'Used for all other windows' : esc(prof.match.join(', ')) + ' · ' + (prof.overrides || 0) + ' overrides'}</div></div>${isDef ? '' : `<button class="btn sm" data-act="reset-overrides" data-key="${esc(key)}"><i class="fa-solid fa-rotate-left"></i>Reset all</button><button class="btn sm" data-act="rename-profile" data-key="${esc(key)}"><i class="fa-solid fa-pen"></i>Rename</button><button class="btn sm danger" data-act="del-profile" data-key="${esc(key)}">Remove</button>`}</div>` +
    groups + (isDef ? '' : `<div class="legend"><span class="dot" style="background:var(--accbg)"></span>Overridden here<span class="dot" style="background:var(--trk);margin-left:8px"></span>Inherited from Default</div>`);
}
// the bar redrawn in place (the panel keeps its search and scroll position)
function refreshBar() {
  const old = root.querySelector('.pbar'); if (!old) return;
  old.outerHTML = profileBar();
  const bar = root.querySelector('.pbar');
  bar.querySelectorAll('[data-act]').forEach(b => { const act = b.dataset.act; b.onclick = e => { e.stopPropagation(); onAction(act, b, e); }; });
  bindBarHover();
}
function bindBarHover() {
  root.querySelectorAll('.pbar .pf-app').forEach(b => b.onmouseenter = () => previewProfile(b.dataset.key));
  const pbar = root.querySelector('.pbar'); if (pbar) pbar.onmouseleave = () => previewProfile(null);
}
function renderAddPanel(d) {
  const have = new Set(deviceProfiles(d).flatMap(p => p.match.map(m => m.toLowerCase())));
  const apps = (S.apps || []).filter(a => a.name && !/logimx|notlogi/i.test(a.wm_class || a.id || '')).slice().sort((a, b) => a.name.localeCompare(b.name));
  const icon = a => { const u = icons.byId[a.id]; return u ? `<img src="${u}" alt="">` : `<span class="pf-letter" style="background:${colorFor(a.name)}">${esc(a.name.charAt(0).toUpperCase())}</span>`; };
  const rows = apps.map(a => {
    const added = have.has((a.wm_class || a.id || '').toLowerCase());
    return `<button class="act add-app ${(S.addSel || []).includes(a.id) ? 'on' : ''} ${added ? 'added' : ''}" data-act="add-pick" data-key="${esc(a.id)}" data-name="${esc(a.name.toLowerCase())}" ${added ? 'disabled' : ''}><span class="ic app-ic" data-icon="${esc(a.id)}">${icon(a)}</span><span class="t">${esc(a.name)}</span>${added ? '<span class="m">Added</span>' : ''}<i class="fa-solid fa-check chk"></i></button>`;
  }).join('');
  return `<div class="drawer-wrap"><div class="dlg drawer bl-panel add-panel" data-stop>
    <div class="dlg-head"><span class="dh-key">Add application</span><span class="dh-sub">${esc(d.name)}</span></div>
    <div class="dlg-body">
      <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input class="text add-q" placeholder="Search applications" value=""></div>
      <div class="acts"><button class="act on" disabled><span class="ic app-ic"><i class="fa-solid fa-globe"></i></span><span class="t">Global settings</span><span class="m">Every application</span><i class="fa-solid fa-check chk"></i></button></div>
      <div class="kg-t" style="margin:14px 0 6px">Applications</div>
      <div class="acts add-list">${rows || '<div class="row hint">No applications found</div>'}</div>
    </div>
    <div class="dlg-foot"><span></span><div class="r"><button class="btn primary" data-act="add-confirm" ${(S.addSel || []).length ? '' : 'disabled'}><i class="fa-solid fa-plus"></i>${addLabel()}</button></div></div>
  </div></div>`;
}

export const provide = { profileIcon, profileBar, allProfiles, pageApps, colorFor, pageAppDetail, refreshBar, bindBarHover, renderAddPanel, icons };
