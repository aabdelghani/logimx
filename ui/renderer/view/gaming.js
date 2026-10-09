// View: a gaming mouse's pages as G HUB lays them out: Sensitivity (DPI slots and report rate),
// Scroll wheel, and HITS (the inductive switches' actuation, rapid trigger and click haptics).
// Assignments is the Buttons page with the mouse's own names.
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let card, range, row, sec, sw, wheelSettings;
export function link(ctx) { ({ card, range, row, sec, sw, wheelSettings } = ctx); }

const RATES = [125, 250, 500, 1000, 2000, 4000, 8000];
const SLOT_COLOURS = ['#8a8f98', '#f28c28', '#5fd38d', '#f2d33c', '#e04fc0'];   // G HUB's slot colours; the first is grey here, white would vanish on a light theme

// DPI slots as G HUB shows them: five rows, each a slider with its value and an On switch, the active
// one marked; the report rate under them. Saved in NotLogi; the active slot is what the mouse gets.
function pageDpi(d) {
  const st = d.state || {}, s = d.config.settings || {};
  const slots = s.dpi_slots || {};
  const defaults = [400, 800, 1600, 3200, 6400];
  const active = s.dpi_active ?? 1;
  const [min, max, step] = st.dpi && st.dpi.stepped ? st.dpi.levels : [100, 44000, 50];
  const rows = defaults.map((def, i) => {
    const v = slots[i] ?? def, on = (s.dpi_enabled || {})[i] ?? (i < 4);
    return `<div class="row dpi-slot ${i === active ? 'on' : ''}"><span class="slot-bar" style="background:${SLOT_COLOURS[i]}"></span><button class="hbtn icon slot-pick" data-act="setting-val" data-path="dpi_active" data-val="${i}" title="${t('Use this slot')}"><i class="fa-solid ${i === active ? 'fa-circle-dot' : 'fa-circle'}"></i></button><span class="num">${i + 1}</span>${range(`data-act="setting-range" data-path="dpi_slots.${i}" data-out="dpi${i}"`, v, min, max, step)}<span class="val" data-out="dpi${i}" style="width:52px;text-align:right">${v}</span>${sw(on, `data-act="setting" data-path="dpi_enabled.${i}"`)}</div>`;
  }).join('');
  const rateRow = (label, path) => { const cur = s[path] ?? (st.report_rate || {})[path] ?? 1000; return `<div class="row"><div class="grow"><div class="lbl">${label}</div><div class="sub">${t('Hz; 2000 and above need the 8K receiver')}</div></div><span class="seg">${RATES.map(r => `<button class="${cur === r ? 'on' : ''}" data-act="setting-val" data-path="${path}" data-val="${r}">${r}</button>`).join('')}</span></div>`; };
  const note = st.report_rate ? '' : `<div class="hint">${t('Kept in NotLogi for now; the mouse takes these once its report rate feature is mapped')}</div>`;
  return sec(t('Sensitivity'), card(rows), t('DPI per slot; the marked slot is in use')) +
    sec(t('Report rate'), card(rateRow(t('Wireless'), 'report_rate') + rateRow(t('Wired'), 'report_rate_wired')) + note);
}

// the wheel: the same card Point & scroll shows for an MX mouse
function pageWheel(d) { return wheelSettings(d); }

// HITS: the inductive switches under the two main buttons. Three settings, as G HUB names them.
function pageHits(d) {
  const st = d.state || {}, h = (d.config.settings || {}).hits || {};
  const act = h.actuation ?? 5, rtOn = !!h.rapid_trigger_on, rt = h.rapid_trigger ?? 3, hap = h.haptics ?? 3;
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
