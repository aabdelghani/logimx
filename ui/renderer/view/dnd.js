// View: dragging an action from the panel onto a gesture direction or a ring slot.
import { RING_NEXT_PROFILE, RING_BRIGHTNESS } from '../../shared/ring.mjs';

// from the rest of the window, filled in by link()
let S, dropOnGesture, dropOnRing, root;
export function link(ctx) { ({ S, dropOnGesture, dropOnRing, root } = ctx); }

// hovering a key on the photo shows its name and what it does now
// On the ring page an action can be dragged from the panel straight onto any slot of the ring
// With a button's gestures open, an action can be dragged from the panel onto any direction of the
// pad: it is assigned to that direction exactly as a click would assign it
function gestureDrag() {
  const cells = root.querySelectorAll('.gs-cell[data-key]');
  if (!cells.length || !(S.picker && S.picker.drawer && S.picker.section === 'gesture')) return;
  root.querySelectorAll('.drawer [data-act="pick-item"], .drawer [data-act="pick-key"], .drawer .kc').forEach(el => {
    el.draggable = true;
    el.ondragstart = e => {
      const a = el.dataset.act === 'pick-key' ? { type: 'keystroke', keys: [el.dataset.key] } : el.dataset.key;
      e.dataTransfer.setData('application/x-logimx-action', JSON.stringify(a));
      e.dataTransfer.effectAllowed = 'copy';
      document.body.classList.add('dragging-act');
    };
    el.ondragend = () => { document.body.classList.remove('dragging-act'); root.querySelectorAll('.gs-cell.drop-on').forEach(x => x.classList.remove('drop-on')); };
  });
  cells.forEach(t => {
    const k = t.dataset.key;
    t.ondragover = e => { if (!e.dataTransfer.types.includes('application/x-logimx-action')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; t.classList.add('drop-on'); };
    t.ondragleave = () => t.classList.remove('drop-on');
    t.ondrop = async e => {
      e.preventDefault();
      let a; try { a = JSON.parse(e.dataTransfer.getData('application/x-logimx-action')); } catch (x) { return; }
      document.body.classList.remove('dragging-act');
      // the panel turns to the direction it was dropped on, then the action is assigned there
      await dropOnGesture(k, a);
    };
  });
}
function ringDrag() {
  const slotsEls = root.querySelectorAll('.rs-chip, .rs-lab');
  if (!slotsEls.length || !(S.picker && S.picker.drawer && S.picker.section === 'ring')) return;
  root.querySelectorAll('.drawer [data-act="pick-item"], .drawer [data-act="pick-key"], .drawer .kc').forEach(el => {
    if (el.dataset.key === 'ring:folder') return;   // a folder needs a name: clicked, not dragged
    el.draggable = true;
    el.ondragstart = e => {
      const a = el.dataset.act === 'pick-key' ? { type: 'keystroke', keys: [el.dataset.key] } : el.dataset.key === 'ring:profile' ? RING_NEXT_PROFILE : el.dataset.key === 'ring:brightness' ? RING_BRIGHTNESS : el.dataset.key;
      e.dataTransfer.setData('application/x-logimx-action', JSON.stringify(a));
      e.dataTransfer.effectAllowed = 'copy';
      document.body.classList.add('dragging-act');
    };
    el.ondragend = () => { document.body.classList.remove('dragging-act'); root.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); };
  });
  slotsEls.forEach(t => {
    const i = Number(t.dataset.cid), pair = () => root.querySelectorAll(`.rs-chip[data-cid="${t.dataset.cid}"], .rs-lab[data-cid="${t.dataset.cid}"]`);
    t.ondragover = e => { if (!e.dataTransfer.types.includes('application/x-logimx-action')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; pair().forEach(x => x.classList.add('drop')); };
    t.ondragleave = () => pair().forEach(x => x.classList.remove('drop'));
    t.ondrop = async e => {
      e.preventDefault();
      let a; try { a = JSON.parse(e.dataTransfer.getData('application/x-logimx-action')); } catch (x) { return; }
      await dropOnRing(i, t.dataset.ins, a);
      document.body.classList.remove('dragging-act');
    };
  });
}

export const provide = { gestureDrag, ringDrag };
