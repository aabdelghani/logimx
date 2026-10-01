// Action ring overlay: eight round buttons around the pointer, each with its label outside it
// and a small close button in the middle. Hover picks one, click or 1-8 runs it, Esc, the middle
// or a click outside closes. Held on a button that steers it (raw mode), the pointer is hidden
// and frozen and the mouse picks by direction: a nudge past DEAD chooses the button that way,
// the highlight is the only indicator, and letting go runs it.
(() => {
  const N = 8, RW = 560, RH = 460;   // the ring's own extent; the window is the whole screen
  let CX = RW / 2, CY = RH / 2;       // where the ring is centred, set per show
  const RR = 104, B = 28;          // ring radius to the bubble centres, bubble radius
  const NEAR = 38, FAR = 250;      // pointer mode: inside NEAR is the close button, beyond FAR is outside
  const GAIN = 1;
  let DEAD = 30, LIMIT = 60;       // travel before a button is chosen, and where the point saturates (set per show)
  const slotsEl = document.getElementById('slots'), hub = document.getElementById('hub');
  let slots = [], hover = -1, shownAt = 0, last = null, raw = false, vx = 0, vy = 0;
  let size = { w: RW, h: RH }, waiting = false, guess = null, openedAt = 0, told = false;
  // Wayland: the compositor may still move or resize the full-screen window just after it appears,
  // which shifts a ring drawn in window coordinates away from the pointer. For a short while after
  // opening, the ring follows the pointer it sees; each correction goes into the problem report.
  const SETTLE_MS = 350;
  let settleUntil = 0, settled = 0;
  // how this opening found the pointer, for the problem report
  const tell = (how, x, y) => { if (told) return; told = true; window.ring.diag({ how, ms: Math.round(performance.now() - openedAt), x: Math.round(x), y: Math.round(y), guess }); };
  // centre the ring on a point, kept fully on screen
  function centreAt(x, y, again) {
    CX = Math.max(RW / 2, Math.min(size.w - RW / 2, x)); CY = Math.max(RH / 2, Math.min(size.h - RH / 2, y));
    waiting = false;
    hub.style.left = CX + 'px'; hub.style.top = CY + 'px'; hub.style.display = '';
    slotsEl.classList.toggle('moved', !!again);   // a correction moves the ring without springing it out again
    build();
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ang = i => (i * 45 - 90) * Math.PI / 180;    // slot 0 at the top, clockwise
  function setRaw(on) { raw = on; document.body.classList.toggle('raw', on); if (!on) { vx = vy = 0; } }
  function build() {
    slotsEl.innerHTML = slots.map((s, i) => {
      const c = Math.cos(ang(i)), sn = Math.sin(ang(i));
      const bx = CX + RR * c, by = CY + RR * sn;
      // each button springs out from the middle, one after another around the ring
      const bub = `<div class="bub ${s ? '' : 'empty'}" data-i="${i}" style="left:${bx.toFixed(1)}px;top:${by.toFixed(1)}px;--a:${i * 45 - 90}deg;--i:${i};--dx:${(-RR * c).toFixed(0)}px;--dy:${(-RR * sn).toFixed(0)}px"><i class="fa-solid ${esc(s ? s.icon || 'fa-circle-dot' : 'fa-plus')}"></i></div>`;
      if (!s) return bub;
      // the label sits outside the bubble, growing away from the ring
      const lx = CX + (RR + B + 16) * c, ly = CY + (RR + B + 16) * sn;
      const tx = c > 0.3 ? '0' : c < -0.3 ? '-100%' : '-50%', ty = sn > 0.3 ? '0' : sn < -0.3 ? '-100%' : '-50%';
      return bub + `<div class="lab" data-i="${i}" style="left:${lx.toFixed(1)}px;top:${ly.toFixed(1)}px;transform:translate(${tx},${ty})">${esc(s.label)}</div>`;
    }).join('');
    setHover(-1);
  }
  function setHover(i) {
    if (i !== hover && i >= 0 && slots[i]) window.ring.hover(i);   // the mouse may answer with a tick
    hover = i;
    slotsEl.querySelectorAll('.bub, .lab').forEach(w => w.classList.toggle('on', Number(w.dataset.i) === i));
  }
  const wedge = (dx, dy) => Math.floor(((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360 + 22.5) % 360) / 45) % N;
  // pointer mode: which button is meant by (x, y); -1 on the close button or outside
  function at(x, y) {
    const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy);
    if (d < NEAR || d > FAR) return -1;
    return wedge(dx, dy);
  }
  document.addEventListener('mousemove', e => {
    if (waiting) { tell('pointer event', e.clientX, e.clientY); centreAt(e.clientX, e.clientY); settleUntil = performance.now() + SETTLE_MS; settled = 0; return; }   // first sight of the pointer: the ring goes there
    if (raw) return;
    if (performance.now() < settleUntil && hover < 0) {
      const dx = e.clientX - CX, dy = e.clientY - CY;
      if (Math.hypot(dx, dy) > 1 && Math.hypot(dx, dy) < 160) {
        centreAt(e.clientX, e.clientY, true);
        if (settled++ < 3) window.ring.diag({ how: 're-centred', ms: Math.round(performance.now() - openedAt), x: Math.round(e.clientX), y: Math.round(e.clientY), dx: Math.round(dx), dy: Math.round(dy) });
        return;
      }
    }
    last = [e.clientX, e.clientY];
    hub.classList.toggle('on', Math.hypot(e.clientX - CX, e.clientY - CY) < NEAR);
    const i = at(e.clientX, e.clientY); if (i !== hover) setHover(i);
  });
  document.addEventListener('mouseleave', () => { if (!raw) { setHover(-1); hub.classList.remove('on'); } });
  document.addEventListener('mousedown', e => {
    if (raw) { if (hover >= 0 && slots[hover]) window.ring.pick(hover); return; }   // a click while steering picks the highlighted button
    const i = at(e.clientX, e.clientY);
    if (i >= 0 && slots[i]) window.ring.pick(i); else window.ring.close();
  });
  // keys arrive from the main process (the window has no focus of its own); Esc is handled there
  window.ring.onKey(({ key }) => { const n = Number(key); if (n >= 1 && n <= N && slots[n - 1]) window.ring.pick(n - 1); });
  window.ring.onShow(msg => {
    // dressed like the desktop it opens on: its light or dark, its accent colour, its font
    const look = msg.look || {}, root = document.documentElement;
    root.dataset.theme = look.dark ? 'dark' : 'light';
    if (look.accent) { root.style.setProperty('--acc', look.accent); root.style.setProperty('--acc-fg', look.accentFg || '#fff'); }
    if (look.font) document.body.style.fontFamily = `"${look.font}", system-ui, sans-serif`;
    slots = Array.from({ length: N }, (_, i) => (msg.slots || [])[i] || null);
    shownAt = Date.now(); last = null; vx = vy = 0;
    DEAD = Math.max(5, Math.min(120, Number(msg.travel) || 30)); LIMIT = DEAD * 2;
    hub.classList.remove('on');
    setRaw(!!msg.raw);
    size = msg.size || { w: RW, h: RH }; guess = msg.guess || null; openedAt = performance.now(); told = false;
    settleUntil = 0;
    if (msg.at) { tell('known up front', msg.at.x, msg.at.y); centreAt(msg.at.x, msg.at.y); }
    else {
      // the pointer's place is not known here (Wayland): draw nothing until it is seen over the
      // window, and fall back to the best guess if it never moves
      waiting = true; slotsEl.innerHTML = ''; hub.style.display = 'none';
      setTimeout(() => { if (waiting) { const gx = guess ? guess.x : size.w / 2, gy = guess ? guess.y : size.h / 2; tell('fallback after 250 ms', gx, gy); centreAt(gx, gy); } }, 250);
    }
  });
  window.ring.onMove(({ dx, dy }) => {
    if (!raw) setRaw(true);
    vx += dx * GAIN; vy += dy * GAIN;
    const d = Math.hypot(vx, vy);
    if (d > LIMIT) { vx *= LIMIT / d; vy *= LIMIT / d; }   // never leaves the ring
    const i = Math.hypot(vx, vy) < DEAD ? -1 : wedge(vx, vy);
    hub.classList.toggle('on', i < 0);
    if (i !== hover) setHover(i);
  });
  // the button that opened the ring was released: run what is chosen; a quick tap with nothing
  // chosen leaves the ring open for a click; letting go outside the ring dismisses it
  window.ring.onRelease(() => {
    if (hover >= 0 && slots[hover]) { window.ring.pick(hover); return; }
    const tap = Date.now() - shownAt < 350;
    if (raw) {
      // nothing chosen: a quick tap hands the ring to the pointer for a click, a longer hold cancels
      if (tap && Math.hypot(vx, vy) < DEAD) { setRaw(false); setHover(-1); hub.classList.remove('on'); } else window.ring.close();
      return;
    }
    if (tap || !last) return;
    if (Math.hypot(last[0] - CX, last[1] - CY) > FAR) window.ring.close();
  });
})();
