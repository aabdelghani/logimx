import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eight, fixSlot, ringState, appRing, ringTop, ringUseName, folderAt, ringForApp, slotAt, finishRing, withSlots, tidyFolders, RING_NEXT_PROFILE } from '../shared/ring.mjs';

const A = (action, label = action) => ({ action, label });
const folder = (label, slots) => ({ action: { type: 'folder', label, slots }, label, icon: 'fa-folder' });

const general = () => ({ ring: {
  profiles: [{ id: 'p0', name: 'Default', slots: [A('overview'), A('play_pause')] }, { id: 'r1', name: 'Writer', slots: [A('undo'), folder('Edit', [A('copy'), A('paste')])] }],
  active: 0,
  apps: { 'libreoffice-writer': { profile: 'r1', match: ['libreoffice-writer', 'soffice'] }, old: { slots: [A('lock')] } },
} });

test('eight pads to eight slots and upgrades the old next-profile key', () => {
  const s = eight([A('x'), { action: 'ring:profile' }]);
  assert.equal(s.length, 8);
  assert.deepEqual(s[1].action, RING_NEXT_PROFILE);
  assert.equal(s[7], null);
  assert.equal(fixSlot(null), null);
});

test('ringState fills in defaults and falls back to the old single ring', () => {
  const r = ringState({ ring: { slots: [A('lock')], active: 9 } });
  assert.equal(r.profiles.length, 1);
  assert.equal(r.profiles[0].name, 'Default');
  assert.equal(r.profiles[0].slots[0].action, 'lock');
  assert.equal(r.active, 0);
  assert.equal(r.size, 'medium');
  assert.equal(r.travel, 30);
  assert.equal(ringState(undefined).profiles[0].slots.length, 8);
});

test('ringState copies apps so edits do not reach the saved settings', () => {
  const g = general(), r = ringState(g);
  r.apps.old.slots.push(A('y'));
  assert.equal(g.ring.apps.old.slots.length, 1);
});

test('appRing and ringTop: shared profile, older own slots, global', () => {
  const r = ringState(general());
  assert.deepEqual(appRing(r, 'libreoffice-writer'), { i: 1 });
  assert.deepEqual(appRing(r, 'old'), { legacy: true });
  assert.equal(appRing(r, 'nothing'), null);
  assert.equal(ringTop(r, 'libreoffice-writer')[0].action, 'undo');
  assert.equal(ringTop(r, 'old')[0].action, 'lock');
  assert.equal(ringTop(r, null)[0].action, 'overview');
  assert.equal(ringUseName(r, 'libreoffice-writer'), 'Writer');
  assert.equal(ringUseName(r, 'old'), 'its own ring');
  assert.equal(ringUseName(r, null), 'the global ring');
});

test('folderAt only answers for folder slots', () => {
  const top = ringTop(ringState(general()), 'libreoffice-writer');
  assert.equal(folderAt(top, 1).label, 'Edit');
  assert.equal(folderAt(top, 0), null);
  assert.equal(folderAt(top, undefined), null);
});

test('ringForApp matches the window class against the app match strings', () => {
  const rs = general().ring;
  assert.equal(ringForApp(rs, 'soffice.bin').app, 'libreoffice-writer');
  assert.equal(ringForApp(rs, 'Soffice').name, 'Writer');
  assert.equal(ringForApp(rs, 'old-app').app, 'old');            // no match list: the key itself
  assert.equal(ringForApp(rs, 'firefox').name, 'Default');
  assert.equal(ringForApp(rs, '').slots[0].action, 'overview');
  assert.deepEqual(ringForApp({ slots: [A('z')] }, 'x').slots, [A('z')]);
  assert.deepEqual(ringForApp(undefined, 'x').slots, []);
});

test('slotAt walks into folders', () => {
  const slots = general().ring.profiles[1].slots;
  assert.equal(slotAt(slots, [0]).action, 'undo');
  assert.equal(slotAt(slots, [1, 1]).action, 'paste');
  assert.equal(slotAt(slots, [1, 5]), null);
  assert.equal(slotAt(slots, [6, 0]), null);
});

test('finishRing keeps the active profile in range and mirrors its slots', () => {
  const r = finishRing(Object.assign(ringState(general()), { active: 5 }));
  assert.equal(r.active, 1);
  assert.equal(r.slots, r.profiles[1].slots);
});

test('withSlots: the profile in use, a shared app profile, an old app ring', () => {
  let r = ringState(general());
  assert.deepEqual(Object.keys(withSlots(r, null, null, eight([A('lock')]))), ['profiles']);
  assert.equal(r.profiles[0].slots[0].action, 'lock');
  r = ringState(general());
  withSlots(r, 'libreoffice-writer', null, eight([A('redo')]));
  assert.equal(r.profiles[1].slots[0].action, 'redo');
  r = ringState(general());
  assert.deepEqual(Object.keys(withSlots(r, 'old', null, eight([A('calc')]))), ['apps']);
  assert.equal(r.apps.old.slots[0].action, 'calc');
});

test('withSlots inside a folder stores its actions in order without gaps', () => {
  const r = ringState(general());
  withSlots(r, 'libreoffice-writer', 1, [A('cut'), null, A('copy')]);
  assert.deepEqual(r.profiles[1].slots[1].action.slots.map(s => s.action), ['cut', 'copy']);
  assert.equal(r.profiles[1].slots[1].label, 'Edit');
});

test('withSlots gives an app on the global ring its own profile', () => {
  const r = ringState(general());
  const patch = withSlots(r, 'gimp', null, eight([A('zoom_in')]), k => 'GIMP', k => ['gimp-2']);
  assert.deepEqual(Object.keys(patch).sort(), ['apps', 'profiles']);
  const made = r.profiles[r.profiles.length - 1];
  assert.equal(made.name, 'GIMP');
  assert.deepEqual(r.apps.gimp, { profile: made.id, match: ['gimp-2'] });
  assert.equal(made.slots[0].action, 'zoom_in');
});

test('tidyFolders compacts folders kept by direction', () => {
  const r = ringState({ ring: { profiles: [{ id: 'p0', slots: [folder('F', [null, A('a'), null, A('b')])] }] } });
  assert.equal(tidyFolders(r), true);
  assert.deepEqual(r.profiles[0].slots[0].action.slots.map(s => s.action), ['a', 'b']);
  assert.equal(tidyFolders(r), false);
});
