// View model: Flow, as the main process runs it (finding the other computers, switching the devices).

// from the rest of the window, filled in by link()
let S, api, changed, devicePages, go, store;
export function link(ctx) { ({ S, api, changed, devicePages, go, store } = ctx); }

// the screen state this view model owns
export const state = {
  // the full-window sheet: 'setup' (what the other computer needs), 'search' (looking for it),
  // 'done' (paired) or 'notfound'; the Flow page opens on it until a computer is paired
  flowWizard: false,
  flowPanel: false,   // Flow's settings panel (the cog)
};

function flowRefresh() { store.loadFlow().then(() => { if (S.page === 'flow' || S.flowWizard) changed(); }); }
// what the main process says while searching: paired, or nothing found within a minute
function flowEvent(m) {
  if (m.type === 'paired' && S.flowWizard === 'search') S.flowWizard = 'done';
  if (m.type === 'search-timeout' && S.flowWizard === 'search') S.flowWizard = 'notfound';
  if (S.page === 'flow' || S.flowWizard) changed();
}
const paired = () => !!(S.flow && (S.flow.peers || []).length);
const setFlow = async patch => { S.flow = await api.host.flowConfig(patch); changed(); };

// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  // the sheet: Cancel leaves it (and the Flow page while nothing is paired), Continue searches
  'flow-wiz-cancel': async (it, e, d, key) => {
    if (S.flowWizard === 'search') api.host.flowSearch(false);
    S.flowWizard = false;
    if (S.page === 'flow' && !paired()) { if (d) go(devicePages(d)[0], d.id); else go('home'); }
    changed(); return;
  },
  'flow-wiz-go': async (it, e, d, key) => { S.flowWizard = 'search'; changed(); S.flow = await api.host.flowSearch(true); changed(); return; },
  // paired: back to the mouse's Flow page, with its page list on the left
  'flow-wiz-done': async (it, e, d, key) => { S.flowWizard = false; const m = S.devices.find(x => x.kind === 'mouse'); if (m) go('flow', m.id); flowRefresh(); changed(); return; },
  // a computer's ⋯ menu, the settings panel (the cog), and how to switch computers
  'flow-menu': async (it, e, d, key) => { S.menu = S.menu === 'flow:' + key ? null : 'flow:' + key; changed(); return; },
  'flow-settings': async (it, e, d, key) => { S.flowPanel = !S.flowPanel; S.menu = null; changed(); return; },
  'flow-panel-close': async (it, e, d, key) => { S.flowPanel = false; changed(); return; },
  'flow-switch-mode': async (it, e, d, key) => { await setFlow({ switch: key }); return; },
  // Flow's settings: add a computer (the same sheet), switches, which side a computer is on, remove it
  'flow-add': async (it, e, d, key) => { S.flowWizard = 'setup'; changed(); return; },
  'flow-toggle': async (it, e, d, key) => { const cur = (S.flow || {})[key] !== false; await setFlow({ [key]: !cur }); return; },
  'flow-side': async (it, e, d, key) => { S.menu = null; await setFlow({ id: key, pos: it.data.val }); return; },
  'flow-connect': async (it, e, d, key) => { S.flow = await api.host.flowConnect(key); changed(); return; },
  // the channel a device uses for a computer, when Auto picks the wrong one (null: Auto again)
  'flow-channel': async (it, e, d, key) => { const v = it.value === 'auto' ? null : Number(it.value); await setFlow({ id: it.data.peer, channel: { serial: key, host: v } }); return; },
  'flow-remove': async (it, e, d, key) => { S.menu = null; S.flow = await api.host.flowRemove(key); changed(); return; },
};

export const provide = { flowRefresh, flowEvent };
