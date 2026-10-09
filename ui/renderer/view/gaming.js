// View: a gaming mouse's pages as G HUB lays them out: Sensitivity (DPI slots and report rate),
// Scroll wheel, and HITS (the inductive switches' actuation, rapid trigger and click haptics).
// Assignments is the Buttons page with the mouse's own names.
import { t } from '../../shared/i18n.mjs';
import { DPI_STEPS, posFromDpi } from '../../shared/dpi.mjs';

// from the rest of the window, filled in by link()
let card, range, row, sec, sw, wheelSettings;
export function link(ctx) { ({ card, range, row, sec, sw, wheelSettings } = ctx); }

const RATES = [125, 250, 500, 1000, 2000, 4000, 8000];
const SLOT_COLOURS = ['#8a8f98', '#f28c28', '#5fd38d', '#f2d33c', '#e04fc0'];   // G HUB's slot colours; the first is grey here, white would vanish on a light theme

// DPI slots as G HUB shows them: five rows, each a slider with its value and an On switch, the active
// one marked; the report rate under them. The slot in use is what the sensor gets.
const DEFAULT_SLOTS = [800, 1200, 1600, 2400, 3200];   // the mouse's own list out of the box
function pageDpi(d) {
  const st = d.state || {}, s = d.config.settings || {};
  const sd = st.dpi || {}, slots = s.dpi_slots || {};
  const active = s.dpi_active ?? 0;
  const [min, max] = sd.slots && sd.levels ? sd.levels : [100, 48000];   // the sensor snaps a value onto its own steps
  const rows = DEFAULT_SLOTS.map((def, i) => {
    const v = slots[i] ?? (sd.slots || [])[i] ?? def, on = (s.dpi_enabled || {})[i] ?? true;
    return `<div class="row dpi-slot ${i === active ? 'on' : ''}"><span class="slot-bar" style="background:${SLOT_COLOURS[i]}"></span><button class="hbtn icon slot-pick" data-act="setting-val" data-path="dpi_active" data-val="${i}" title="${t('Use this slot')}"><i class="fa-solid ${i === active ? 'fa-circle-dot' : 'fa-circle'}"></i></button><span class="num">${i + 1}</span>${range(`data-act="dpi-slot" data-path="dpi_slots.${i}" data-out="dpi${i}"`, posFromDpi(v, min, max), 0, DPI_STEPS, 1)}<span class="val" data-out="dpi${i}" style="width:52px;text-align:right">${v}</span>${sw(on, `data-act="setting" data-path="dpi_enabled.${i}"`)}</div>`;
  }).join('');
  const sensor = sd.dpi ? `<div class="hint">${t('The sensor is at {dpi} DPI', { dpi: sd.dpi })}</div>` : '';
  // the report rate: the mouse takes the one for the link it is on, the other waits for that link
  const rr = st.report_rate, wiredLink = d.transport === 'usb';
  const rateRow = (label, path, offered, inUse) => {
    const cur = s[path] ?? (rr || {})[path] ?? 1000;
    const rates = offered && offered.length ? offered : RATES;
    const sub = inUse ? t('In use now') : t('Taken when the mouse is on this link');
    return `<div class="row"><div class="grow"><div class="lbl">${label}</div><div class="sub">${rr ? sub : t('Hz; 2000 and above need the 8K receiver')}</div></div><span class="seg">${rates.map(r => `<button class="${cur === r ? 'on' : ''}" data-act="setting-val" data-path="${path}" data-val="${r}">${r}</button>`).join('')}</span></div>`;
  };
  const note = rr ? '' : `<div class="hint">${t('Kept in NotLogi for now; the mouse takes these once its report rate feature is mapped')}</div>`;
  return sec(t('Sensitivity'), card(rows) + sensor, t('DPI per slot; the marked slot is in use')) +
    sec(t('Report rate'), card(rateRow(t('Wireless'), 'report_rate', rr && rr.wireless, !wiredLink) + rateRow(t('Wired'), 'report_rate_wired', rr && rr.wired, wiredLink)) + note);
}

// the wheel: BHOP on a gaming mouse that has it (G HUB's Scroll wheel page), else the card Point &
// scroll shows for an MX mouse
function pageWheel(d) {
  const st = d.state || {}, s = d.config.settings || {};
  if (!st.bunny_hop) return st.hires || st.smartshift ? wheelSettings(d) : sec(t('Scroll wheel'), card(row(t('Nothing to set'), t('This mouse has no wheel settings of its own'), '')));
  const b = s.bunny_hop || {}, on = b.enabled ?? st.bunny_hop.enabled, ms = b.timeout ?? st.bunny_hop.timeout ?? 100;
  const body = row(t('BHOP'), t('One notch of the wheel keeps scrolling for a moment, for jumping in games'), sw(!!on, 'data-act="setting" data-path="bunny_hop.enabled"')) +
    (on ? `<div class="row"><div class="grow"><div class="lbl">${t('BHOP sensitivity')}</div><div class="sub">${t('How long each notch keeps scrolling')}</div></div>${range('data-act="setting-range" data-path="bunny_hop.timeout" data-out="bhop"', ms, 100, 1000, 100)}<span class="val" data-out="bhop" style="width:64px;text-align:right">${ms} ms</span></div>` : '');
  return sec(t('Scroll wheel'), card(body));
}

// HITS: the inductive switches under the two main buttons. Three settings, as G HUB names them; the
// values the mouse holds show until NotLogi sets its own.
function pageHits(d) {
  const st = d.state || {}, h = (d.config.settings || {}).hits || {};
  const dev = ((st.hits || {}).buttons || [])[0] || {};
  const act = h.actuation ?? dev.actuation ?? 5, rtOn = h.rapid_trigger_on ?? dev.rapid_trigger_on ?? false, rt = h.rapid_trigger ?? dev.rapid_trigger ?? 2, hap = h.haptics ?? dev.haptics ?? 3;
  const slider = (label, sub, path, v, lo, hi, out) => `<div class="row"><div class="grow"><div class="lbl">${label}</div><div class="sub">${sub}</div></div>${range(`data-act="setting-range" data-path="${path}" data-out="${out}"`, v, lo, hi, 1)}<span class="val" data-out="${out}" style="width:24px;text-align:right">${v}</span></div>`;
  const body = slider(t('Actuation point'), t('How far a button travels before it clicks: 1 is the lightest touch, 10 the deepest press'), 'hits.actuation', act, 1, 10, 'hact') +
    row(t('Rapid trigger'), t('A button resets the moment you let go, ready to click again'), sw(rtOn, 'data-act="setting" data-path="hits.rapid_trigger_on"')) +
    (rtOn ? slider(t('Rapid trigger sensitivity'), t('1 resets after a clear release, 5 after the slightest'), 'hits.rapid_trigger', rt, 1, 5, 'hrt') : '') +
    slider(t('Click haptics'), t('The feel of each click; 0 turns it off'), 'hits.haptics', hap, 0, 5, 'hhap');
  const note = st.hits ? '' : `<div class="hint">${t('Kept in NotLogi for now; the mouse takes these once its HITS feature is mapped')}</div>`;
  return sec(t('HITS'), card(body), t('the switches under the two main buttons')) + note +
    `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="hits-reset"><i class="fa-solid fa-rotate-left"></i>${t('Default settings')}</button></div>`;
}

export const provide = { pageDpi, pageWheel, pageHits };
