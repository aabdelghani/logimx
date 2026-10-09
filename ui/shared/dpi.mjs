// A DPI slider that feels like G HUB's: the sensor spans 100..48000 DPI, so a straight slider would
// crowd every useful value into its first few pixels. Positions 0..1000 run on a log scale instead.
export const DPI_STEPS = 1000;

export function dpiFromPos(pos, min = 100, max = 48000) {
  const v = min * Math.pow(max / min, Math.max(0, Math.min(DPI_STEPS, pos)) / DPI_STEPS);
  const step = v < 1000 ? 10 : v < 10000 ? 50 : 100;   // round as a person would read it; the agent snaps to the sensor's own steps
  return Math.max(min, Math.min(max, Math.round(v / step) * step));
}

export function posFromDpi(dpi, min = 100, max = 48000) {
  return Math.round(DPI_STEPS * Math.log(Math.max(min, Math.min(max, dpi)) / min) / Math.log(max / min));
}
