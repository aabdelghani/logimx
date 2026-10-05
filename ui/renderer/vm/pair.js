// View model: pairing a device, with a receiver or over Bluetooth.

// from the rest of the window, filled in by link()
let S, api, call, changed, toast;
export function link(ctx) { ({ S, api, call, changed, toast } = ctx); }

// the screen state this view model owns: pairing: its step, what was found, Bluetooth's progress
export const state = {
  pair: { step: 1, found: [] },
};

// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'open-bt': async (it, e, d, key) => { api.host.openBluetooth(); toast('Opening Bluetooth settings'); return; },
  'pair': async (it, e, d, key) => { S.pair = { step: 1, found: [] }; S.dlg = 'pair'; S.menu = null; changed(); return; },
  'pair-via': async (it, e, d, key) => { S.pair.via = key; changed(); return; },
  'bt-connect': async (it, e, _d, key) => { const b = S.pair && S.pair.bt; if (!b) return; const d = (b.list || []).find(x => x.address === key); b.busy = { address: key, name: d ? d.name : key, state: 'pairing' }; changed(); api.host.btConnect(key); return; },
  'pair-next': async (it, e, d, key) => {
    // Bluetooth: the dialog's own live search
    if (S.pair.step === 1 && S.pair.via === 'bt') { S.pair.step = 2; S.pair.bt = { list: [] }; changed(); api.host.btOpen().catch(() => {}); return; }
    if (S.pair.step === 1 || (S.pair.step === 2 && S.pair.error)) { S.pair.step = 2; S.pair.error = null; S.pair.found = []; S.pair.passkey = null; changed(); try { await call('pair_start'); } catch (x) { S.pair.error = x.message || 'Pairing is not available'; changed(); } return; }
    if (S.pair.step === 3) { if (S.pair.bt) api.host.btClose(); S.dlg = null; changed(); return; }
    return;
  },
  'pair-confirm': async (it, e, d, key) => { try { await call('pair_confirm', { address: key }); S.pair.step = 3; S.pair.done = 'Pairing… the device joins when it confirms'; } catch (x) { S.pair.error = x.message; } changed(); return; },
  'pair-cancel': async (it, e, d, key) => { call('pair_cancel').catch(() => {}); if (S.pair && S.pair.bt) api.host.btClose(); S.dlg = null; changed(); return; },
};

export const provide = {};
