// View model: the action ring being edited: which profile and folder are open, which slot is
// picked, and saving them (the shapes themselves are in shared/ring.mjs).
import * as Ring from '../../shared/ring.mjs';
import { RING_DIRS, eight, isFolderSlot, newRingId } from '../../shared/ring.mjs';

// from the rest of the window, filled in by link()
let S, actionIcon, api, assignPicked, changed, dev, deviceProfiles, drawerUp, fx, presetLabel, prompt, setGeneral, toast;
export function link(ctx) { ({ S, actionIcon, api, assignPicked, changed, dev, deviceProfiles, drawerUp, fx, presetLabel, prompt, setGeneral, toast } = ctx); }

// the screen state this view model owns: the ring's folder open ([i]) and the next drawing's animation
export const state = {
  ringPath: undefined, ringAnim: undefined,
};

// The ring keeps several sets of eight actions (profiles); one is in use. Older settings had a
// single list of slots, which becomes the first profile. The shapes live in shared/ring.mjs.
const ringState = () => Ring.ringState(S.general);
// with an application picked in the profile bar the ring edited is that application's own (the
// global one until something is changed); inside a folder, the folder's eight
const ringApp = () => S.editProfile && S.editProfile !== 'default' ? S.editProfile : null;
// what the ring view shows: the app hovered in the bar, else the one being edited
const ringViewApp = () => S.previewProfile ? (S.previewProfile === 'default' ? null : S.previewProfile) : ringApp();
const appRing = Ring.appRing;
const ringTop = (r, view) => Ring.ringTop(r, view ? ringViewApp() : ringApp());
const ringFolder = top => Ring.folderAt(top, (S.ringPath || [])[0]);
const ringSlots = view => { const top = ringTop(ringState(), view), f = ringFolder(top); return eight(f ? f.action.slots : top); };
async function saveRing(patch) {
  await setGeneral({ ring: Ring.finishRing(Object.assign(ringState(), patch)) });
}
function saveRingSlots(slots) {
  const r = ringState();
  return saveRing(Ring.withSlots(r, ringApp(), (S.ringPath || [])[0], slots, ringAppName, ringAppMatch));
}
const ringAppName = key => { const k = key || ringViewApp(), prof = k && deviceProfiles(dev()).find(x => x.key === k); return prof ? prof.name : k; };
const ringAppMatch = k => { const prof = deviceProfiles(dev()).find(x => x.key === k); return prof && prof.match.length ? prof.match : [k]; };
// which ring an app uses, in words
const ringUseName = Ring.ringUseName;
const ringInserting = ins => drawerUp() && S.picker.section === 'ring' && S.picker.insert === ins;
// the panel waits to add a new action at one end of the open folder's row
const ringSelectAdd = (ins = 'end') => { const p = S.picker; if (!p || p.section !== 'ring') return; p.insert = ins; p.cid = null; p.label = 'New action'; p.current = null; p.sel = null; p.selKey = null; };
// the folder's name, top-left on its page: saved as the slot's label
async function saveFolderName(name) {
  const i = (S.ringPath || [])[0]; if (i == null) return;
  name = (name || '').trim() || 'New folder';
  const path = S.ringPath; S.ringPath = [];
  const slots = ringSlots(), f = slots[i];
  if (isFolderSlot(f)) { slots[i] = Object.assign({}, f, { label: name, action: Object.assign({}, f.action, { label: name }) }); await saveRingSlots(slots); }
  S.ringPath = path;
}
// the panel turns to a place in the open ring or folder
const ringSelect = i => { const p = S.picker; if (!p || p.section !== 'ring') return; p.insert = null; p.cid = i; p.label = (S.ringPath || []).length ? `Action ${i + 1}` : RING_DIRS[i]; p.current = (ringSlots()[i] || {}).action || null; p.sel = null; p.selKey = null; };
// a folder keeps the direction it sits in on the ring: its first action goes the same way, the
// next ones continue clockwise from there (the real ring draws them at those same directions)
// a folder's actions are an ordered list fanned out around the folder's direction: the first in
// that direction, the next a little counter-clockwise, then a little clockwise, and outward
// folders saved by direction (gaps before their last action) become fan lists, once
function ringTidyFolders() {
  const r = ringState();
  if (Ring.tidyFolders(r)) return saveRing({ profiles: r.profiles, apps: r.apps });
}
const ringEditing = i => drawerUp() && S.picker.section === 'ring' && !S.picker.insert && S.picker.cid === i;

