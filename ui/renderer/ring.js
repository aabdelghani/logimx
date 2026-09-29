// Action ring overlay: eight wedges around the pointer. Hover picks a wedge, click or 1-8 runs
// it, Esc or a click outside closes. Held on a button that steers it (raw mode), the pointer is
// hidden and frozen and the mouse's movement moves an unseen point that cannot leave the ring;
// the highlighted wedge is the only indicator, and letting go runs it. Slots come from the main process with a label and icon
// already resolved, so this window knows nothing about presets.
(() => {
  const N = 8, S = 340, C = S / 2, R = 158, r = 52, GAP = 3;
  // Steering goes by direction, not distance: a nudge past DEAD picks the wedge that way at once.
  // The point saturates at LIMIT, so changing your mind is another nudge, not a trip back.
  const GAIN = 1, DEAD = 10, LIMIT = 36;
  const svg = document.getElementById('svg'), slotsEl = document.getElementById('slots'), hub = document.getElementById('hub');
  let slots = [], hover = -1, shownAt = 0, last = null, raw = false, vx = 0, vy = 0;
  function setRaw(on) { raw = on; document.body.classList.toggle('raw', on); if (!on) { vx = vy = 0; } }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rad = deg => (deg - 90) * Math.PI / 180;    // 0° at the top, clockwise
  const pt = (rr, deg) => [C + rr * Math.cos(rad(deg)), C + rr * Math.sin(rad(deg))];
  // wedge i is centred on i * 45°, with a small angular gap so the slots read as separate keys
  function wedge(i) {
    const a0 = i * 45 - 22.5 + GAP / 2, a1 = i * 45 + 22.5 - GAP / 2;
    const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} A${r} ${r} 0 0 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z`;
  }
  function build() {
    svg.innerHTML = slots.map((s, i) => `<path class="wedge ${s ? '' : 'empty'}" data-i="${i}" d="${wedge(i)}"/>`).join('') + `<circle class="hub" cx="${C}" cy="${C}" r="${r - 6}"/>`;
    slotsEl.innerHTML = slots.map((s, i) => {
      const [x, y] = pt((R + r) / 2, i * 45);
      return `<div class="slot ${s ? '' : 'empty'}" data-i="${i}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"><i class="fa-solid ${esc(s ? s.icon || 'fa-circle-dot' : 'fa-plus')}"></i><span>${esc(s ? s.label : 'Empty')}</span></div>`;
    }).join('');
    setHover(-1);
  }
  function setHover(i) {
    hover = i;
    svg.querySelectorAll('.wedge').forEach(w => w.classList.toggle('on', Number(w.dataset.i) === i));
    slotsEl.querySelectorAll('.slot').forEach(w => w.classList.toggle('on', Number(w.dataset.i) === i));
    const s = i >= 0 ? slots[i] : null;
    hub.innerHTML = s ? `<div class="t">${esc(s.label)}</div><div class="s">${raw ? 'Let go to run' : 'Click to run'}</div>` : i >= 0 ? `<div class="t">Empty</div><div class="s">Fill it in the app</div>` : `<div class="t">Action ring</div><div class="s">Esc closes</div>`;
  }
  // which wedge is under (x, y): none inside the hub or outside the disc
  function at(x, y) {
    const dx = x - C, dy = y - C, d = Math.hypot(dx, dy);
    if (d < r - 6 || d > R) return -1;
    const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360 + 22.5) % 360;
    return Math.floor(deg / 45) % N;
  }
  document.addEventListener('mousemove', e => { if (raw) return; last = [e.clientX, e.clientY]; const i = at(e.clientX, e.clientY); if (i !== hover) setHover(i); });
  document.addEventListener('mouseleave', () => { if (!raw) setHover(-1); });
  document.addEventListener('mousedown', e => {
    if (raw) { if (hover >= 0 && slots[hover]) window.ring.pick(hover); return; }   // a click while steering picks the highlighted wedge
    const i = at(e.clientX, e.clientY);
    if (i < 0) { if (Math.hypot(e.clientX - C, e.clientY - C) > R) window.ring.close(); return; }
    if (slots[i]) window.ring.pick(i); else window.ring.close();
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
    setRaw(!!msg.raw);
    build();
  });
  window.ring.onMove(({ dx, dy }) => {
    if (!raw) setRaw(true);
    vx += dx * GAIN; vy += dy * GAIN;
    const d = Math.hypot(vx, vy);
    if (d > LIMIT) { vx *= LIMIT / d; vy *= LIMIT / d; }   // never leaves the ring
    const i = Math.hypot(vx, vy) < DEAD ? -1 : Math.floor(((Math.atan2(vy, vx) * 180 / Math.PI + 90 + 360 + 22.5) % 360) / 45) % N;
    if (i !== hover) setHover(i);
  });
  // the button that opened the ring was released: run what is under the pointer; a quick tap with
  // nothing chosen leaves the ring open for a click; letting go outside the disc dismisses it
  window.ring.onRelease(() => {
    if (hover >= 0 && slots[hover]) { window.ring.pick(hover); return; }
    const tap = Date.now() - shownAt < 350;
    if (raw) {
      // nothing chosen: a quick tap hands the ring to the pointer for a click, a longer hold cancels
      if (tap && Math.hypot(vx, vy) < DEAD) { setRaw(false); setHover(-1); } else window.ring.close();
      return;
    }
    if (tap || !last) return;
    if (Math.hypot(last[0] - C, last[1] - C) > R) window.ring.close();
  });
})();
