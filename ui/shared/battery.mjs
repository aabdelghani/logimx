// A battery reading as shown everywhere (window, tray, notifications): the same levels for low and
// critical, the same icon and colour.
import { t } from './i18n.mjs';

export const LOW = 20, CRITICAL = 10;

// Some devices do not say how full they are (an older battery feature sends 0 while charging): the
// agent reports the level as null then. An unknown level is never low, as in Logi Options+.
export const known = b => !!b && typeof b.percent === 'number';
export const isLow = (b, at = LOW) => known(b) && !b.charging && b.percent <= at;
export const pctText = b => known(b) ? b.percent + '%' : '';

export const batIcon = b => !b ? 'fa-battery-empty' : !known(b) ? (b.charging || b.external_power ? 'fa-plug' : 'fa-battery-empty') : b.percent > 80 ? 'fa-battery-full' : b.percent > 55 ? 'fa-battery-three-quarters' : b.percent > 30 ? 'fa-battery-half' : b.percent > CRITICAL ? 'fa-battery-quarter' : 'fa-battery-empty';
// ok, warn (low) or err (critical); charging is always fine
export const batClass = b => !b ? '' : b.charging ? 'ok' : !known(b) ? '' : b.percent <= CRITICAL ? 'err' : b.percent <= LOW ? 'warn' : 'ok';
// the reading in words, as the tray says it
export const batteryText = b => !b ? t('battery n/a') : !known(b) ? (b.charging ? t('charging') : b.external_power ? t('plugged in') : t('battery n/a')) : b.charging ? t('{pct}% · charging', { pct: b.percent }) : b.percent <= LOW ? t('{pct}% · charge soon', { pct: b.percent }) : `${b.percent}%`;
// the colour of a reading in the tray's own palette
export const batteryColor = b => !known(b) ? (b && b.charging ? 'var(--ok)' : 'var(--dim)') : b.percent <= CRITICAL ? 'var(--err)' : b.percent <= LOW ? 'var(--warn)' : 'var(--ok)';
