// View: the few effects on the drawn page the view models ask for, so they never read or touch
// the page themselves: focus a field, mark a pick without redrawing a long list (it would lose its
// scroll), keep the add panel's button in step.

// from the rest of the window, filled in by link()
let root;
export function link(ctx) { ({ root } = ctx); }
let V;   // the view functions passed through below
export function linkViews(ctx) { V = ctx; }

// put the cursor in a field once it is drawn (after `delay` ms), optionally selecting its text
function focus(selector, { delay = 0, select = false } = {}) {
  setTimeout(() => { const n = root.querySelector(selector); if (n) { n.focus(); if (select) n.select(); } }, delay);
}
// the picked key or action marked in the picker's lists, the others unmarked
function markPicked(kind, key, drawer) {
  if (kind === 'key') {
    root.querySelectorAll('.drawer .act').forEach(x => x.classList.toggle('on', x.dataset.act === 'pick-key' && x.dataset.key === key));
    root.querySelectorAll('.drawer .kc').forEach(x => x.classList.toggle('on', x.dataset.key === key));
  } else {
    root.querySelectorAll(drawer ? '.drawer .act, .drawer .kc' : '.act').forEach(x => x.classList.toggle('on', x.dataset.act === 'pick-item' && x.dataset.key === key));
  }
}
// an application ticked or unticked in the add panel, and its Add button
function markAddPick(key, on, count, label) {
  root.querySelectorAll(`[data-act=add-pick][data-key="${CSS.escape(key)}"]`).forEach(x => x.classList.toggle('on', on));
  const ok = root.querySelector('[data-act=add-confirm]');
  if (ok) { ok.disabled = !count; ok.innerHTML = `<i class="fa-solid fa-plus"></i>${label}`; }
}
// a side panel (Backlight, Point & scroll, adding apps) is open beside the device
const panelOpen = () => !!root.querySelector('.devview2.panel-open');

export const provide = { fx: {
  focus, markPicked, markAddPick, panelOpen,
  // the side panel slides out, then `after` runs and the window is redrawn
  closeDrawer: after => V.closeDrawer(after),
  // the profile bar and the picker's app list redrawn on their own (the rest of the page stays)
  refreshBar: () => V.refreshBar(), refreshAppList: () => V.renderAppList(),
  stopRecorder: () => V.stopRecorder(),
} };
