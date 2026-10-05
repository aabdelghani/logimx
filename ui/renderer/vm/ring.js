// View model: the action ring being edited: which profile and folder are open, which slot is
// picked, and saving them (the shapes themselves are in shared/ring.mjs).
import * as Ring from '../../shared/ring.mjs';
import { eight, isFolderSlot, RING_DIRS } from '../../shared/ring.mjs';

// from the rest of the window, filled in by link()
let S, dev, deviceProfiles, drawerUp, setGeneral, view;
export function link(ctx) { ({ S, dev, deviceProfiles, drawerUp, setGeneral, view } = ctx); }

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

export const provide = { ringState, ringApp, ringViewApp, appRing, ringTop, ringFolder, ringSlots, saveRing, saveRingSlots, ringAppName, ringAppMatch, ringUseName, ringInserting, ringSelectAdd, saveFolderName, ringSelect, ringTidyFolders, ringEditing };
