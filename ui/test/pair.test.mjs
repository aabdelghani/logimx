import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Pair from '../renderer/vm/pair.js';

// a fake clock for the view model's timers (Node 18's mock timers are not reliable)
const real = { setTimeout, setInterval, clearTimeout, clearInterval };
let now = 0, timers = [], seq = 0;
function fakeTime() {
  now = 0; timers = [];
  globalThis.setTimeout = (fn, ms) => { const id = ++seq; timers.push({ id, fn, at: now + ms }); return id; };
  globalThis.setInterval = (fn, ms) => { const id = ++seq; timers.push({ id, fn, at: now + ms, every: ms }); return id; };
  globalThis.clearTimeout = globalThis.clearInterval = id => { timers = timers.filter(x => x.id !== id); };
}
function realTime() { Object.assign(globalThis, real); }
function advance(ms) {
  const end = now + ms;
  for (;;) {
    const next = timers.filter(x => x.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!next) break;
    now = next.at;
    if (next.every) next.at += next.every; else timers = timers.filter(x => x !== next);
    next.fn();
  }
  now = end;
}

// the pairing view model on a fake window: macOS (no in-app Bluetooth), the agent's calls recorded
function setup({ receivers = '', devices = [] } = {}) {
  const calls = [], host = [], went = [];
  const S = { dlg: null, menu: null, status: { receivers }, devices: devices.slice(), pair: { step: 1, found: [] } };
  const ctx = {
    IS_LINUX: () => false, S, changed: () => {}, toast: () => {},
    call: async (m, p) => { calls.push([m, p]); return true; },
    api: { host: { openBluetooth: () => host.push('openBluetooth'), btOpen: async () => {}, btClose: () => {} } },
    devicePages: () => ['buttons'], go: (page, id) => went.push([page, id]),
    isOffline: d => d.online === false,
  };
  Pair.link(ctx);
  const run = (act, key) => Pair.commands[act]({ data: { key }, on: false }, null, null, key);
  return { S, calls, host, went, run };
}

test('with no receiver plugged in, Bluetooth is chosen and the receiver cannot be', async () => {
  const w = setup();
  await w.run('pair');
  assert.equal(w.S.pair.via, 'bt');
  await w.run('pair-via', 'bolt');
  assert.equal(w.S.pair.via, 'bt');
  const r = setup({ receivers: 'Bolt receiver' });
  await r.run('pair');
  assert.equal(r.S.pair.via, 'bolt');
});

test('Bluetooth on macOS waits for the device, opens its page once it arrives, and stops looking', async () => {
  fakeTime();
  try {
    const w = setup({ devices: [{ id: 'b378', name: 'MX Keys S' }] });
    await w.run('pair');
    await w.run('pair-next');
    assert.equal(w.S.pair.step, 2);
    assert.ok(w.S.pair.sys);
    assert.deepEqual(w.host, ['openBluetooth']);
    assert.ok(w.calls.some(([m]) => m === 'expect_device'));
    // nothing new yet: back from the settings, still waiting
    Pair.provide.pairCheck();
    assert.equal(w.S.pair.step, 2);
    // after 30 s it says what usually stands in the way, and keeps waiting
    advance(30000);
    assert.equal(w.S.pair.sys.slow, true);
    // the mouse arrives
    w.S.devices.push({ id: 'b042', name: 'MX Master 4' });
    Pair.provide.pairCheck();
    assert.equal(w.S.pair.step, 3);
    assert.equal(w.S.pair.arrived, 'b042');
    advance(1600);
    assert.equal(w.S.dlg, null);
    assert.deepEqual(w.went, [['buttons', 'b042']]);
    // no more asking the agent to look
    const n = w.calls.length;
    advance(60000);
    assert.equal(w.calls.length, n);
  } finally { realTime(); }
});

test('a device that was there but not connected counts when it connects', async () => {
  const w = setup({ devices: [{ id: 'b042', name: 'MX Master 4', online: false }] });
  await w.run('pair'); await w.run('pair-next');
  w.S.devices[0] = { id: 'b042', name: 'MX Master 4' };
  Pair.provide.pairCheck();
  assert.equal(w.S.pair.arrived, 'b042');
  await w.run('pair-cancel');
});

test('Cancel stops the waiting', async () => {
  fakeTime();
  try {
    const w = setup();
    await w.run('pair'); await w.run('pair-next');
    await w.run('pair-cancel');
    assert.equal(w.S.dlg, null);
    const n = w.calls.filter(([m]) => m === 'expect_device').length;
    advance(60000);
    assert.equal(w.calls.filter(([m]) => m === 'expect_device').length, n);
  } finally { realTime(); }
});
