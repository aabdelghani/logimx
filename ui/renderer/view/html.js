// View: the small pieces every page is drawn from (rows, cards, switches, sliders), as HTML text.
import { t } from '../../shared/i18n.mjs';
import { dpiFromPos } from '../../shared/dpi.mjs';

// from the rest of the window, filled in by link()
let actionIcon, dev, presetLabel;
export function link(ctx) { ({ actionIcon, dev, presetLabel } = ctx); }

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------ helpers
const sw = (on, attrs = '') => `<button class="switch ${on ? 'on' : ''}" ${attrs}></button>`;
// a check box that toggles like a switch (same 'on' class, same handlers)
const chk = (on, attrs = '') => `<button class="chk ${on ? 'on' : ''}" ${attrs}><i class="fa-solid fa-check"></i></button>`;
const sec = (title, body, meta = '') => `<div class="sec"><div class="sec-title"><span>${esc(title)}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</div>${body}</div>`;
const card = rows => `<div class="card">${rows}</div>`;
const row = (label, sub, right, cls = '') => `<div class="row ${cls}"><div class="grow"><div class="lbl">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${right}</div>`;
const drop = (a, attrs = '') => `<button class="drop" ${attrs}><i class="fa-solid ic ${actionIcon(a)}"></i>${esc(presetLabel(a))}<i class="fa-solid fa-chevron-down chev"></i></button>`;
const range = (attrs, val, min, max, step) => `<input type="range" ${attrs} min="${min}" max="${max}" step="${step}" value="${val}" style="width:160px">`;
function fmtOut(k, v) { if (k === 'pf') { const f = (((dev() || {}).state || {}).force || [])[0]; return f ? Math.round((v - f.min) * 100 / Math.max(1, f.max - f.min)) + '%' : String(v); } if (k === 'pspeed' || k === 'sst' || k === 'dpi' || k === 'tws') return String(v); if (k === 'thr') return v + '%'; if (k === 'bhop') return v + ' ms'; if (/^dpi\d$/.test(k)) { const [lo, hi] = (((dev() || {}).state || {}).dpi || {}).levels || [100, 48000]; return String(dpiFromPos(v, lo, hi)); } if (k === 'wsp') return Number(Number(v).toFixed(2)) + '×'; if (k === 'bld') return v >= 60 ? (v % 60 ? t('{m} min {s} s', { m: Math.floor(v / 60), s: v % 60 }) : t('{m} min', { m: Math.floor(v / 60) })) : t('{s} s', { s: v }); if (k === 'dur') return t('{s} s', { s: (v / 1000).toFixed(1) }); return String(v); }

export const provide = { esc, sw, chk, sec, card, row, drop, range, fmtOut };
