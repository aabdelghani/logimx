// View model: Flow (Deskflow) state, read from the main process.
// from the rest of the window, filled in by link()
let S, api, changed, devicePages, go, store;
export function link(ctx) { ({ S, api, changed, devicePages, go, store } = ctx); }

// the screen state this view model owns: Flow's setup step
export const state = {
  // the full-window sheet the Flow page opens on: 'setup' (what the other computer needs), then
  // 'search' (looking for it)
  flowWizard: false,
};

function flowRefresh() { store.loadFlow().then(() => { if (S.page === 'flow') changed(); }); }

// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  // the sheet: Cancel leaves it and the Flow page, Continue searches
  'flow-wiz-cancel': async (it, e, d, key) => { S.flowWizard = false; if (S.page === 'flow' && d) go(devicePages(d)[0], d.id); changed(); return; },
  'flow-wiz-go': async (it, e, d, key) => { S.flowWizard = 'search'; if (S.flow && !S.flow.installed) { api.host.flowInstall(); S.flowStatus = 'installing'; } changed(); return; },
};

export const provide = { flowRefresh };
