// Action ring overlay: eight round buttons around the pointer, each with its label outside it
// and a small close button in the middle. Hover picks one, click or 1-8 runs it, Esc, the middle
// or a click outside closes. Held on a button that steers it (raw mode), the pointer is hidden
// and frozen and the mouse picks by direction: a nudge past DEAD chooses the button that way,
// the highlight is the only indicator, and letting go runs it.
(() => {
  const N = 8, W = 560, H = 460, CX = W / 2, CY = H / 2;
  const RR = 104, B = 28;          // ring radius to the bubble centres, bubble radius
  const NEAR = 38, FAR = 250;      // pointer mode: inside NEAR is the close button, beyond FAR is outside
  const GAIN = 1, DEAD = 10, LIMIT = 36;
  const slotsEl = document.getElementById('slots'), hub = document.getElementById('hub');
  let slots = [], hover = -1, shownAt = 0, last = null, raw = false, vx = 0, vy = 0;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ang = i => (i * 45 - 90) * Math.PI / 180;    // slot 0 at the top, clockwise
  function setRaw(on) { raw = on; document.body.classList.toggle('raw', on); if (!on) { vx = vy = 0; } }
  function build() {
    slotsEl.innerHTML = slots.map((s, i) => {
      const c = Math.cos(ang(i)), sn = Math.sin(ang(i));
      const bx = CX + RR * c, by = CY + RR * sn;
      const bub = `<div class="bub ${s ? '' : 'empty'}" data-i="${i}" style="left:${bx.toFixed(1)}px;top:${by.toFixed(1)}px;--a:${i * 45 - 90}deg"><i class="fa-solid ${esc(s ? s.icon || 'fa-circle-dot' : 'fa-plus')}"></i></div>`;
      if (!s) return bub;
      // the label sits outside the bubble, growing away from the ring
      const lx = CX + (RR + B + 16) * c, ly = CY + (RR + B + 16) * sn;
      const tx = c > 0.3 ? '0' : c < -0.3 ? '-100%' : '-50%', ty = sn > 0.3 ? '0' : sn < -0.3 ? '-100%' : '-50%';
      return bub + `<div class="lab" data-i="${i}" style="left:${lx.toFixed(1)}px;top:${ly.toFixed(1)}px;transform:translate(${tx},${ty})">${esc(s.label)}</div>`;
    }).join('');
    setHover(-1);
  }
  function setHover(i) {
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
    if (raw) return;
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
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { window.ring.close(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= N && slots[n - 1]) window.ring.pick(n - 1);
  });
  window.ring.onShow(msg => {
    document.documentElement.dataset.theme = msg.theme || 'light';
    slots = Array.from({ length: N }, (_, i) => (msg.slots || [])[i] || null);
    shownAt = Date.now(); last = null; vx = vy = 0;
    hub.classList.remove('on');
    setRaw(!!msg.raw);
    build();
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
