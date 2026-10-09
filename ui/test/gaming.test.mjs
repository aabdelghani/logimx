import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Gaming from '../renderer/view/gaming.js';
import * as Core from '../renderer/vm/core.js';
import { dpiFromPos, posFromDpi } from '../shared/dpi.mjs';

// the gaming pages drawn for a PRO X3 SUPERSTRIKE with nothing but its saved settings (no device here)
const html = { card: b => `<card>${b}</card>`, sec: (t, b, note = '') => `<sec title="${t}" note="${note}">${b}</sec>`,
  row: (l, s, c) => `<row>${l}|${s}|${c}</row>`, sw: (on, a) => `<sw ${a} ${on ? 'on' : ''}>`, range: (a, v, lo, hi, step) => `<range ${a} value="${v}" min="${lo}" max="${hi}" step="${step}">` };
const x3 = (settings = {}) => ({ id: '40be', name: 'PRO X3 SUPERSTRIKE', kind: 'mouse', state: {}, controls: [80, 81, 82, 83, 86].map(cid => ({ cid })), config: { settings } });
Gaming.link(Object.assign({ wheelSettings: () => '<wheel>' }, html));

test('a PRO X3 SUPERSTRIKE is a gaming mouse with G HUB\'s pages, an MX mouse is not', () => {
  Core.link({ S: { devices: [] }, changed() {}, fx: {} });
  assert.equal(Core.provide.isGaming(x3()), true);
  assert.equal(Core.provide.isGaming({ id: 'b042' }), false);
  assert.deepEqual(Core.provide.devicePages(x3()), ['dpi', 'assignments', 'wheel', 'hits', 'info']);
  assert.deepEqual(Core.provide.navPages(x3()), ['dpi', 'assignments', 'wheel', 'hits']);
});

test('Sensitivity: five DPI slots with their values, the active one marked, both report rates', () => {
  const h = Gaming.provide.pageDpi(x3({ dpi_slots: { 0: 400, 1: 800, 2: 1600 }, dpi_active: 2, report_rate: 4000 }));
  assert.equal((h.match(/data-path="dpi_slots\.\d"/g) || []).length, 5);
  assert.match(h, new RegExp(`data-path="dpi_slots\\.2" data-out="dpi2" value="${posFromDpi(1600)}" min="0" max="1000"`));
  assert.match(h, /dpi-slot on[^>]*>[^]*?data-val="2"/);           // slot 3 is the one in use
  assert.match(h, /data-path="report_rate" data-val="4000">4000/);   // wireless, chosen
  assert.match(h, /data-path="report_rate_wired"/);
  assert.match(h, /once its report rate feature is mapped/);       // nothing reported by the mouse yet
});

test('HITS: actuation 1..10, rapid trigger off by default and its sensitivity only when on, haptics 0..5', () => {
  let h = Gaming.provide.pageHits(x3());
  assert.match(h, /data-path="hits\.actuation" data-out="hact" value="5" min="1" max="10"/);
  assert.match(h, /data-path="hits\.rapid_trigger_on" >/);          // the switch, off
  assert.doesNotMatch(h, /hits\.rapid_trigger"/);                    // no sensitivity slider while off
  assert.match(h, /data-path="hits\.haptics" data-out="hhap" value="3" min="0" max="5"/);
  h = Gaming.provide.pageHits(x3({ hits: { rapid_trigger_on: true, rapid_trigger: 4 } }));
  assert.match(h, /data-path="hits\.rapid_trigger" data-out="hrt" value="4" min="1" max="5"/);
  assert.match(h, /data-act="hits-reset"/);
});

test('Scroll wheel: BHOP with its time in 100 ms steps when the mouse has it, a plain note when it has nothing', () => {
  assert.match(Gaming.provide.pageWheel(x3()), /Nothing to set/);
  const off = x3(); off.state = { bunny_hop: { enabled: false, timeout: null } };
  let h = Gaming.provide.pageWheel(off);
  assert.match(h, /data-path="bunny_hop\.enabled" >/);
  assert.doesNotMatch(h, /bunny_hop\.timeout/);
  const on = x3({ bunny_hop: { enabled: true, timeout: 300 } }); on.state = { bunny_hop: { enabled: false } };
  h = Gaming.provide.pageWheel(on);
  assert.match(h, /data-path="bunny_hop\.timeout" data-out="bhop" value="300" min="100" max="1000" step="100"/);
  const mx = x3(); mx.state = { hires: {} };
  assert.equal(Gaming.provide.pageWheel(mx), '<wheel>');
});

test('with the mouse connected: its own slot list and sensor DPI, only the rates it offers, no "kept" notes', () => {
  const d = x3({ dpi_active: 0 });
  d.state = { dpi: { dpi: 800, slots: [800, 1200, 1600, 2400, 3200], levels: [100, 48000, 50] },
    report_rate: { report_rate: 1000, report_rate_wired: 1000, wireless: [125, 250, 500, 1000], wired: [125, 250, 500, 1000, 2000, 4000, 8000] },
    hits: { buttons: [{ actuation: 2, rapid_trigger: 3, rapid_trigger_on: true, haptics: 3 }] } };
  d.transport = 'lightspeed';
  let h = Gaming.provide.pageDpi(d);
  assert.match(h, new RegExp(`data-path="dpi_slots\\.1" data-out="dpi1" value="${posFromDpi(1200)}" min="0" max="1000"`));
  assert.match(h, /The sensor is at 800 DPI/);
  assert.doesNotMatch(h, /data-path="report_rate" data-val="2000"/);   // not offered wirelessly
  assert.match(h, /data-path="report_rate_wired" data-val="8000"/);
  assert.match(h, /In use now/);
  assert.doesNotMatch(h, /once its report rate feature is mapped/);
  h = Gaming.provide.pageHits(d);                                      // the values the mouse holds
  assert.match(h, /data-path="hits\.actuation" data-out="hact" value="2"/);
  assert.match(h, /data-path="hits\.rapid_trigger" data-out="hrt" value="3"/);
  assert.doesNotMatch(h, /once its HITS feature is mapped/);
});

test('the DPI slider runs on a log scale and comes back to the value it shows', () => {
  assert.equal(dpiFromPos(0), 100);
  assert.equal(dpiFromPos(1000), 48000);
  for (const v of [400, 800, 1200, 1600, 3200, 6400, 26000]) assert.ok(Math.abs(dpiFromPos(posFromDpi(v)) - v) / v < 0.01, `${v}`);
  assert.ok(posFromDpi(3200) > 500);   // the everyday values get more than half the slider
});
