// View model: Flow (Deskflow) state, read from the main process.
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, api, changed, devicePages, go, store, toast;
export function link(ctx) { ({ S, api, changed, devicePages, go, store, toast } = ctx); }

// the screen state this view model owns: Flow's setup step
export const state = {
  // the full-window sheet that connects another computer: 'setup' (what the other computer
  // needs), 'search' (looking for it); a mouse without Flow yet opens on it
  flowWizard: false,
};
// Flow not used yet on this computer: no other computer and not running
const flowNew = f => !!f && !f.running && !(f.peers || []).length;

function flowRefresh() { store.loadFlow().then(() => { if (S.page === 'flow') changed(); }); }

// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'flow-install': async (it, e, d, key) => { api.host.flowInstall(); S.flowStatus = 'installing'; changed(); return; },
  // the sheet: Cancel leaves it (and the Flow page, when Flow is not set up yet), Continue searches
  'flow-wiz-cancel': async (it, e, d, key) => { S.flowWizard = false; if (S.page === 'flow' && flowNew(S.flow) && d) go(devicePages(d)[0], d.id); changed(); return; },
  'flow-wiz-go': async (it, e, d, key) => { S.flowWizard = 'search'; if (S.flow && !S.flow.installed) { api.host.flowInstall(); S.flowStatus = 'installing'; } changed(); return; },
  'flow-start': async (it, e, d, key) => { const r = await api.host.flowStart(); if (r && !r.ok) toast(r.error || t('Could not start Flow'), true); flowRefresh(); return; },
  'flow-stop': async (it, e, d, key) => { await api.host.flowStop(); flowRefresh(); return; },
  'flow-name': async (it, e, d, key) => { const v = (it.value || '').trim(); if (v) await api.host.flowConfig({ name: v }); flowRefresh(); return; },
  'flow-clip': async (it, e, d, key) => { const cur = (S.flow || {}).clipboard !== false; await api.host.flowConfig({ clipboard: !cur }); flowRefresh(); return; },
  // adding a computer walks through the same sheet, as in Options+
  'flow-peer-add': async (it, e, d, key) => { S.flowWizard = 'setup'; changed(); return; },
  'flow-peer-del': async (it, e, d, key) => { const peers = ((S.flow || {}).peers || []).slice(); peers.splice(Number(it.data.i), 1); await api.host.flowConfig({ peers }); flowRefresh(); return; },
  'flow-peer-pos': async (it, e, d, key) => { const peers = ((S.flow || {}).peers || []).slice(); const i = Number(it.data.i); if (peers[i]) peers[i] = Object.assign({}, peers[i], { pos: it.value }); await api.host.flowConfig({ peers }); flowRefresh(); return; },
};

export const provide = { flowRefresh, flowNew };
