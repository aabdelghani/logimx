// View: a click (or change) on a drawn button, turned into data and handed to the command of its
// data-act name. The commands themselves are in the view models.

// from the rest of the window, filled in by link()
let commands, dev;
export function link(ctx) { ({ commands, dev } = ctx); }

async function onAction(act, b, e) {
  const cmd = commands[act]; if (!cmd) return;
  // the button as data: its data-* attributes, its value (sliders, selects, fields) and whether it
  // is switched on; the commands never read the page themselves
  const it = { data: Object.assign({}, b && b.dataset), value: b ? b.value : undefined, on: !!(b && b.classList && b.classList.contains('on')) };
  return cmd(it, e, dev(), it.data.key);
}

export const provide = { onAction };
