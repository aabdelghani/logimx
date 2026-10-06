// View model: Flow (Deskflow) state, read from the main process.
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, api, changed, prompt, store, toast;
export function link(ctx) { ({ S, api, changed, prompt, store, toast } = ctx); }

// the screen state this view model owns: Flow's setup step
export const state = {
  flowSetup: undefined,
  flowWizard: false,   // the full-window sheet that walks through connecting another computer
};

function flowRefresh() { store.loadFlow().then(() => { if (S.page === 'flow') changed(); }); }

// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'flow-install': async (it, e, d, key) => { api.host.flowInstall(); S.flowStatus = 'installing'; changed(); return; },
  // setting Flow up opens a sheet with what the other computer needs; Continue goes on as before
  'flow-begin': async (it, e, d, key) => { S.flowWizard = true; changed(); return; },
  'flow-wiz-cancel': async (it, e, d, key) => { S.flowWizard = false; changed(); return; },
  'flow-wiz-go': async (it, e, d, key) => { const adding = S.flowWizard === 'add'; S.flowWizard = false; if (adding) return commands['flow-peer-name'](it, e, d, key); S.flowSetup = true; if (S.flow && !S.flow.installed) { api.host.flowInstall(); S.flowStatus = 'installing'; } changed(); return; },
  'flow-start': async (it, e, d, key) => { const r = await api.host.flowStart(); if (r && !r.ok) toast(r.error || t('Could not start Flow'), true); flowRefresh(); return; },
  'flow-stop': async (it, e, d, key) => { await api.host.flowStop(); flowRefresh(); return; },
  'flow-name': async (it, e, d, key) => { const v = (it.value || '').trim(); if (v) await api.host.flowConfig({ name: v }); flowRefresh(); return; },
  'flow-clip': async (it, e, d, key) => { const cur = (S.flow || {}).clipboard !== false; await api.host.flowConfig({ clipboard: !cur }); flowRefresh(); return; },
  // adding a computer walks through the same sheet first, as in Options+
  'flow-peer-add': async (it, e, d, key) => { S.flowWizard = 'add'; changed(); return; },
  'flow-peer-name': async (it, e, d, key) => { prompt(t('Add computer'), [{ key: 'name', label: t('Name'), placeholder: t('macbook, work-pc…') }], async v => { const name = (v.name || '').trim(); if (!name) return; const peers = ((S.flow || {}).peers || []).slice(); if (peers.some(p => p.name === name)) return toast(t('That name is already added'), true); peers.push({ name: name.replace(/[^A-Za-z0-9_-]/g, '-'), pos: 'right' }); await api.host.flowConfig({ peers }); flowRefresh(); }, t('Add')); return; },
  'flow-peer-del': async (it, e, d, key) => { const peers = ((S.flow || {}).peers || []).slice(); peers.splice(Number(it.data.i), 1); await api.host.flowConfig({ peers }); flowRefresh(); return; },
  'flow-peer-pos': async (it, e, d, key) => { const peers = ((S.flow || {}).peers || []).slice(); const i = Number(it.data.i); if (peers[i]) peers[i] = Object.assign({}, peers[i], { pos: it.value }); await api.host.flowConfig({ peers }); flowRefresh(); return; },
};

export const provide = { flowRefresh };
