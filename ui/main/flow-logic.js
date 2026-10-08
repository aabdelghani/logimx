// Flow's rules that need no Electron, network or devices, kept here so they can be tested: signing
// what paired computers send each other, who may pair, which screen edge the pointer is against,
// when an edge may count again after a switch, and which channel a device uses for a computer.
'use strict';
const crypto = require('crypto');

const MAX_AGE_MS = 60000;   // a signed message older (or newer) than this is refused

// ----------------------------------------------------------------- signed messages
// a message's signature: HMAC-SHA256 of its body with the key the two computers share
const sign = (key, body) => crypto.createHmac('sha256', Buffer.from(key, 'hex')).update(body).digest('hex');

// a message to a paired computer: the body says who sent it and when, and is signed with that pair's key
function seal(fromId, peer, msg, now = Date.now()) {
  const body = JSON.stringify(Object.assign({ from: fromId, ts: now }, msg));
  return { body, sig: sign(peer.key, body) };
}

// a message received: its body and sender when it comes from a paired computer, is signed with that
// computer's key and is recent; otherwise null
function open(env, peers, now = Date.now()) {
  if (!env || typeof env.body !== 'string' || typeof env.sig !== 'string') return null;
  let m;
  try { m = JSON.parse(env.body); } catch (e) { return null; }
  if (!m || typeof m !== 'object') return null;
  const peer = (peers || []).find(p => p.id === m.from);
  if (!peer || typeof m.ts !== 'number' || Math.abs(now - m.ts) > MAX_AGE_MS) return null;
  const want = sign(peer.key, env.body);
  if (env.sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(env.sig), Buffer.from(want))) return null;
  return { m, peer };
}

// a pairing request is taken only while this computer is searching too (so nothing pairs without
// both people asking), from another computer, with a 256-bit key
function pairAllowed(msg, { searching, selfId }) {
  return !!(searching && msg && msg.id && msg.id !== selfId && /^[0-9a-f]{64}$/.test(msg.key || ''));
}

// ----------------------------------------------------------------- screen edges
const inside = (r, x, y) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

// the edge of its screen the pointer is pushed against, when no other screen continues past it
// (with screens of different sizes, the edge of the main screen can be inside the desktop's outline)
function edgeOf(pt, screens) {
  const b = screens.find(r => inside(r, pt.x, pt.y));
  if (!b) return null;
  const beyond = (x, y) => screens.some(r => r !== b && inside(r, x, y));
  if (pt.x <= b.x && !beyond(b.x - 1, pt.y)) return 'left';
  if (pt.x >= b.x + b.width - 1 && !beyond(b.x + b.width, pt.y)) return 'right';
  if (pt.y <= b.y && !beyond(pt.x, b.y - 1)) return 'up';
  if (pt.y >= b.y + b.height - 1 && !beyond(pt.x, b.y + b.height)) return 'down';
  return null;
}

// within margin pixels of one of those outer edges (outside every screen counts as near)
function nearEdge(pt, margin, screens) {
  const b = screens.find(r => inside(r, pt.x, pt.y));
  if (!b) return true;
  const beyond = (x, y) => screens.some(r => r !== b && inside(r, x, y));
  return (pt.x < b.x + margin && !beyond(b.x - 1, pt.y)) || (pt.x > b.x + b.width - 1 - margin && !beyond(b.x + b.width, pt.y)) ||
    (pt.y < b.y + margin && !beyond(pt.x, b.y - 1)) || (pt.y > b.y + b.height - 1 - margin && !beyond(pt.x, b.y + b.height));
}

// After a switch, or when the devices arrive here, no edge counts until the pointer has moved well
// inside (deeper than where it is brought in), nor for a quarter second in any case: a pointer still at
// the edge, or wobbling a pixel off it, must not send the devices straight back.
class Rearm {
  constructor(px = 24, quietMs = 250) { this.px = px; this.quietMs = quietMs; this.left = true; this.quietUntil = 0; }
  arrived(now = Date.now()) { this.left = false; this.quietUntil = now + this.quietMs; }
  fired() { this.left = false; }
  // whether an edge may count for this reading; a reading well inside re-arms it for the next one
  ready(pt, screens, now = Date.now()) {
    if (this.left && now >= this.quietUntil) return true;
    if (!nearEdge(pt, this.px, screens)) this.left = true;
    return false;
  }
}

// ----------------------------------------------------------------- channels
// the channel a device uses to reach a computer, and where that came from: set by hand on this
// computer, as that computer reported it, else its name in the device's own list of hosts (a name
// listed on more than one channel: the one the mouse uses for that computer, else the first)
function channelInfo(d, peer, devices = []) {
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
    const mouse = devices.find(x => x.kind === 'mouse' && x.serial !== d.serial);
    const m = mouse ? channelInfo(mouse, peer, devices).host : null;
    if (m !== null && hits.includes(m)) return { host: m, from: 'name' };
  }
  return { host: hits[0], from: 'name' };
}

module.exports = { MAX_AGE_MS, sign, seal, open, pairAllowed, edgeOf, nearEdge, Rearm, channelInfo };