// an action dropped on the ring: on an Add of a folder's row it goes in at that end, on a slot it
// takes the slot, and the panel shows that slot
async function dropOnRing(i, ins, a) {
  if (ins) { S.picker.insert = ins; return assignPicked(a); }
  const slots = ringSlots();
  slots[i] = { action: a, label: presetLabel(a), icon: actionIcon(a) };
  await saveRingSlots(slots);
  const p = S.picker; p.cid = i; p.label = RING_DIRS[i]; p.current = a; p.sel = null; p.selKey = null;
  changed(); toast(`Slot ${i + 1}: ${presetLabel(a)}`);
}
// whether this computer can set monitor brightness yet (ddcutil and I2C access), asked once
function brightnessStatus() {
  if (S.briStatus === undefined) { S.briStatus = null; api.host.briStatus().then(st => { S.briStatus = st; if (!st.ok) changed(); }).catch(() => {}); }
  return S.briStatus;
}
// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'ring-test': async (it, e, d, key) => { api.host.ringShow(); return; },
  'ring-size': async (it, e, d, key) => { await saveRing({ size: key }); changed(); return; },
  'folder-rename': async (it, e, d, key) => { fx.focus('.folder-name', { select: true }); return; },
  'rs-parent': async (it, e, d, key) => {
    const i = Number(key), open = (S.ringPath || [])[0];
    S.ringPath = []; S.menu = null;
    if (i !== open && isFolderSlot(ringSlots()[i])) { S.ringPath = [i]; S.ringAnim = { kind: 'in', from: i }; ringSelectAdd(); }
    else ringSelect(i);
    changed(); return;
  },
  'rs-menu': async (it, e, d, key) => { S.menu = S.menu === 'rs:' + key ? null : 'rs:' + key; changed(); return; },
  'rs-folder': async (it, e, d, key) => {
    const i = Number(key); S.menu = null;
    const slots = ringSlots(), had = slots[i];
    // the slot becomes a folder; an action already there moves inside as its first one
    slots[i] = { action: { type: 'folder', label: 'New folder', slots: had && !isFolderSlot(had) ? [had] : [] }, label: 'New folder', icon: 'fa-folder' };
    await saveRingSlots(slots);
    S.ringPath = [i]; S.ringAnim = { kind: 'in', from: i }; ringSelectAdd(); changed();
    fx.focus('.folder-name', { delay: 180, select: true });
    return;
  },
  'rs-open': async (it, e, d, key) => { S.menu = null; S.ringPath = [Number(key)]; S.ringAnim = { kind: 'in', from: Number(key) }; ringSelectAdd(); changed(); return; },
  'rs-clear': async (it, e, d, key) => { S.menu = null; const slots = ringSlots(); slots[Number(key)] = null; await saveRingSlots(slots); ringSelect(Number(key)); changed(); return; },
  'rp-use': async (it, e, d, key) => {
    const r = ringState(), k = ringApp(); S.ringPath = [];
    if (key === '#own') return;
    if (k) { if (!key) delete r.apps[k]; else r.apps[k] = { profile: key, match: ringAppMatch(k) }; await saveRing({ apps: r.apps }); }
    else { const i = r.profiles.findIndex(p => p.id === key); if (i < 0) return; await saveRing({ active: i }); }
    if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null;
    changed(); return;
  },
  'rp-new': async (it, e, d, key) => {
    prompt('New ring profile', [{ key: 'name', label: 'Name', placeholder: 'Work, Editing, Gaming…' }], async v => {
      const r = ringState(), k = ringApp(), id = newRingId(), name = (v.name || '').trim() || `Profile ${r.profiles.length + 1}`;
      r.profiles.push({ id, name, slots: [] });
      if (k) { r.apps[k] = { profile: id, match: ringAppMatch(k) }; await saveRing({ profiles: r.profiles, apps: r.apps }); }
      else await saveRing({ profiles: r.profiles, active: r.profiles.length - 1 });
      S.ringPath = [];
      // a blank ring with its first slot open: actions can be dragged onto any slot
      if (S.picker && S.picker.section === 'ring') { S.picker.cid = 0; S.picker.label = RING_DIRS[0]; S.picker.current = null; }
      toast(`"${name}" is a blank ring: drag actions onto it`); changed();
    }, 'Create');
    return;
  },
  'rp-rename': async (it, e, d, key) => {
    const r0 = ringState(), pr = r0.profiles.find(p => p.id === key); if (!pr) return;
    prompt('Rename ring profile', [{ key: 'name', label: 'Name', value: pr.name }], async v => {
      const name = (v.name || '').trim(); if (!name) return changed();
      const r = ringState(), t = r.profiles.find(p => p.id === key); if (t) t.name = name; await saveRing({ profiles: r.profiles }); changed();
    }, 'Rename');
    return;
  },
  'rp-delete': async (it, e, d, key) => {
    const r = ringState(); if (r.profiles.length < 2) return;
    const i = r.profiles.findIndex(p => p.id === key); if (i < 0) return;
    const gone = r.profiles.splice(i, 1)[0];
    for (const [ak, av] of Object.entries(r.apps)) if (av && av.profile === gone.id) delete r.apps[ak];   // its apps go back to the global ring
    await saveRing({ profiles: r.profiles, apps: r.apps, active: Math.min(r.active > i ? r.active - 1 : r.active, r.profiles.length - 1) });
    S.ringPath = []; if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null;
    toast(`Profile "${gone.name}" deleted`); changed(); return;
  },
  'ring-app-use': async (it, e, d, key) => {
    const r = ringState(), k = ringApp(); S.menu = null; if (!k || key === '#own') return changed();
    if (!key) delete r.apps[k]; else r.apps[k] = { profile: key, match: ringAppMatch(k) };
    S.ringPath = []; await saveRing({ apps: r.apps });
    if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null;
    toast(`${ringAppName(k)} uses ${ringUseName(ringState(), k)}`); changed(); return;
  },
  'ring-app-new': async (it, e, d, key) => {
    const k = ringApp(); S.menu = null; if (!k) return changed();
    prompt('New blank ring profile', [{ key: 'name', label: 'Name', value: ringAppName(k), placeholder: 'Work, Remote desktop…' }], async v => {
      const r = ringState(), name = (v.name || '').trim() || ringAppName(k), id = newRingId();
      r.profiles.push({ id, name, slots: [] }); r.apps[k] = { profile: id, match: ringAppMatch(k) };
      S.ringPath = []; await saveRing({ profiles: r.profiles, apps: r.apps });
      if (S.picker && S.picker.section === 'ring') S.picker.current = null;
      toast(`${ringAppName(k)} uses the new profile "${name}"`); changed();
    }, 'Create');
    return;
  },
  'bri-setup': async (it, e, d, key) => {
    toast('Setting up monitor brightness…');
    const r = await api.host.briSetup();
    S.briStatus = await api.host.briStatus().catch(() => null);
    toast(r && r.ok ? (S.briStatus && S.briStatus.ok ? 'Monitor brightness is ready' : 'Set up; this monitor does not answer brightness requests') : (r && r.error) || 'Failed', !(r && r.ok));
    changed(); return;
  },
  'ring-up': async (it, e, d, key) => { const i = (S.ringPath || [])[0]; S.ringPath = []; if (S.picker && S.picker.section === 'ring') { S.picker.cid = i; S.picker.label = RING_DIRS[i]; S.picker.current = (ringSlots()[i] || {}).action || null; } changed(); return; },
  'ring-app-drop': async (it, e, d, key) => { const r = ringState(); delete r.apps[ringApp()]; S.ringPath = []; await saveRing({ apps: r.apps }); if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null; toast('Uses the global ring'); changed(); return; },
  'ring-travel': async (it, e, d, key) => { await saveRing({ travel: Number(it.value) }); return; },
  'ring-free': async (it, e, d, key) => { await saveRing({ free_pointer: !it.on }); changed(); return; },
  'ring-profile': async (it, e, d, key) => { S.ringPath = []; await saveRing({ active: Number(key) }); S.menu = null; if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null; changed(); return; },
  'ring-profile-add': async (it, e, d, key) => { S.menu = null; prompt('New ring profile', [{ key: 'name', label: 'Name', placeholder: 'Work, Editing, Gaming…' }], async v => { const r = ringState(); const name = (v.name || '').trim() || `Profile ${r.profiles.length + 1}`; r.profiles.push({ name, slots: [] }); await saveRing({ profiles: r.profiles, active: r.profiles.length - 1 }); toast(`Profile "${name}" added`); changed(); }, 'Create'); return; },
  'ring-profile-copy': async (it, e, d, key) => { const r = ringState(); const src = r.profiles[r.active]; r.profiles.push({ name: src.name + ' copy', slots: JSON.parse(JSON.stringify(src.slots)) }); await saveRing({ profiles: r.profiles, active: r.profiles.length - 1 }); toast('Profile duplicated'); changed(); return; },
  'ring-profile-rename': async (it, e, d, key) => { const r = ringState(); prompt('Rename ring profile', [{ key: 'name', label: 'Name', value: r.profiles[r.active].name }], async v => { const name = (v.name || '').trim(); if (!name) return changed(); const n = ringState(); n.profiles[n.active].name = name; await saveRing({ profiles: n.profiles }); changed(); }, 'Rename'); return; },
  'ring-profile-delete': async (it, e, d, key) => {
    S.menu = null; const r = ringState(); if (r.profiles.length < 2) return; const gone = r.profiles.splice(r.active, 1)[0];
    for (const [ak, av] of Object.entries(r.apps)) if (av && av.profile === gone.id) delete r.apps[ak];
    await saveRing({ profiles: r.profiles, apps: r.apps, active: Math.max(0, r.active - 1) }); toast(`Profile "${gone.name}" deleted`); changed(); return;
  },
  'ring-clear': async (it, e, d, key) => { await saveRingSlots([]); toast('Slots cleared'); changed(); return; },
};

export const provide = { ringState, ringApp, ringViewApp, appRing, ringTop, ringFolder, ringSlots, saveRing, saveRingSlots, ringAppName, ringAppMatch, ringUseName, ringInserting, ringSelectAdd, saveFolderName, ringSelect, ringTidyFolders, ringEditing, dropOnRing, brightnessStatus };
