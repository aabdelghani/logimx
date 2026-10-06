// Flow, as Logitech does it: the same mouse (and keyboard) is paired with each computer on its own
// Easy-Switch channel. NotLogi on each computer finds the others on the local network; when the
// pointer is pushed against the screen edge that faces another computer, this one hands it the
// clipboard and switches the mouse (and the keyboard, when linked) to that computer's channel.
//
// On the network, on port 24871:
//   UDP  hello     every NotLogi with Flow announces itself (name, channels, whether it is searching)
//   TCP  pair      two computers searching at once pair: the one with the smaller id sends a new
//                  shared key, which signs everything they send each other afterwards
//   TCP  switch    "the devices are coming to you", with the clipboard
const { app, ipcMain, clipboard, screen } = require('electron');
const { execFileSync } = require('child_process');
const dgram = require('dgram');
const net = require('net');
const crypto = require('crypto');
const os = require('os');
const state = require('./main/state');

const PORT = 24871;
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };
const SEARCH_MS = 60000;            // how long a search lasts, as in Options+
const ONLINE_MS = 12000;            // a computer not heard from for this long is away
const MAX_CLIP = 8 * 1024 * 1024;   // clipboard images larger than this are not sent

let win = null;                     // the settings window, told when anything changes
let getUi = null, setUi = null;     // the window's settings file, where Flow keeps its own part
let rpc = null;                     // the agent: switching a device's channel
let udp = null, tcp = null;
let searching = false, searchTimer = null, helloTimer = null, edgeTimer = null;
const seen = new Map();             // id → { ip, name, os, searching, channels, at }
let lastError = '';
// what Flow did and why, in flow.log next to the settings (kept short), for finding out why a switch
// did or did not happen
let logPath = null;
function log(...a) {
  const line = `${new Date().toISOString().slice(11, 23)} ${a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
  try {
    if (!logPath) logPath = require('path').join(app.getPath('userData'), 'flow.log');
    const fs = require('fs');
    try { if (fs.statSync(logPath).size > 512 * 1024) fs.renameSync(logPath, logPath + '.1'); } catch (e) {}
    fs.appendFileSync(logPath, line);
  } catch (e) {}
}

// ----------------------------------------------------------------- settings
// this computer's name as people know it: the Mac's computer name, else the host name
function computerName() {
  if (process.platform === 'darwin') { try { return execFileSync('scutil', ['--get', 'ComputerName'], { timeout: 1500 }).toString().trim(); } catch (e) {} }
  return (os.hostname() || 'computer').replace(/\.local$/, '');
}
function cfg() {
  const ui = getUi ? getUi() : {};
  const f = ui.flow || {};
  let changed = false;
  const c = {
    id: f.id || (changed = true, crypto.randomBytes(8).toString('hex')),
    enabled: f.enabled !== false,
    clipboard: f.clipboard !== false,
    keyboard: f.keyboard !== false,
    edge: f.edge !== false,
    // computers paired before: { id, name, os, key, pos, channels }; older entries without a key
    // (from the Deskflow version) are left out
    peers: (Array.isArray(f.peers) ? f.peers : []).filter(p => p && p.id && p.key),
    channels: f.channels || {},      // serial → { host, kind, name }: where each device is on this computer
  };
  if (changed) save(c);
  return c;
}
function save(c) { if (setUi) setUi({ flow: c }); }
function patchCfg(p) { const c = Object.assign(cfg(), p); save(c); return c; }

// ----------------------------------------------------------------- devices
const devices = () => (state.devices || []).filter(d => d && d.serial);
// remember the channel each device is on while it is connected here: the other computers switch
// it to this one through that channel
function learnChannels() {
  const c = cfg(); let changed = false;
  for (const d of devices()) {
    if (d.online === false) continue;
    const host = ((d.state || {}).hosts || {}).current;
    if (typeof host !== 'number') continue;
    const cur = c.channels[d.serial];
    if (!cur || cur.host !== host || cur.name !== d.name) { c.channels[d.serial] = { host, kind: d.kind, name: d.name }; changed = true; }
  }
  if (changed) { save(c); hello(); }
  return c.channels;
}
// the channel a device uses to reach a computer, and where that came from: set by hand on this
// computer, as that computer reported it, else its name in the device's own list of hosts (a name
// listed on more than one channel: the one the mouse uses for that computer, else the first)
function channelInfo(d, peer) {
  const man = (peer.manual || {})[d.serial];
  if (typeof man === 'number') return { host: man, from: 'manual' };
  const ch = (peer.channels || {})[d.serial];
  if (ch && typeof ch.host === 'number') return { host: ch.host, from: 'reported' };
  const norm = s => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();
  const want = norm(peer.name);
  const names = (((d.state || {}).hosts || {}).names) || [];
  const hits = names.filter(h => h.name && (norm(h.name) === want || want.startsWith(norm(h.name)) || norm(h.name).startsWith(want))).map(h => h.index);
  if (!hits.length) return { host: null, from: null };
  if (hits.length > 1 && d.kind !== 'mouse') {
    const mouse = devices().find(x => x.kind === 'mouse' && x.serial !== d.serial);
    const m = mouse ? channelInfo(mouse, peer).host : null;
    if (m !== null && hits.includes(m)) return { host: m, from: 'name' };
  }
  return { host: hits[0], from: 'name' };
}
const channelFor = (d, peer) => channelInfo(d, peer).host;

// ----------------------------------------------------------------- network
function lanAddrs() {
  const skip = /^(docker|virbr|br-|veth|vmnet|tun|tap|utun|awdl|llw|vEthernet|VirtualBox|VMware|Hyper-V|Loopback|Bluetooth)/i;
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) out.push(a);
  }
  return out;
}
function broadcastOf(a) {
  const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
  return ip.map((b, i) => (b & mask[i]) | (~mask[i] & 255)).join('.');
}
function hello() {
  if (!udp) return;
  const c = cfg();
  if (!c.enabled && !searching) return;
  const msg = Buffer.from(JSON.stringify({ app: 'notlogi-flow', v: 1, id: c.id, name: computerName(), os: process.platform, searching, channels: c.channels }));
  const targets = new Set(lanAddrs().map(broadcastOf).concat('255.255.255.255'));
  for (const t of targets) udp.send(msg, PORT, t, () => {});
}
function onHello(buf, rinfo) {
  let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
  const c = cfg();
  if (!m || m.app !== 'notlogi-flow' || !m.id || m.id === c.id) return;
  seen.set(m.id, { ip: rinfo.address, name: String(m.name || '').slice(0, 64), os: m.os, searching: !!m.searching, channels: m.channels || {}, at: Date.now() });
  // a paired computer: its address and channels as they are now
  const p = c.peers.find(x => x.id === m.id);
  if (p) {
    const ch = JSON.stringify(m.channels || {});
    if (p.name !== m.name || JSON.stringify(p.channels || {}) !== ch) { p.name = m.name; p.channels = m.channels || {}; save(c); }
  } else if (searching && m.searching && c.id < m.id) { log('pairing with', m.name, rinfo.address); pair(m.id); }   // both searching: the smaller id asks
  notify();
}

// one JSON message each way over a short TCP connection
function sendTo(ip, obj, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: ip, port: PORT });
    let buf = '';
    const done = (err, v) => { clearTimeout(timer); s.destroy(); err ? reject(err) : resolve(v); };
    const timer = setTimeout(() => done(new Error('timeout')), timeout);
    s.on('connect', () => s.write(JSON.stringify(obj) + '\n'));
    s.on('data', d => { buf += d; const i = buf.indexOf('\n'); if (i >= 0) { try { done(null, JSON.parse(buf.slice(0, i))); } catch (e) { done(e); } } });
    s.on('error', e => done(e));
  });
}
// messages between paired computers carry a signature made with their shared key
const sign = (key, body) => crypto.createHmac('sha256', Buffer.from(key, 'hex')).update(body).digest('hex');
function sealed(peer, msg) {
  const body = JSON.stringify(Object.assign({ from: cfg().id, ts: Date.now() }, msg));
  return { body, sig: sign(peer.key, body) };
}
function opened(env) {
  if (!env || typeof env.body !== 'string') return null;
  let m; try { m = JSON.parse(env.body); } catch (e) { return null; }
  const peer = cfg().peers.find(p => p.id === m.from);
  if (!peer || Math.abs(Date.now() - m.ts) > 60000) return null;
  const want = sign(peer.key, env.body);
  if (!env.sig || env.sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(env.sig), Buffer.from(want))) return null;
  return { m, peer };
}
async function onMessage(msg, ip) {
  if (msg && msg.t === 'pair') {
    // only while this computer is searching too, so nothing pairs without both people asking
    if (!searching || !msg.id || msg.id === cfg().id || !/^[0-9a-f]{64}$/.test(msg.key || '')) return { ok: false };
    addPeer({ id: msg.id, name: msg.name, os: msg.os, key: msg.key, channels: msg.channels || {} }, 'left');
    const c = cfg();
    return { ok: true, id: c.id, name: computerName(), os: process.platform, channels: c.channels };
  }
  const o = opened(msg);
  if (!o) return { ok: false };
  const { m, peer } = o;
  const s = seen.get(peer.id); if (s) s.ip = ip;
  if (m.t === 'clip') {
    if (m.clip && cfg().clipboard) writeClip(m.clip);
    log('clipboard from', peer.name, m.clip ? (m.clip.text ? 'text' : 'image') : 'nothing');
    return { ok: true };
  }
  if (m.t === 'switch') {
    log('switch from', peer.name, ip, m.edge || '', typeof m.pos === 'number' ? m.pos.toFixed(2) : '');
    arrived();
    if (OPPOSITE[m.edge] && typeof m.pos === 'number') enterAt(OPPOSITE[m.edge], Math.max(0, Math.min(1, m.pos)));
    // the devices are on their way: the agent looks for them every 150 ms meanwhile
    if (rpc) rpc('expect_device', { ms: 6000 }).catch(() => {});
    // older versions still send the clipboard with the switch
    if (m.clip && cfg().clipboard) writeClip(m.clip);
    return { ok: true };
  }
  if (m.t === 'unpair') { removePeer(peer.id, true); return { ok: true }; }
  return { ok: false };
}
function listen() {
  udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('message', onHello);
  udp.on('error', e => { lastError = String(e.message || e); });
  udp.bind(PORT, () => { try { udp.setBroadcast(true); } catch (e) {} });
  tcp = net.createServer(s => {
    let buf = '';
    s.setTimeout(5000, () => s.destroy());
    s.on('data', async d => {
      buf += d;
      if (buf.length > MAX_CLIP * 2) return s.destroy();
      const i = buf.indexOf('\n'); if (i < 0) return;
      let msg; try { msg = JSON.parse(buf.slice(0, i)); } catch (e) { return s.destroy(); }
      let reply = { ok: false };
      try { reply = await onMessage(msg, (s.remoteAddress || '').replace(/^::ffff:/, '')); } catch (e) {}
      s.end(JSON.stringify(reply) + '\n');
    });
    s.on('error', () => {});
  });
  tcp.on('error', e => { lastError = String(e.message || e); });
  tcp.listen(PORT);
}

// ----------------------------------------------------------------- pairing
function addPeer(p, pos) {
  const c = cfg();
  if (p.id === c.id) return;   // never this computer itself
  const old = c.peers.find(x => x.id === p.id);
  const peer = Object.assign({ pos: old ? old.pos : pos }, old || {}, p);
  c.peers = c.peers.filter(x => x.id !== p.id).concat(peer);
  c.enabled = true;
  save(c);
  if (searching) stopSearch(true);
  send('flow-event', { type: 'paired', name: peer.name });
  notify();
  watchEdges();
}
async function pair(id) {
  const s = seen.get(id); if (!s) return;
  const c = cfg();
  const key = crypto.randomBytes(32).toString('hex');
  try {
    const r = await sendTo(s.ip, { t: 'pair', id: c.id, name: computerName(), os: process.platform, key, channels: c.channels });
    if (r && r.ok && r.id === id) addPeer({ id, name: r.name || s.name, os: r.os, key, channels: r.channels || {} }, 'right');
  } catch (e) { lastError = String(e.message || e); }
}
function removePeer(id, quiet) {
  const c = cfg();
  const p = c.peers.find(x => x.id === id);
  c.peers = c.peers.filter(x => x.id !== id);
  save(c);
  if (p && !quiet) { const s = seen.get(id); if (s) sendTo(s.ip, sealed(p, { t: 'unpair' })).catch(() => {}); }
  notify();
}
function startSearch() {
  searching = true;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { stopSearch(); send('flow-event', { type: 'search-timeout' }); }, SEARCH_MS);
  learnChannels();
  hello();
  // someone already searching: the smaller id asks now
  const c = cfg();
  for (const [id, s] of seen) if (s.searching && Date.now() - s.at < 3000 && c.id < id && !c.peers.some(p => p.id === id)) pair(id);
  schedule();
  notify();
}
function stopSearch() { searching = false; clearTimeout(searchTimer); schedule(); notify(); }
// announce every second while searching, every few seconds otherwise (so the others list it)
function schedule() {
  clearInterval(helloTimer);
  const c = cfg();
  if (!searching && !c.enabled) return;
  helloTimer = setInterval(() => { learnChannels(); hello(); notify(true); }, searching ? 1000 : 4000);
}

// ----------------------------------------------------------------- switching
// the pointer brought in on this computer's edge facing the other one, at the same place along it
// (a few pixels inside, so it does not count as reaching that edge), before the mouse even arrives
function enterAt(edge, pos) {
  try {
    const all = screen.getAllDisplays();
    const pick = { left: (a, b) => a.bounds.x <= b.bounds.x, right: (a, b) => a.bounds.x + a.bounds.width >= b.bounds.x + b.bounds.width,
      up: (a, b) => a.bounds.y <= b.bounds.y, down: (a, b) => a.bounds.y + a.bounds.height >= b.bounds.y + b.bounds.height }[edge];
    const d = all.reduce((a, b) => (pick(a, b) ? a : b));
    const b = d.bounds, k = process.platform === 'linux' ? (d.scaleFactor || 1) : 1;
    const x = edge === 'left' ? b.x + 3 : edge === 'right' ? b.x + b.width - 4 : b.x + pos * b.width;
    const y = edge === 'up' ? b.y + 3 : edge === 'down' ? b.y + b.height - 4 : b.y + pos * b.height;
    if (rpc) rpc('warp_pointer', { x: Math.round(x * k), y: Math.round(y * k) }).then(() => log('pointer in at', edge, Math.round(x), Math.round(y))).catch(() => {});
  } catch (e) {}
}

function readClip() {
  try {
    const text = clipboard.readText();
    if (text) return { text };
    const img = clipboard.readImage();
    if (img && !img.isEmpty()) { const png = img.toPNG(); if (png.length <= MAX_CLIP) return { png: png.toString('base64') }; }
  } catch (e) {}
  return null;
}
function writeClip(clip) {
  try {
    if (typeof clip.text === 'string') clipboard.writeText(clip.text);
    else if (typeof clip.png === 'string') { const { nativeImage } = require('electron'); clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(clip.png, 'base64'))); }
  } catch (e) {}
}
const online = p => { const s = seen.get(p.id); return !!(s && Date.now() - s.at < ONLINE_MS); };
// the devices that go along: a shared mouse connected here, and keyboards too when linked
function travellers(peer) {
  const c = cfg();
  return devices().filter(d => d.online !== false && (d.kind === 'mouse' || (c.keyboard && d.kind === 'keyboard')) && channelFor(d, peer) !== null);
}
let switching = false, coolUntil = 0;
async function switchTo(peer, edge, pos) {
  if (switching || Date.now() < coolUntil) return;
  const devs = travellers(peer);
  log('edge: switching to', peer.name, devs.map(d => `${d.name} -> channel ${channelFor(d, peer) + 1}`));
  if (!devs.some(d => d.kind === 'mouse')) { lastError = `the mouse has no channel for ${peer.name}`; log(lastError); notify(); return; }
  switching = true;
  try {
    const s = seen.get(peer.id);
    // the other computer first (it takes the clipboard); if it does not answer, stay here
    const r = await sendTo(s.ip, sealed(peer, { t: 'switch', edge, pos }), 1200);
    if (!r || !r.ok) throw new Error('not accepted');
    log(peer.name, 'accepted');
    // the mouse last, so the keyboard is already there when the pointer arrives
    for (const d of devs.sort((a, b) => (a.kind === 'mouse') - (b.kind === 'mouse'))) {
      try { await rpc('change_host', { id: d.id, host: channelFor(d, peer) }); log('switched', d.name, 'to channel', channelFor(d, peer) + 1); } catch (e) { log('change_host failed', d.name, String(e.message || e)); }
    }
    lastError = '';
    // the clipboard follows, so a large image never holds the switch up
    if (cfg().clipboard) { const clip = readClip(); if (clip) sendTo(s.ip, sealed(peer, { t: 'clip', clip }), 8000).catch(e => log('clipboard not sent', String(e.message || e))); }
  } catch (e) { lastError = `${peer.name} did not answer`; log(lastError, String(e.message || e), (seen.get(peer.id) || {}).ip); }
  switching = false; coolUntil = Date.now() + 1000;
  notify();
}
// the pointer pushed against an edge of its screen that no other screen continues past (with
// screens of different sizes, the edge of the main screen can be inside the desktop's outline)
let atEdge = null, edgeSince = 0, loggedEdge = 0;
// within margin pixels of an outer screen edge (the same edges edgeOf counts)
function nearEdge(pt, margin) {
  const all = screen.getAllDisplays().map(d => d.bounds);
  const b = all.find(r => pt.x >= r.x && pt.x < r.x + r.width && pt.y >= r.y && pt.y < r.y + r.height);
  if (!b) return true;
  const beyond = (x, y) => all.some(r => r !== b && x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  return (pt.x < b.x + margin && !beyond(b.x - 1, pt.y)) || (pt.x > b.x + b.width - 1 - margin && !beyond(b.x + b.width, pt.y)) ||
    (pt.y < b.y + margin && !beyond(pt.x, b.y - 1)) || (pt.y > b.y + b.height - 1 - margin && !beyond(pt.x, b.y + b.height));
}
function edgeOf(pt) {
  const all = screen.getAllDisplays().map(d => d.bounds);
  const b = all.find(r => pt.x >= r.x && pt.x < r.x + r.width && pt.y >= r.y && pt.y < r.y + r.height);
  if (!b) return null;
  const beyond = (x, y) => all.some(r => r !== b && x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  if (pt.x <= b.x && !beyond(b.x - 1, pt.y)) return 'left';
  if (pt.x >= b.x + b.width - 1 && !beyond(b.x + b.width, pt.y)) return 'right';
  if (pt.y <= b.y && !beyond(pt.x, b.y - 1)) return 'up';
  if (pt.y >= b.y + b.height - 1 && !beyond(pt.x, b.y + b.height)) return 'down';
  return null;
}
// the pointer's place: on Linux from the agent (X11), as Electron's own reading there goes stale
// while the pointer is over other programs' windows; elsewhere Electron's
async function pointer() {
  if (process.platform === 'linux' && rpc) {
    try {
      const p = await rpc('pointer', {});
      if (p && typeof p.x === 'number') { const k = screen.getPrimaryDisplay().scaleFactor || 1; return { x: Math.round(p.x / k), y: Math.round(p.y / k) }; }
    } catch (e) {}
  }
  return screen.getCursorScreenPoint();
}
let nearLogged = 0, ticking = false, leftEdge = true, quietUntil = 0, mouseHere = false;
const REARM_PX = 24;
// devices arriving here: the pointer is still read where it last was (often the edge it left by,
// facing the computer it came from), so no edge counts until the pointer has moved off it, and
// none for a quarter second in any case; otherwise the devices bounce straight back
function arrived() { leftEdge = false; quietUntil = Date.now() + 250; atEdge = null; }
async function edgeTick() {
  if (ticking) return;
  ticking = true;
  try { await edgeCheck(); } finally { ticking = false; }
}
async function edgeCheck() {
  const c = cfg();
  if (!c.enabled || !c.edge || !c.peers.length) return;
  const here = devices().some(d => d.kind === 'mouse' && d.online !== false);
  if (here && !mouseHere) { arrived(); log('mouse arrived'); }
  mouseHere = here;
  if (!here) {   // the mouse is elsewhere
    if (Date.now() - nearLogged > 5000) { nearLogged = Date.now(); log('no mouse connected here', (state.devices || []).map(d => `${d.name} ${d.kind} online=${d.online} serial=${d.serial || '-'}`)); }
    return;
  }
  const pt = await pointer(), side = edgeOf(pt);
  // after a switch or an arrival, the pointer moves well inside (deeper than where it is brought
  // in) before an edge counts again: a pointer still at the edge, or wobbling a pixel off it, must not
  // send the devices straight back
  if (!leftEdge || Date.now() < quietUntil) { if (!nearEdge(pt, REARM_PX)) leftEdge = true; return; }
  if (!side && Date.now() - nearLogged > 30000) {
    const b = screen.getDisplayNearestPoint(pt).bounds;
    if (pt.x - b.x < 3 || b.x + b.width - pt.x < 4 || pt.y - b.y < 3 || b.y + b.height - pt.y < 4) { nearLogged = Date.now(); log('near an edge, not counted', pt, b); }
  }
  // the switch fires the moment the pointer hits the edge, as in Options+
  if (side !== atEdge) { atEdge = side; edgeSince = Date.now(); if (side) log('at', side, 'edge', pt); }
  if (!side) return;
  const peer = c.peers.find(p => p.pos === side && online(p));
  if (peer) {
    // where along the edge the pointer left, for the other computer to bring it in at the same place
    const b = screen.getDisplayNearestPoint(pt).bounds;
    const pos = side === 'left' || side === 'right' ? (pt.y - b.y) / b.height : (pt.x - b.x) / b.width;
    atEdge = null; leftEdge = false; switchTo(peer, side, Math.max(0, Math.min(1, pos)));
  }
  else if (edgeSince !== loggedEdge) { loggedEdge = edgeSince; log('edge', side, 'reached: no computer online on that side', c.peers.map(p => `${p.name} ${p.pos} ${online(p) ? 'online' : 'away'}`)); }
}
function watchEdges() {
  clearInterval(edgeTimer);
  const c = cfg();
  const on = c.enabled && c.edge && c.peers.length > 0;
  if (on) edgeTimer = setInterval(() => { edgeTick().catch(e => { if (Date.now() - nearLogged > 5000) { nearLogged = Date.now(); log('edge check failed', String(e.stack || e)); } }); }, 16);
  log('edge watch', on ? 'on' : 'off', { enabled: c.enabled, edge: c.edge, peers: c.peers.length });
}

// ----------------------------------------------------------------- the window
function info() {
  const c = cfg();
  const addr = lanAddrs()[0];
  return {
    id: c.id, name: computerName(), ip: addr ? addr.address : '', enabled: c.enabled, clipboard: c.clipboard, keyboard: c.keyboard, edge: c.edge,
    searching, error: lastError,
    peers: c.peers.map(p => ({ id: p.id, name: p.name, os: p.os, pos: p.pos, online: online(p),
      devices: devices().filter(d => d.kind === 'mouse' || d.kind === 'keyboard').map(d => { const ci = channelInfo(d, p); return { serial: d.serial, name: d.name, kind: d.kind, host: ci.host, from: ci.from, count: (((d.state || {}).hosts || {}).count) || 3 }; }) })),
    // NotLogi on other computers of this network, not paired yet; searching ones can be connected
    nearby: [...seen].filter(([id, x]) => !c.peers.some(p => p.id === id) && Date.now() - x.at < ONLINE_MS)
      .map(([id, x]) => ({ id, name: x.name, os: x.os, searching: x.searching && Date.now() - x.at < 3000 })),
  };
}
let lastInfo = '';
function notify(onlyIfChanged) {
  const i = info(), s = JSON.stringify(i);
  if (onlyIfChanged && s === lastInfo) return;
  lastInfo = s;
  send('flow-event', { type: 'info', info: i });
}
function send(ch, msg) { try { if (win && !win.isDestroyed()) win.webContents.send(ch, msg); } catch (e) {} }

function init(opts) {
  win = opts.win; getUi = opts.getUi; setUi = opts.setUi; rpc = opts.rpc;
  log('start', computerName(), process.platform, 'peers', cfg().peers.map(p => `${p.name} ${p.pos}`));
  try { log('screens', screen.getAllDisplays().map(d => d.bounds)); } catch (e) {}
  listen();
  learnChannels();
  schedule();
  watchEdges();
  hello();
  ipcMain.handle('flow-info', () => info());
  ipcMain.handle('flow-search', (_e, on) => { on ? startSearch() : stopSearch(); return info(); });
  ipcMain.handle('flow-config', (_e, patch) => {
    const p = {};
    for (const k of ['enabled', 'clipboard', 'keyboard', 'edge']) if (patch && typeof patch[k] === 'boolean') p[k] = patch[k];
    const c = patchCfg(p);
    if (patch && patch.id && patch.channel && patch.channel.serial) {
      const peer = c.peers.find(x => x.id === patch.id);
      if (peer) {
        peer.manual = Object.assign({}, peer.manual);
        const h = patch.channel.host;
        if (typeof h === 'number' && h >= 0 && h < 6) peer.manual[patch.channel.serial] = h; else delete peer.manual[patch.channel.serial];
        save(c);
      }
    }
    if (patch && patch.pos && patch.id) {
      const peer = c.peers.find(x => x.id === patch.id);
      if (peer && OPPOSITE[patch.pos]) {
        const other = c.peers.find(x => x !== peer && x.pos === patch.pos);
        if (other) other.pos = peer.pos;   // the side was taken: the two swap
        peer.pos = patch.pos; save(c);
      }
    }
    schedule(); watchEdges(); notify();
    return info();
  });
  ipcMain.handle('flow-remove', (_e, id) => { removePeer(id); schedule(); watchEdges(); return info(); });
  // connecting a computer seen on the network: it pairs while that one is searching too
  ipcMain.handle('flow-connect', async (_e, id) => {
    const s = seen.get(id);
    if (!s || !s.searching) return info();
    if (!searching) startSearch();
    if (cfg().id < id) await pair(id);   // otherwise it asks this one, which is searching now
    return info();
  });
  // computers on the network show up even while Flow is not set up
  setInterval(() => notify(true), 3000);
}
function setWindow(w) { win = w; }
function shutdown() {
  clearInterval(helloTimer); clearInterval(edgeTimer); clearTimeout(searchTimer);
  try { udp && udp.close(); } catch (e) {}
  try { tcp && tcp.close(); } catch (e) {}
}

module.exports = { init, setWindow, shutdown };
