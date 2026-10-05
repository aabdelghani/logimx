// View: typing a shortcut. Keys are caught in the window, or by the agent when it can grab the
// keyboard (Wayland, other apps' shortcuts), and handed to the picker.
import { codeToKey, MODS } from '../../shared/actions.mjs';

// from the rest of the window, filled in by link()
let S, assignPicked, esc, keyGrab, keyName, render, root, setChord;
export function link(ctx) { ({ S, assignPicked, esc, keyGrab, keyName, render, root, setChord } = ctx); }

// ------------------------------------------------------------ recorder
let recorder = null;
let agentGrab = false, recordDone = null, recordPartial = null;
let recGen = 0, armPending = false;   // an arm that is still asking the agent for the grab
function startRecorder(onUpdate, onDone) {
  stopRecorder();
  const st = { mods: [], key: null, down: new Set() };
  const chord = () => [...st.mods, ...(st.key ? [st.key] : [])];
  const onDown = e => {
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape') { stopRecorder(); onUpdate([], true); return; }
    const k = codeToKey(e.code); if (!k || e.repeat) return;
    st.down.add(k);
    if (MODS.has(k)) { if (!st.mods.includes(k)) st.mods.push(k); } else st.key = k;
    onUpdate(chord(), false);
  };
  const finish = () => { const keys = chord(); stopRecorder(); onDone(keys); };
  const onUp = e => {
    e.preventDefault(); e.stopPropagation();
    const k = codeToKey(e.code); if (k) st.down.delete(k);
    // A release with nothing recorded (a stray keyup, or the press went elsewhere) is not a
    // result; keep listening rather than silently stopping with the box still saying "recording".
    if (!chord().length) return;
    if (st.key || st.down.size === 0) finish();
  };
  // When the shortcut also belongs to another application (Wayland: nothing stops it), that
  // application may take focus on the press and the release never reaches this window.
  // Treat losing focus as letting go.
  const onBlur = () => {
    if (st.key) finish();
    else { st.mods = []; st.down.clear(); onUpdate([], false); }
  };
  recorder = { onDown, onUp, onBlur };
  document.addEventListener('keydown', onDown, true);
  document.addEventListener('keyup', onUp, true);
  window.addEventListener('blur', onBlur);
}
function stopRecorder() {
  recGen++;   // a record_start still in flight must not take effect after this
  if (agentGrab) { agentGrab = false; recordDone = recordPartial = null; keyGrab.cancel().catch(() => {}); }
  if (!recorder) return;
  document.removeEventListener('keydown', recorder.onDown, true);
  document.removeEventListener('keyup', recorder.onUp, true);
  window.removeEventListener('blur', recorder.onBlur);
  recorder = null;
}
function recorderActive() { return !!recorder || agentGrab || armPending; }
// a shortcut being typed into the recorder right now (keys go to it, not the window)
const recording = () => !!recorder;
// the agent's own recorder reports keys as they are pressed, and when it is done
function onRecordEvent(data) {
  if (!agentGrab || !S.picker) return;
  if (data.done && data.timeout) { recordDone = recordPartial = null; agentGrab = false; setChord(data.keys || [], false); render(); }
  else if (data.done) { const f = recordDone; recordDone = recordPartial = null; agentGrab = false; if (f) f(data.keys || []); }
  else if (recordPartial) recordPartial(data.keys || []);
}
// The window manager reserves Alt+Tab, Super and Ctrl+Alt+arrow, and acts on them before any
// window sees them. The agent can grab the keyboard at the X level, which overrides that, so
// ask it first and fall back to listening in the page (Wayland, or no X display).
function armRecorder() {
  // Re-renders happen for unrelated reasons (a battery tick every 30 s); restarting the recorder
  // then would drop the keys already held and leave the next release with nothing to finish.
  if (recorderActive()) return;
  const onPartial = chord => {
    setChord(chord);
    const box = root.querySelector('.recbox .keys');
    if (box) box.innerHTML = chord.map(k => `<span>${esc(keyName(k))}</span>`).join('');
  };
  const onFinal = keys => {
    agentGrab = false;
    setChord(keys, false);
    if (keys && keys.length) assignPicked({ type: 'keystroke', keys });
    else render();
  };
  const gen = ++recGen;
  armPending = true;
  keyGrab.start().then(() => {
    armPending = false;
    // disarmed while the agent was setting the grab up (the typed field took focus): let go
    // again, or the agent would keep swallowing keys the page no longer wants
    if (gen !== recGen) { keyGrab.cancel().catch(() => {}); return; }
    agentGrab = true; recordDone = onFinal; recordPartial = onPartial;
  })
    .catch(() => {
      armPending = false;
      if (gen !== recGen) return;
      agentGrab = false;
      startRecorder((chord, cancelled) => {
        if (cancelled) { setChord(chord, false); render(); return; }
        onPartial(chord);
      }, onFinal);
    });
}

export const provide = { startRecorder, stopRecorder, recorderActive, recording, onRecordEvent, armRecorder };
