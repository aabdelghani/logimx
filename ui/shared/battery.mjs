// A battery reading as shown everywhere (window, tray, notifications): the same levels for low and
// critical, the same icon and colour.

export const LOW = 20, CRITICAL = 10;

export const batIcon = b => !b ? 'fa-battery-empty' : b.percent > 80 ? 'fa-battery-full' : b.percent > 55 ? 'fa-battery-three-quarters' : b.percent > 30 ? 'fa-battery-half' : b.percent > CRITICAL ? 'fa-battery-quarter' : 'fa-battery-empty';
// ok, warn (low) or err (critical); charging is always fine
export const batClass = b => !b ? '' : b.charging ? 'ok' : b.percent <= CRITICAL ? 'err' : b.percent <= LOW ? 'warn' : 'ok';
// the reading in words, as the tray says it
export const batteryText = b => !b || b.percent == null ? 'battery n/a' : `${b.percent}%${b.charging ? ' · charging' : b.percent <= LOW ? ' · charge soon' : ''}`;
// the colour of a reading in the tray's own palette
export const batteryColor = b => !b || b.percent == null ? 'var(--dim)' : b.percent <= CRITICAL ? 'var(--err)' : b.percent <= LOW ? 'var(--warn)' : 'var(--ok)';
