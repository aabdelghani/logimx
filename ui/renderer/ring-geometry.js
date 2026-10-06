// The action ring's geometry, without any window: where the eight slots sit, which slot a direction
// points at, and how a folder's actions fan out on the outer circle. The overlay (ring.js) draws
// and steers with these.

export const N = 8;
export const FAN_R = 2, FAN_STEP = 20;   // a folder's circle: twice the ring's radius, 20° between actions

// slot i's direction in radians: slot 0 at the top, clockwise in 45° steps
export const ang = i => (i * 45 - 90) * Math.PI / 180;
// the slot a direction (dx, dy) points at: the 45° wedge around each slot
export const wedge = (dx, dy) => Math.floor(((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360 + 22.5) % 360) / 45) % N;

// a folder's actions in order, the empty places skipped: order[i] is action i's place in the row
export function fanOrder(slots) {
  const order = []; let n = 0;
  slots.forEach((x, i) => { if (x) order[i] = n++; });
  return { order, n };
}
// the direction of the action at place k of n, in a row centred on the folder at slot `folder`
export const fanAngle = (folder, k, n) => ang(folder) + (k - (n - 1) / 2) * FAN_STEP * Math.PI / 180;

// the index whose angle (null: none) is closest to direction a, within `within` radians
export function closestByAngle(a, angles, within = 22 * Math.PI / 180) {
  let best = -1, bd = within;
  angles.forEach((b, i) => {
    if (b == null) return;
    let diff = Math.abs(a - b) % (2 * Math.PI); if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff < bd) { bd = diff; best = i; }
  });
  return best;
}
// the index of the point (null: none) nearest (x, y), within `reach`
export function nearest(points, x, y, reach) {
  let best = -1, bd = reach;
  points.forEach((p, i) => { if (!p) return; const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = i; } });
  return best;
}

// Letting go of the button that opened the ring. A release sooner than TAP_MS is a tap; raw
// movement in the first JOLT_MS is the press's own jolt and steers nothing; a quick press only runs
// a slot when it was flicked clearly past the dead zone, and only a long hold with nothing chosen
// cancels. Anything else leaves the ring open for a click.
export const TAP_MS = 500, JOLT_MS = 120, HOLD_CANCEL_MS = 900;
export function rawRelease({ heldMs, travel, dead, hasPick }) {
  if (hasPick && (heldMs >= TAP_MS || travel >= dead * 2)) return 'pick';
  if (heldMs < HOLD_CANCEL_MS && travel < dead * 2) return 'stay';
  return 'close';
}
