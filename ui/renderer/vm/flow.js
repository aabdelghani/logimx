// View model: Flow (Deskflow) state, read from the main process.

// from the rest of the window, filled in by link()
let S, render, store;
export function link(ctx) { ({ S, render, store } = ctx); }

function flowRefresh() { store.loadFlow().then(() => { if (S.page === 'flow') render(); }); }

export const provide = { flowRefresh };
