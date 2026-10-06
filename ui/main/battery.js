// Battery notices: low, critical, charging, charged; filtered so a device waking up does not alarm.
const { Notification } = require('electron');
const path = require('path');
const state = require('./state');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder

exports.link = () => {};

const alerted = new Map();        // device id -> 'low' | 'critical'

// ------------------------------------------------------------------ battery
const lastPercent = new Map();
const lowNotice = new Map();      // the warning we showed, so it can be taken down again
const wasCharging = new Map();
const lowStreak = new Map();      // consecutive low readings, so one stale value cannot warn
const chargeNotice = new Map();   // the 'is charging' notice, superseded once it is full
const fullNotice = new Map();     // told them it is full, until the cable comes out
function dropChargeNotice(id) {
  const n = chargeNotice.get(id);
  if (n) { try { n.close(); } catch (e) {} chargeNotice.delete(id); }
}
function dropLowNotice(id) {
  const n = lowNotice.get(id);
  if (n) { try { n.close(); } catch (e) {} lowNotice.delete(id); }
}
function checkBattery(d) {
  const b = d.battery;
  if (!b) return;
  // The first reading after a device links is what the firmware stored before sleeping, and the
  // agent replaces it a few seconds later. Alerting on it produces a warning about a battery
  // that is actually full.
  if (b.confirmed === false) return;
  // a device that does not say how full it is gets no battery notices
  if (!state.Battery.known(b)) return;
  const seen = lastPercent.get(d.id);
  lastPercent.set(d.id, b.percent);
  // a battery does not fall thirty points between two readings: wait for the next one
  if (seen !== undefined && !b.charging && seen - b.percent > 30) return;
  // Plugging in answers the warning: take it off screen and say what is happening instead of
  // leaving 'battery critical' sitting there while the device charges.
  const before = wasCharging.get(d.id);
  wasCharging.set(d.id, b.charging);
  // A device at 100% usually stops charging with the cable still in, reporting charging false
  // and external power true, so either flag counts as plugged in.
  const plugged = !!(b.charging || b.external_power);
  if (!plugged) { fullNotice.delete(d.id); dropChargeNotice(d.id); }
  else if (b.percent >= 100 && !fullNotice.get(d.id)) {
    fullNotice.set(d.id, true);
    dropLowNotice(d.id);
    dropChargeNotice(d.id);
    alerted.delete(d.id);
    if (state.general.notify_low !== false && Notification.isSupported()) {
      new Notification({
        title: `${d.name} is fully charged`,
        body: 'You can unplug the charger.',
        icon: path.join(ROOT, 'assets', d.kind === 'keyboard' ? 'full-keyboard.png' : 'full-mouse.png'),
      }).show();
    }
    return;
  }
  if (b.charging && before === false) {
    dropLowNotice(d.id);
    alerted.delete(d.id);
    if (state.general.notify_low !== false && Notification.isSupported()) {
      dropChargeNotice(d.id);
      const c = new Notification({
        title: `${d.name} is charging`,
        icon: path.join(ROOT, 'assets', d.kind === 'keyboard' ? 'charging-keyboard.png' : 'charging-mouse.png'),
      });
      c.show();
      chargeNotice.set(d.id, c);
    }
    return;
  }
  if (state.general.notify_low === false) return;
  const low = state.general.notify_low_threshold || state.Battery.LOW;
  const prev = alerted.get(d.id);
  if (b.charging || b.percent > low) { lowStreak.delete(d.id); dropLowNotice(d.id); if (prev) alerted.delete(d.id); return; }
  // A device waking from sleep can report the level it stored before it slept, and on the first
  // reading after a start there is no earlier value to compare against, so the implausible-drop
  // check above cannot catch it. A real low battery is still low on the next reading; a stale one
  // is not. Wait for a second low reading before saying anything.
  const streak = (lowStreak.get(d.id) || 0) + 1;
  lowStreak.set(d.id, streak);
  if (streak < 2) return;
  const level = b.percent <= state.Battery.CRITICAL ? 'critical' : 'low';
  if (prev === level || (prev === 'critical' && level === 'low')) return;
  alerted.set(d.id, level);
  if (Notification.isSupported()) {
    dropLowNotice(d.id);
    const n = new Notification({
      title: `${d.name}: battery ${level}`,
      body: `${b.percent}% left. ${d.kind === 'keyboard' ? 'Plug in the USB-C cable to charge.' : 'Charge it soon.'}`,
      urgency: 'normal',
      icon: path.join(ROOT, 'assets', d.kind === 'keyboard' ? 'low-keyboard.png' : 'low-mouse.png'),
    });
    n.show();
    lowNotice.set(d.id, n);
  }
}

exports.provide = { alerted, lastPercent, lowNotice, wasCharging, lowStreak, chargeNotice, fullNotice, dropChargeNotice, dropLowNotice, checkBattery };
