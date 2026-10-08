import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
const L = createRequire(import.meta.url)('../main/flow-logic.js');

const KEY = 'ab'.repeat(32), OTHER = 'cd'.repeat(32);
const mac = { id: 'mac1', name: "Ahmed's MacBook Pro", key: KEY };

test('a signed message from a paired computer opens; a changed body, a wrong key or a stranger does not', () => {
  const now = 1_000_000;
  const env = L.seal('mac1', mac, { t: 'switch', edge: 'left', pos: 0.5 }, now);
  const o = L.open(env, [mac], now + 10);
  assert.ok(o);
  assert.equal(o.peer.id, 'mac1');
  assert.equal(o.m.t, 'switch');
  assert.equal(o.m.pos, 0.5);
  assert.equal(L.open({ body: env.body.replace('0.5', '0.9'), sig: env.sig }, [mac], now), null);
  assert.equal(L.open(L.seal('mac1', { key: OTHER }, { t: 'switch' }, now), [mac], now), null);
  assert.equal(L.open(L.seal('pc9', mac, { t: 'switch' }, now), [mac], now), null);
  assert.equal(L.open({ body: env.body }, [mac], now), null);
  assert.equal(L.open({ body: '{not json', sig: env.sig }, [mac], now), null);
  assert.equal(L.open(null, [mac], now), null);
});

test('a signed message older or newer than a minute is refused (no replaying old switches)', () => {
  const env = L.seal('mac1', mac, { t: 'switch' }, 0);
  assert.ok(L.open(env, [mac], L.MAX_AGE_MS));
  assert.equal(L.open(env, [mac], L.MAX_AGE_MS + 1), null);
  assert.equal(L.open(L.seal('mac1', mac, { t: 'switch' }, 120000), [mac], 0), null);
});

test('pairing is taken only while searching, from another computer, with a full key', () => {
  const ok = { id: 'mac1', key: KEY };
  assert.equal(L.pairAllowed(ok, { searching: true, selfId: 'pc1' }), true);
  assert.equal(L.pairAllowed(ok, { searching: false, selfId: 'pc1' }), false);
  assert.equal(L.pairAllowed(ok, { searching: true, selfId: 'mac1' }), false);
  assert.equal(L.pairAllowed({ id: 'mac1', key: 'abc' }, { searching: true, selfId: 'pc1' }), false);
  assert.equal(L.pairAllowed({ key: KEY }, { searching: true, selfId: 'pc1' }), false);
});

// a 800 px screen on the left and the main 1920x1080 screen starting at x 801, lower than it
const screens = [{ x: 0, y: 200, width: 801, height: 600 }, { x: 801, y: 0, width: 1920, height: 1080 }];

test('the edges that count are the outer ones: not where one screen continues into the next', () => {
  assert.equal(L.edgeOf({ x: 0, y: 500 }, screens), 'left');
  assert.equal(L.edgeOf({ x: 2720, y: 500 }, screens), 'right');
  assert.equal(L.edgeOf({ x: 1500, y: 0 }, screens), 'up');
  assert.equal(L.edgeOf({ x: 1500, y: 1079 }, screens), 'down');
  assert.equal(L.edgeOf({ x: 801, y: 500 }, screens), null);   // the main screen's left edge leads to the other screen
  assert.equal(L.edgeOf({ x: 801, y: 100 }, screens), 'left');  // above the small screen, nothing continues
  assert.equal(L.edgeOf({ x: 1500, y: 500 }, screens), null);
  assert.equal(L.edgeOf({ x: -50, y: 500 }, screens), null);   // off every screen
});

test('after a switch, no edge counts until the pointer has moved well inside and a quarter second has passed', () => {
  const r = new L.Rearm(24, 250);
  assert.equal(r.ready({ x: 2720, y: 500 }, screens, 0), true);
  r.fired();
  assert.equal(r.ready({ x: 2720, y: 500 }, screens, 10), false);   // still at the edge
  assert.equal(r.ready({ x: 2705, y: 500 }, screens, 20), false);   // a wobble off it
  assert.equal(r.ready({ x: 2600, y: 500 }, screens, 30), false);   // well inside: armed for the next reading
  assert.equal(r.ready({ x: 2720, y: 500 }, screens, 40), true);
  r.arrived(1000);
  assert.equal(r.ready({ x: 1500, y: 500 }, screens, 1100), false); // inside, but within the quiet time
  assert.equal(r.ready({ x: 1500, y: 500 }, screens, 1300), true);
});

test('a device reaches a computer on the channel set by hand, else the one reported, else by the host name', () => {
  const mouse = { serial: 'M1', kind: 'mouse', state: { hosts: { names: [{ index: 0, name: 'q-pc' }, { index: 2, name: "Ahmed's MacBook Pro" }] } } };
  assert.deepEqual(L.channelInfo(mouse, Object.assign({}, mac, { manual: { M1: 1 } })), { host: 1, from: 'manual' });
  assert.deepEqual(L.channelInfo(mouse, Object.assign({}, mac, { channels: { M1: { host: 2 } } })), { host: 2, from: 'reported' });
  assert.deepEqual(L.channelInfo(mouse, Object.assign({}, mac, { name: 'Ahmed’s MacBook Pro' })), { host: 2, from: 'name' });
  assert.deepEqual(L.channelInfo(mouse, Object.assign({}, mac, { name: 'Someone else' })), { host: null, from: null });
});

test('a keyboard with the computer on two channels follows the mouse', () => {
  const mouse = { serial: 'M1', kind: 'mouse', state: { hosts: { names: [{ index: 1, name: 'MacBook Pro' }] } } };
  const kbd = { serial: 'K1', kind: 'keyboard', state: { hosts: { names: [{ index: 0, name: 'MacBook Pro' }, { index: 1, name: 'MacBook Pro' }] } } };
  const peer = { id: 'mac1', name: 'MacBook Pro', key: KEY };
  assert.equal(L.channelInfo(kbd, peer, [mouse, kbd]).host, 1);
  assert.equal(L.channelInfo(kbd, peer, [kbd]).host, 0);
});
