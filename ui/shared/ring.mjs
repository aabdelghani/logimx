// The action ring's settings, without any window: which ring an application gets, its slots and
// folders, and the shape saved back to the agent. Used by the settings window and the main process
// (which opens the real ring), so both read a ring the same way.
import { en, t } from './i18n.mjs';

// shown only, never saved (the main process does not use them)
export const RING_DIRS = [t('Top'), t('Top right'), t('Right'), t('Bottom right'), t('Bottom'), t('Bottom left'), t('Left'), t('Top left')];
// the labels below and the default profile names are saved in the config: they stay English here
// and are translated where they are shown
export const RING_NEXT_PROFILE = { type: 'ring_profile', label: en('Next ring profile') };
export const RING_BRIGHTNESS = { type: 'brightness_dial', label: en('Brightness (drag to set)') };

// a slot saved by an earlier build with the ring's own key instead of its action
export const fixSlot = sl => sl && sl.action === 'ring:profile' ? { action: RING_NEXT_PROFILE, label: en('Next ring profile'), icon: 'fa-layer-group' } : sl;
export const eight = a => Array.from({ length: 8 }, (_, i) => fixSlot((a || [])[i]) || null);

// general.ring as the settings window edits it: the shared profiles, the one in use, the apps
// pointing at them and the ring's own behaviour
export function ringState(general) {
  const r = (general && general.ring) || {};
  const profiles = Array.isArray(r.profiles) && r.profiles.length ? r.profiles.map((p, i) => ({ id: p.id || 'p' + i, name: p.name || en('Profile'), slots: eight(p.slots) })) : [{ id: 'p0', name: en('Default'), slots: eight(r.slots) }];
  const active = Math.max(0, Math.min(profiles.length - 1, Number(r.active) || 0));
  const apps = r.apps && typeof r.apps === 'object' ? JSON.parse(JSON.stringify(r.apps)) : {};
  return { profiles, active, apps, size: r.size || 'medium', travel: r.travel || 30, free_pointer: !!r.free_pointer };
}

export const newRingId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// Ring profiles are one list shared by everything: an application points at one of them (or follows
// the global one); an older build's own copy of slots still counts as the app's ring
export const appRing = (r, k) => {
  const a = k && r.apps[k]; if (!a) return null;
  if (a.profile) { const i = r.profiles.findIndex(p => p.id === a.profile); return i >= 0 ? { i } : null; }
  return Array.isArray(a.slots) ? { legacy: true } : null;
};
// the eight slots an application key edits (none: the profile in use)
export const ringTop = (r, k) => {
  const ar = appRing(r, k);
  return eight(ar ? (ar.legacy ? r.apps[k].slots : r.profiles[ar.i].slots) : r.profiles[r.active].slots);
};
// which ring an app uses, in words
export const ringUseName = (r, k) => { const ar = appRing(r, k); return !ar ? 'the global ring' : ar.legacy ? 'its own ring' : r.profiles[ar.i].name; };

export const isFolderSlot = sl => !!(sl && sl.action && sl.action.type === 'folder');
// the folder open at the top-level index i, if that slot is one
export const folderAt = (top, i) => { const f = i != null ? top[i] : null; return isFolderSlot(f) ? f : null; };

// The ring for the application in front, as the real ring opens it: one set up for it (its window
// class contains one of the app's match strings, as profiles match), else the ring profile in use.
// Works on general.ring as saved, not ringState, so slots keep their saved length.
export function ringForApp(rs, appClass) {
  rs = rs || {};
  const app = (appClass || '').toLowerCase();
  for (const [k, v] of Object.entries(rs.apps || {})) {
    if (!v) continue;
    // an app points at one of the shared ring profiles; an older build kept its own slots
    const prof = v.profile && Array.isArray(rs.profiles) ? rs.profiles.find(p => p.id === v.profile) : null;
    const slots = prof ? prof.slots : v.slots;
    if (!Array.isArray(slots)) continue;
    const match = Array.isArray(v.match) && v.match.length ? v.match : [k];
    if (app && match.some(m => m && app.includes(String(m).toLowerCase()))) return { slots, app: k, name: prof && prof.name };
  }
  const prof = Array.isArray(rs.profiles) && rs.profiles.length ? rs.profiles[Math.max(0, Math.min(rs.profiles.length - 1, rs.active || 0))] : null;
  return { slots: (prof && prof.slots) || rs.slots || [], name: prof && prof.name };
}

// a slot by its place: [i] on the ring, [i, j] inside the folder at i
export function slotAt(slots, path) {
  let list = slots || [], slot = null;
  for (let k = 0; k < path.length; k++) {
    slot = list[path[k]];
    if (!slot) return null;
    if (k < path.length - 1) list = (slot.action && slot.action.slots) || [];
  }
  return slot;
}

// what is saved: the edited state with the active profile in range, and the active profile's slots
// at the top too, which is what the overlay of an older build reads
export function finishRing(r) {
  r.active = Math.max(0, Math.min(r.profiles.length - 1, r.active));
  r.slots = r.profiles[r.active].slots;
  return r;
}

// The ring with one level of slots replaced: the top-level eight of the profile an app key edits,
// or, with a folder open at index `folder`, that folder's list (stored without gaps, in order).
// An app still on the global ring gets its own profile, copied from the global one and named by
// appName(k), matching appMatch(k). Returns the fields to save.
export function withSlots(r, k, folder, slots, appName, appMatch) {
  let top = ringTop(r, k);
  const f = folderAt(top, folder);
  if (f) top[folder] = Object.assign({}, f, { action: Object.assign({}, f.action, { slots: slots.filter(Boolean) }) }); else top = slots;
  if (k) {
    const ar = appRing(r, k);
    if (ar && !ar.legacy) { r.profiles[ar.i].slots = top; return { profiles: r.profiles }; }
    if (ar) { r.apps[k].slots = top; return { apps: r.apps }; }
    const id = newRingId();
    r.profiles.push({ id, name: appName(k), slots: top });
    r.apps[k] = { profile: id, match: appMatch(k) };
    return { profiles: r.profiles, apps: r.apps };
  }
  r.profiles[r.active].slots = top;
  return { profiles: r.profiles };
}

// Folders saved by an older build kept their actions by direction, with gaps; now a folder's
// actions are an ordered list. Compacts them in place and says whether anything changed.
export function tidyFolders(r) {
  let changed = false;
  const tidy = list => (list || []).forEach(sl => {
    if (!isFolderSlot(sl)) return;
    const items = (sl.action.slots || []).filter(Boolean), had = sl.action.slots || [];
    if (had.length && had.slice(0, items.length).some(x => !x)) { sl.action.slots = items; changed = true; }
  });
  r.profiles.forEach(p => tidy(p.slots));
  Object.values(r.apps).forEach(a => a && Array.isArray(a.slots) && tidy(a.slots));
  return changed;
}
