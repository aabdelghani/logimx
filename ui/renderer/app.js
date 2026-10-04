/* LogiMX renderer. One state object, full re-render on change, Adwaita-style layout. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const root = $('#root');

  const S = {
    devices: [], presets: null, apps: null, general: {}, conflicts: [], status: {}, connected: false, appInfo: {},
    theme: 'light', mode: 'app', page: 'home', dev: null, dir: 'tap', dlg: null, picker: null, menu: null,
    pair: { step: 1, found: [] }, ob: { step: 1, preset: 'gnome' }, appDetail: null, conflictDismissed: false,
    thumbSpeed: 5, history: {}, logs: [], backups: [], ui: {}, agentBusy: false, agentErr: null, agentInfo: null, buildStep: null, ready: false, loaded: false, running: null,
    flow: null, flowStatus: 'stopped', flowDetail: '',
  };
  try { S.theme = localStorage.getItem('theme') || 'light'; } catch (e) {}
  const VERSION = '0.6.23';

  // ------------------------------------------------------------------ rpc
  async function call(method, params) {
    try { return await window.agent.call(method, params); }
    catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, ''), true); throw e; }
  }
  window.addEventListener('resize', () => alignToNav());
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.toggle('err', !!err);
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function merge(summary) {
    const i = S.devices.findIndex(x => x.id === summary.id);
    if (i >= 0) S.devices[i] = summary; else S.devices.push(summary);
  }
  const dev = () => S.devices.find(d => d.id === S.dev) || null;
  const isMouse = d => d && d.kind !== 'keyboard';
  const isNative = a => !a || a === 'native';
  const profileOf = (d, key) => (((d.config || {}).profiles || {})[key || 'default']) || {};
  const assignment = (d, section, cid, prof) => section === 'thumbwheel' ? profileOf(d, prof).thumbwheel : ((profileOf(d, prof)[section] || {})[String(cid)]);
  // Icon for an assignment: the preset's own icon, else its type's, and the key's printed
  // function only while the key is left to the device.
  const assignIcon = (a, native) => {
    if (!a || a === 'native') return native;
    if (typeof a === 'string') return PRESET_ICON[a] || ICON[(S.presets && S.presets.all[a] || {}).type] || native;
    return ICON[a.type] || native;
  };
  const presetLabel = a => {
    if (!a || a === 'native') return 'Default';
    if (typeof a === 'string') return (S.presets && S.presets.all[a] || {}).label || a;
    if (a.type === 'keystroke') return (a.keys || []).map(keyName).join(' + ');
    if (a.type === 'command') return 'Run: ' + (a.cmd || '');
    if (a.type === 'gesture') return a.label || 'Custom gestures';
    if (a.type === 'launch') return 'Launch ' + (a.label || a.app);
    if (a.type === 'type_text') return 'Type: ' + (a.text || '').slice(0, 24);
    if (a.type === 'open') return a.label || 'Open ' + (a.target || '');
    if (a.type === 'scroll') return a.label || (a.axis === 'x' ? 'Horizontal scroll' : 'Vertical scroll');
    if (a.type === 'button') return a.label || a.button.replace('BTN_', '') + ' click';
    if (a.type === 'nothing') return 'Disabled';
    return a.label || a.type;
  };
  const ICON = { native: 'fa-circle-dot', nothing: 'fa-ban', gesture: 'fa-hand-pointer', scroll: 'fa-arrows-left-right', adapter: 'fa-arrows-up-down', keystroke: 'fa-keyboard', button: 'fa-computer-mouse', change_host: 'fa-right-left', dpi_cycle: 'fa-arrow-pointer', command: 'fa-terminal', smartshift_toggle: 'fa-gear', open: 'fa-folder-open', launch: 'fa-rocket', type_text: 'fa-i-cursor' };
  const PRESET_ICON = { action_ring: 'fa-circle-notch', volume_dial: 'fa-volume-high', overview: 'fa-table-cells-large', show_desktop: 'fa-desktop', home_show_desktop: 'fa-desktop', screen_capture: 'fa-camera', eject: 'fa-eject', do_not_disturb: 'fa-moon', app_switcher: 'fa-window-restore', workspace_next: 'fa-arrow-right', workspace_prev: 'fa-arrow-left', tab_next: 'fa-arrow-right-long', tab_prev: 'fa-arrow-left-long',
    copy: 'fa-copy', paste: 'fa-paste', undo: 'fa-rotate-left', redo: 'fa-rotate-right', zoom_in: 'fa-magnifying-glass-plus', zoom_out: 'fa-magnifying-glass-minus', volume_up: 'fa-volume-high', volume_down: 'fa-volume-low', mute: 'fa-volume-xmark',
    mic_mute: 'fa-microphone-slash', play_pause: 'fa-play', next_track: 'fa-forward-step', prev_track: 'fa-backward-step', brightness_up: 'fa-sun', brightness_down: 'fa-sun', screenshot: 'fa-camera', screenshot_area: 'fa-crop-simple', lock: 'fa-lock',
    calculator: 'fa-calculator', emoji: 'fa-face-smile', emoji_picker: 'fa-face-smile', context_menu: 'fa-bars', dictation: 'fa-microphone', terminal: 'fa-terminal', close_window: 'fa-xmark', maximize: 'fa-window-maximize', minimize: 'fa-window-minimize', tile_left: 'fa-table-columns', tile_right: 'fa-table-columns',
    hscroll: 'fa-arrows-left-right', vscroll: 'fa-arrows-up-down', zoom_wheel: 'fa-magnifying-glass-plus', volume_wheel: 'fa-volume-high', tabs_wheel: 'fa-window-restore', workspaces_wheel: 'fa-table-cells-large', brightness_wheel: 'fa-sun',
    easy_switch_1: 'fa-right-left', easy_switch_2: 'fa-right-left', easy_switch_3: 'fa-right-left', dpi_cycle: 'fa-arrow-pointer', smartshift_toggle: 'fa-gear', open_home: 'fa-folder-open', middle_click: 'fa-computer-mouse', back: 'fa-arrow-left', forward: 'fa-arrow-right', native: 'fa-circle-dot', nothing: 'fa-ban',
    gesture_navigation: 'fa-hand-pointer', gesture_windows: 'fa-hand-pointer', gesture_volume: 'fa-hand-pointer', gesture_pan: 'fa-hand-pointer' };
  const actionIcon = a => typeof a === 'string' ? (PRESET_ICON[a] || ICON[(S.presets && S.presets.all[a] || {}).type] || 'fa-circle-dot') : ICON[(a || {}).type] || 'fa-circle-dot';
  // which OS the app runs on: names of keys and settings follow it
  const OS = () => (S.appInfo && S.appInfo.platform) || 'linux';
  const IS_WIN = () => OS() === 'win32', IS_MAC = () => OS() === 'darwin', IS_LINUX = () => !IS_WIN() && !IS_MAC();
  const META = () => IS_WIN() ? 'Win' : IS_MAC() ? 'Cmd' : 'Super';
  const ALT = () => IS_MAC() ? 'Option' : 'Alt';
  const keyName = k => k.replace(/^KEY_/, '').replace(/^LEFT(CTRL|SHIFT|ALT|META)$/, '$1').replace(/^RIGHT(CTRL|SHIFT|ALT|META)$/, '$1').replace('META', META()).replace(/^ALT$/, ALT()).replace('CTRL', 'Ctrl').replace('SHIFT', 'Shift').replace('ALT', 'Alt').replace(/^([A-Z])$/, '$1').replace(/^([A-Z][A-Z]+)$/, m => m.charAt(0) + m.slice(1).toLowerCase());
  // what the agent calls another tool, as people know it
  const toolName = n => ({ solaar: 'Solaar', logid: 'logid', logioptionsplus_agent: 'Logi Options+', 'Logi Options+': 'Logi Options+', LogiOptions: 'Logitech Options', LogiOptionsMgr: 'Logitech Options',
    LogiMgrDaemon: 'Logitech Options', SetPoint: 'SetPoint', 'LGHUB Agent': 'G HUB', lghub_agent: 'G HUB' })[n] || n;
  const agentNeedsBuild = () => !S.connected && !!S.agentInfo && !S.agentInfo.binary && !!S.agentInfo.canBuild;
  const batIcon = b => !b ? 'fa-battery-empty' : b.percent > 80 ? 'fa-battery-full' : b.percent > 55 ? 'fa-battery-three-quarters' : b.percent > 30 ? 'fa-battery-half' : b.percent > 10 ? 'fa-battery-quarter' : 'fa-battery-empty';
  const batClass = b => !b ? '' : b.charging ? 'ok' : b.percent <= 10 ? 'err' : b.percent <= 20 ? 'warn' : 'ok';
  const CID = { middle: 82, back: 83, forward: 86, gesture: 195, mode: 196 };

  // ------------------------------------------------------------ recorder
  const CODE_MAP = { ControlLeft: 'KEY_LEFTCTRL', ControlRight: 'KEY_RIGHTCTRL', ShiftLeft: 'KEY_LEFTSHIFT', ShiftRight: 'KEY_RIGHTSHIFT',
    AltLeft: 'KEY_LEFTALT', AltRight: 'KEY_RIGHTALT', MetaLeft: 'KEY_LEFTMETA', MetaRight: 'KEY_RIGHTMETA', OSLeft: 'KEY_LEFTMETA', OSRight: 'KEY_RIGHTMETA',
    Space: 'KEY_SPACE', Enter: 'KEY_ENTER', Tab: 'KEY_TAB', Backspace: 'KEY_BACKSPACE', Delete: 'KEY_DELETE', Insert: 'KEY_INSERT',
    Home: 'KEY_HOME', End: 'KEY_END', PageUp: 'KEY_PAGEUP', PageDown: 'KEY_PAGEDOWN', ArrowUp: 'KEY_UP', ArrowDown: 'KEY_DOWN', ArrowLeft: 'KEY_LEFT', ArrowRight: 'KEY_RIGHT',
    Minus: 'KEY_MINUS', Equal: 'KEY_EQUAL', BracketLeft: 'KEY_LEFTBRACE', BracketRight: 'KEY_RIGHTBRACE', Backslash: 'KEY_BACKSLASH', Semicolon: 'KEY_SEMICOLON',
    Quote: 'KEY_APOSTROPHE', Backquote: 'KEY_GRAVE', Comma: 'KEY_COMMA', Period: 'KEY_DOT', Slash: 'KEY_SLASH', CapsLock: 'KEY_CAPSLOCK', PrintScreen: 'KEY_SYSRQ',
    ScrollLock: 'KEY_SCROLLLOCK', Pause: 'KEY_PAUSE', ContextMenu: 'KEY_COMPOSE', NumLock: 'KEY_NUMLOCK', NumpadAdd: 'KEY_KPPLUS', NumpadSubtract: 'KEY_KPMINUS',
    NumpadMultiply: 'KEY_KPASTERISK', NumpadDivide: 'KEY_KPSLASH', NumpadEnter: 'KEY_KPENTER', NumpadDecimal: 'KEY_KPDOT', AudioVolumeUp: 'KEY_VOLUMEUP',
    AudioVolumeDown: 'KEY_VOLUMEDOWN', AudioVolumeMute: 'KEY_MUTE', MediaPlayPause: 'KEY_PLAYPAUSE', MediaTrackNext: 'KEY_NEXTSONG', MediaTrackPrevious: 'KEY_PREVIOUSSONG', IntlBackslash: 'KEY_102ND' };
  const MODS = new Set(['KEY_LEFTCTRL', 'KEY_RIGHTCTRL', 'KEY_LEFTSHIFT', 'KEY_RIGHTSHIFT', 'KEY_LEFTALT', 'KEY_RIGHTALT', 'KEY_LEFTMETA', 'KEY_RIGHTMETA']);
  function codeToKey(code) {
    let m;
    if ((m = /^Key([A-Z])$/.exec(code))) return 'KEY_' + m[1];
    if ((m = /^Digit(\d)$/.exec(code))) return 'KEY_' + m[1];
    if ((m = /^F(\d{1,2})$/.exec(code))) return 'KEY_F' + m[1];
    if ((m = /^Numpad(\d)$/.exec(code))) return 'KEY_KP' + m[1];
    return CODE_MAP[code] || null;
  }
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
    if (agentGrab) { agentGrab = false; recordDone = recordPartial = null; window.agent.call('record_cancel').catch(() => {}); }
    if (!recorder) return;
    document.removeEventListener('keydown', recorder.onDown, true);
    document.removeEventListener('keyup', recorder.onUp, true);
    window.removeEventListener('blur', recorder.onBlur);
    recorder = null;
  }
  function recorderActive() { return !!recorder || agentGrab || armPending; }

  // ------------------------------------------------------------ helpers
  const sw = (on, attrs = '') => `<button class="switch ${on ? 'on' : ''}" ${attrs}></button>`;
  // a check box that toggles like a switch (same 'on' class, same handlers)
  const chk = (on, attrs = '') => `<button class="chk ${on ? 'on' : ''}" ${attrs}><i class="fa-solid fa-check"></i></button>`;
  const sec = (title, body, meta = '') => `<div class="sec"><div class="sec-title"><span>${esc(title)}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</div>${body}</div>`;
  const card = rows => `<div class="card">${rows}</div>`;
  const row = (label, sub, right, cls = '') => `<div class="row ${cls}"><div class="grow"><div class="lbl">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${right}</div>`;
  const drop = (a, attrs = '') => `<button class="drop" ${attrs}><i class="fa-solid ic ${actionIcon(a)}"></i>${esc(presetLabel(a))}<i class="fa-solid fa-chevron-down chev"></i></button>`;
  const range = (attrs, val, min, max, step) => `<input type="range" ${attrs} min="${min}" max="${max}" step="${step}" value="${val}" style="width:160px">`;
  const setSetting = async (d, path, value) => { const st = await call('set_setting', { id: d.id, path, value }); d.state = st; let x = d.config.settings || (d.config.settings = {}); for (const p of path.slice(0, -1)) { x[p] = x[p] || {}; x = x[p]; } x[path[path.length - 1]] = value; };
  const setGeneral = async patch => { try { S.general = await call('set_general', patch); } catch (e) { Object.assign(S.general, patch); } window.agent.generalChanged(); };
  const setAssign = async (d, section, control, action, profile) => { merge(await call('set_assignment', { id: d.id, profile: profile || 'default', section, control: section === 'thumbwheel' ? '' : String(control), action })); };

  // ------------------------------------------------------------- nav
  const PAGES = {
    buttons: ['Buttons', 'fa-computer-mouse'], gestures: ['Gestures & action ring', 'fa-hand-pointer'], pointer: ['Point & scroll', 'fa-arrow-pointer'], thumb: ['Thumb wheel', 'fa-arrows-left-right'],
    haptics: ['Haptic feedback', 'fa-wave-square'], easy: ['Easy-Switch', 'fa-right-left'], info: ['Battery & info', 'fa-battery-three-quarters'], keys: ['Keys', 'fa-keyboard'], backlight: ['Backlight', 'fa-lightbulb'],
    home: ['Home', 'fa-house'], apps: ['Profiles', 'fa-layer-group'], ring: ['Action ring', 'fa-circle-notch'], notif: ['Notifications', 'fa-bell'], backup: ['Backup & sync', 'fa-cloud-arrow-down'], settings: ['Settings', 'fa-sliders'], about: ['About', 'fa-circle-info'], flow: ['Flow', 'fa-diagram-project'],
  };
  const devicePages = d => isMouse(d) ? ['buttons', 'gestures', 'pointer'].concat((d.state || {}).haptic ? ['haptics'] : [], ['easy', 'flow', 'info']) : ['keys', 'backlight', 'easy', 'flow', 'info'];
  // what the device's left bar lists; the other device pages (Gestures, opened from a button set to
  // gestures, and the MX Master 4's haptics, folded into Settings) are reached from these
  const navPages = d => isMouse(d) ? ['buttons', 'pointer', 'easy', 'flow'] : ['keys', 'backlight', 'easy', 'flow'];
  const generalPagesAll = ['apps', 'ring', 'notif', 'backup', 'settings', 'about'];
  const generalPages = () => S.devices.some(isMouse) ? generalPagesAll.filter(p => p !== 'ring') : generalPagesAll;
  function go(page, devId) { if (page !== 'gestures') S.cfgFrom = null; S.page = page; if (devId !== undefined) S.dev = devId; S.dlg = null; S.menu = null; S.appDetail = null; render(); }

  // ============================================================ render
  // Animations run when something new appears, not on every refresh: the page when it is
  // navigated to, the dialog when it opens. A refresh of the same page redraws it in place.
  let lastPageKey = null, lastDlg = null, lastNavKey = null, lastDrawer = false;
  function render() {
    stopRecorder();
    document.documentElement.setAttribute('data-theme', S.theme);
    const pageKey = `${S.mode}|${S.page}|${S.dev}|${S.appDetail ? S.appDetail.key : ''}|${S.devices.length ? 1 : 0}`;
    const pageChanged = pageKey !== lastPageKey; lastPageKey = pageKey;
    // coming back to the panel from a prompt over it is not a new opening
    const dlgOpened = !!S.dlg && S.dlg !== lastDlg && !(S.dlg === 'picker' && lastDlg === 'prompt'); lastDlg = S.dlg;
    let html = '';
    if (S.mode === 'onboard') html = renderOnboard();
    else if (!S.devices.length) html = renderEmpty();
    else html = renderWindow();
    html += renderDialog();
    // a key's panel or a settings panel (Backlight, Point & scroll): either one sends the page list out
    const panelOn = () => !!(drawerUp()) || (S.page !== 'home' && backlightPanel(dev()));
    const drawerWill = panelOn();
    const moving = drawerWill !== lastDrawer ? root.querySelector('.dev-config .content > .page > :first-child') : null;
    const from = moving ? moving.getBoundingClientRect() : null;
    root.innerHTML = html;
    if (pageChanged) { const pg = root.querySelector('.content > .page'); if (pg) { pg.classList.add('enter'); pg.querySelectorAll('.fkeys .fkey').forEach((k, i) => k.style.setProperty('--k', i)); } }
    if (dlgOpened) { const sc = root.querySelector(S.dlg === 'picker' ? '.scrim, .drawer-wrap' : '.scrim'); if (sc) sc.classList.add('enter'); }
    // the page list slides in when a device is opened, not when moving between its pages
    const dn = root.querySelector('.dnav'), navKey = dn ? 'dev|' + S.dev : null;
    if (dn && navKey !== lastNavKey) dn.classList.add('enter');
    lastNavKey = navKey;
    // opening a key's panel sends the page list out to the left; closing it brings the list back in
    const drawerNow = panelOn();
    if (dn && drawerNow && !lastDrawer) { dn.classList.add('leaving'); const w = root.querySelector('.devview2.panel-open .drawer-wrap'); if (w) w.classList.add('enter'); }
    if (dn && !drawerNow && lastDrawer) dn.classList.add('nav-back');
    lastDrawer = drawerNow;
    alignToNav();
    if (from) glideFrom(from, root.querySelector('.dev-config .content > .page > :first-child'));
    bind();
    keyTips();
    ringDrag();
    // with a key's panel open, a click anywhere else in the middle closes it (another key opens that one)
    const mid = root.querySelector('.devview2.drawer-open:not(.panel-open) .dev-config');
    if (mid) mid.addEventListener('click', e => { if (!e.target.closest('.hotspot, .ms-lab, .cfg-top, [data-act], input, select')) closeDrawer(); });
    // the backlight panel closes the same way: a click anywhere outside it (BACKLIGHT opens it again)
    const blMid = root.querySelector('.devview2.panel-open .dev-config');
    if (blMid) blMid.addEventListener('click', e => { if (!e.target.closest('.cfg-top, .bl-pin, .hotspot, .ms-lab')) closeDrawer(() => { S.blClosed = true; }); });
  }
  // The keyboard moves and resizes when the panel opens or closes: draw it where it was and let it
  // glide to its new place, instead of snapping.
  function glideFrom(from, el) {
    if (!el || !from.width || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = el.getBoundingClientRect();
    if (!to.width) return;
    el.style.transition = 'none';
    el.style.transformOrigin = '0 0';
    el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
    void el.offsetWidth;   // commit the starting place before asking for the move
    el.style.transition = 'transform .38s cubic-bezier(.2, 0, 0, 1)';
    el.style.transform = 'none';
    setTimeout(() => { el.style.transition = ''; el.style.transform = ''; el.style.transformOrigin = ''; }, 420);
  }
  // The key panel leaves to the right, easing in, and only then does the page list come back
  function closeDrawer(after) {
    const w = root.querySelector('.drawer-wrap');
    if (!w) { S.dlg = null; if (after) after(); render(); return; }
    if (w.classList.contains('closing')) return;
    stopRecorder();
    w.classList.add('closing');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { S.dlg = null; if (after) after(); render(); }, reduce ? 0 : 170);
  }
  // hovering a key on the photo shows its name and what it does now
  // On the ring page an action can be dragged from the panel straight onto any slot of the ring
  function ringDrag() {
    const slotsEls = root.querySelectorAll('.rs-chip, .rs-lab');
    if (!slotsEls.length || !(S.picker && S.picker.drawer && S.picker.section === 'ring')) return;
    root.querySelectorAll('.drawer [data-act="pick-item"], .drawer [data-act="pick-key"], .drawer .kc').forEach(el => {
      el.draggable = true;
      el.ondragstart = e => {
        const a = el.dataset.act === 'pick-key' ? { type: 'keystroke', keys: [el.dataset.key] } : el.dataset.key;
        e.dataTransfer.setData('application/x-logimx-action', JSON.stringify(a));
        e.dataTransfer.effectAllowed = 'copy';
        document.body.classList.add('dragging-act');
      };
      el.ondragend = () => { document.body.classList.remove('dragging-act'); root.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); };
    });
    slotsEls.forEach(t => {
      const i = Number(t.dataset.cid), pair = () => root.querySelectorAll(`.rs-chip[data-cid="${i}"], .rs-lab[data-cid="${i}"]`);
      t.ondragover = e => { if (!e.dataTransfer.types.includes('application/x-logimx-action')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; pair().forEach(x => x.classList.add('drop')); };
      t.ondragleave = () => pair().forEach(x => x.classList.remove('drop'));
      t.ondrop = async e => {
        e.preventDefault();
        let a; try { a = JSON.parse(e.dataTransfer.getData('application/x-logimx-action')); } catch (x) { return; }
        const slots = ringSlots();
        slots[i] = { action: a, label: presetLabel(a), icon: actionIcon(a) };
        await saveRingSlots(slots);
        document.body.classList.remove('dragging-act');
        const p = S.picker; p.cid = i; p.label = RING_DIRS[i]; p.current = a; p.sel = null; p.selKey = null;
        render(); toast(`Slot ${i + 1}: ${presetLabel(a)}`);
      };
    });
  }
  let lastPin = null;
  function keyTips() {
    const tip = root.querySelector('.kb-tip'), wrap = tip && tip.parentElement;
    if (!tip || !wrap) return;
    wrap.querySelectorAll('.hotspot[data-name]').forEach(g => {
      g.onmouseenter = () => {
        tip.innerHTML = `<span class="k">${esc(g.dataset.name)}</span><span class="d ${g.dataset.custom ? 'custom' : ''}">${esc(g.dataset.does)}</span>`;
        const r = g.getBoundingClientRect(), pr = wrap.getBoundingClientRect();
        tip.hidden = false;
        tip.style.left = Math.round(r.left + r.width / 2 - pr.left) + 'px';
        tip.style.top = Math.round(r.top - pr.top - 10) + 'px';
      };
      g.onmouseleave = () => { tip.hidden = true; };
    });
    // the key being edited keeps its label pinned above it, placed in the photo's own coordinates
    // so it rides along when the keyboard glides aside for the panel
    const sel = wrap.querySelector('.hotspot.selected[data-name]'), svg = sel && sel.ownerSVGElement, box = svg && svg.parentElement;
    if (sel && box) {
      const vb = svg.viewBox.baseVal, r = sel.querySelector('rect, circle'), b = r.getBBox();
      const pin = document.createElement('div');
      const pinKey = sel.dataset.cid; pin.className = 'kb-pin' + (pinKey === lastPin ? ' still' : ''); lastPin = pinKey;
      pin.innerHTML = `<span class="k">${esc(sel.dataset.name)}</span><span class="d ${sel.dataset.custom ? 'custom' : ''}">${esc(sel.dataset.does)}</span>`;
      pin.style.left = ((b.x + b.width / 2) / vb.width * 100) + '%';
      pin.style.top = (b.y / vb.height * 100) + '%';
      box.appendChild(pin);
      sel.onmouseenter = null;
    } else lastPin = null;
  }
  // In a device's view the page starts level with the first item of the list on the left (the
  // keyboard lines up with KEYS); the list is centred in its column, so this is measured. The
  // scrolling area is measured rather than the page, which may be mid-animation.
  function alignToNav() {
    const first = root.querySelector('.dnav nav > .dnav-item'), box = root.querySelector('.dev-config .content'), page = box && box.querySelector(':scope > .page');
    if (!first || !page) return;
    // the device's Settings page runs from the top of the window, not from KEYS
    if (box.closest('.dev-config.full')) { page.style.paddingTop = '0px'; return; }
    const pad = parseFloat(getComputedStyle(box).paddingTop) || 0, origin = box.getBoundingClientRect().top + pad;
    let target = first.getBoundingClientRect().top;
    // the keyboard is centred on the list rather than lined up with its top
    const kb = page.firstElementChild && page.firstElementChild.classList.contains('kb-photo') ? page.firstElementChild : null;
    if (kb) {
      const items = root.querySelectorAll('.dnav nav > .dnav-item'), last = items[items.length - 1].getBoundingClientRect();
      target = (first.getBoundingClientRect().top + last.bottom) / 2 - kb.getBoundingClientRect().height / 2;
    }
    page.style.paddingTop = Math.max(0, Math.round(target - origin)) + 'px';
    // and across: the keyboard sits with as much space on its right as between it and the list
    if (kb && !root.querySelector('.devview2.drawer-open')) {
      kb.style.position = 'relative'; kb.style.left = '0px';
      const navRight = Math.max(...[...root.querySelectorAll('.dnav nav > .dnav-item')].map(b => b.getBoundingClientRect().right));
      const r = kb.getBoundingClientRect(), edge = box.getBoundingClientRect().right;
      const gap = (edge - navRight - r.width) / 2;
      kb.style.left = Math.round(navRight + gap - r.left) + 'px';
    }
  }

  function renderWindow() {
    const d = dev();
    const devPage = !S.appDetail && d && S.page !== 'home' && (devicePages(d).includes(S.page) || S.page === 'thumb');
    const mode = S.appDetail ? 'general' : S.page === 'home' ? 'home' : devPage ? 'device' : 'general';
    const title = S.appDetail ? (S.appDetail.name || 'Application') : mode === 'device' ? d.name : (PAGES[S.page] ? PAGES[S.page][0] : 'LogiMX');
    const conflict = !S.conflictDismissed && S.conflicts.length && ['buttons', 'gestures', 'keys'].includes(S.page);
    const cname = conflict ? S.conflicts[0].name : '';
    const left = mode === 'home'
      ? `<span class="hello">${greeting()}</span>`
      : `<button class="hbtn icon" data-act="${S.appDetail ? 'back-apps' : 'go-home'}" title="${S.appDetail ? 'Back' : 'Home'}"><i class="fa-solid fa-arrow-left"></i></button>`;
    const agentDown = !S.connected ? `<div class="banner"><i class="fa-solid fa-plug-circle-xmark"></i><span>${S.agentBusy ? 'Starting the agent…' : '<strong>The agent is not running.</strong> Settings cannot reach the devices.'}</span>${S.agentBusy ? '' : '<button class="bact" data-act="start-agent">Start</button>'}</div>` : '';
    // a keyboard's own view keeps the corner to one action: add an application profile
    const controls = mode === 'device' ? `<div class="right">
            <button class="hbtn soon-btn" disabled title="Coming soon: settings for a specific application"><i class="fa-solid fa-plus"></i>Add application<span class="soon-tag">Soon</span></button>
            <button class="hbtn close" data-act="win-close" title="Close to tray"><i class="fa-solid fa-xmark"></i></button>
          </div>` : `<div class="right">
            ${mode === 'home' ? `<button class="hbtn accent" data-act="pair" title="Pair a new device with a receiver or Bluetooth"><i class="fa-solid fa-plus"></i>Add device</button>` : ''}
            <button class="hbtn icon ${S.page === 'settings' ? 'on' : ''}" data-act="page" data-page="settings" title="Settings"><i class="fa-solid fa-gear"></i></button>
            <div style="position:relative"><button class="hbtn icon" data-act="menu-theme" title="Theme"><i class="fa-solid fa-circle-half-stroke"></i></button>${S.menu === 'theme' ? themeMenu() : ''}</div>
            <div style="position:relative"><button class="hbtn icon" data-act="menu-main" title="More"><i class="fa-solid fa-ellipsis-vertical"></i></button>${S.menu === 'main' ? mainMenu() : ''}</div>
            <button class="hbtn close" data-act="win-close" title="Close to tray"><i class="fa-solid fa-xmark"></i></button>
          </div>`;
    let body;
    if (mode === 'device') {
      const tabs = devicePages(d).map(p => `<button class="tab ${S.page === p || (p === 'buttons' && S.page === 'thumb') ? 'on' : ''}" data-act="home-page" data-key="${esc(d.id)}" data-page="${p}"><i class="fa-solid ${PAGES[p][1]}"></i>${PAGES[p][0]}</button>`).join('');
      // the device's pages listed down the left (the first is open by default) with Settings at the
      // foot; the page itself on the right under the window buttons
      // Easy-Switch is not ready yet: listed, dimmed, marked Soon, and not clickable
      const items = navPages(d).map(p => p === 'easy' ? `<button class="dnav-item soon" disabled title="Coming soon"><i class="fa-solid ${PAGES[p][1]}"></i>${PAGES[p][0]}<span class="soon-tag">Soon</span></button>` : `<button class="dnav-item ${S.page === p || (p === 'buttons' && ['thumb', 'gestures'].includes(S.page)) ? 'on' : ''}" data-act="home-page" data-key="${esc(d.id)}" data-page="${p}"><i class="fa-solid ${PAGES[p][1]}"></i>${PAGES[p][0]}</button>`).join('');
      const drawer = drawerUp(), blp = !drawer && backlightPanel(d);
      body = `<div class="devview2 ${drawer || blp ? 'drawer-open' : ''} ${blp ? 'panel-open' : ''}"><aside class="dnav"><div class="cfg-back"><button class="hbtn icon" data-act="go-home" title="Home"><i class="fa-solid fa-arrow-left"></i></button><span class="cfg-name">${esc(d.name)}</span></div><nav>${items}<button class="dnav-item ${S.page === 'info' ? 'on' : ''}" data-act="home-page" data-key="${esc(d.id)}" data-page="info"><i class="fa-solid fa-sliders"></i>Settings</button></nav>${navBattery(d)}</aside><section class="dev-config solo ${S.page === 'info' ? 'full' : ''}"><div class="cfg-top">${controls}</div><div class="content"><div class="page">${renderPage(d)}</div></div></section>${drawer ? renderPicker() : blp ? (S.page === 'pointer' ? renderPointerPanel(d) : renderBacklightPanel(d)) : ''}</div>`;
    } else {
      body = `<div class="content ${mode === 'home' ? 'landing' : ''}"><div class="page">${renderPage(d)}</div></div>${mode === 'home' ? `<footer class="agent-line ${S.connected ? '' : 'off'}"><i class="fa-solid fa-circle"></i>${S.connected ? 'Agent connected' : 'Agent not running'} · v${S.status.version || VERSION}</footer>` : ''}`;
    }
    return `<div class="window">
      <main class="main">
        ${mode === 'device' ? '' : `<header class="hb">
          <div class="left">${left}</div>
          <span class="title">${mode === 'home' ? '' : esc(title)}</span>
          ${controls}
        </header>`}
        ${agentDown}
        ${conflict ? `<div class="banner"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>${esc(toolName(cname))} is running.</strong> Both programs divert the same buttons; only one will win.</span><button class="bact" data-act="stop-tool" data-tool="${esc(cname)}">Stop ${esc(toolName(cname))}</button><button class="x" data-act="dismiss-conflict"><i class="fa-solid fa-xmark"></i></button></div>` : ''}
        ${body}
      </main></div>`;
  }
  // The device itself, on the left of its settings: photo (the mouse with its numbered buttons),
  // battery, state, link and profile, and a way across to the other devices.
  function devicePanel(d) {
    const b = d.battery, st = batteryState(b), src = devicePhotoSrc(d);
    const hosts = (d.state || {}).hosts, host = hosts && typeof hosts.current === 'number' ? `host ${hosts.current + 1}` : '';
    const link = (d.transport === 'bolt' ? 'Bolt receiver' : d.transport === 'bluetooth' ? 'Bluetooth' : d.transport || 'Connected') + (host ? ` · ${host}` : '');
    const profName = d.profile && d.profile !== 'default' ? (((d.config || {}).profiles || {})[d.profile] || {}).name || d.profile : 'All applications';
    const photo = isMouse(d) && MOUSE_PHOTOS[d.id] ? `<div class="photo-card">${mousePhoto(d)}</div>` : src ? `<img src="${esc(src)}" alt="">` : `<i class="fa-solid ${isMouse(d) ? 'fa-computer-mouse' : 'fa-keyboard'} none"></i>`;
    const others = S.devices.filter(x => x.id !== d.id);
    return `<aside class="dev-panel ${isMouse(d) ? 'mouse' : 'kbd'}">
      <div class="panel-top"><button class="hbtn icon" data-act="go-home" title="Home"><i class="fa-solid fa-arrow-left"></i></button><span class="panel-title">${esc(d.name)}</span></div>
      <div class="dev-hero">${photo}</div>
      <div class="dev-top"><div class="grow"><div class="dev-name">${esc(d.name)}</div><div class="dev-sub"><i class="${d.transport === 'bluetooth' ? 'fa-brands fa-bluetooth-b' : 'fa-solid fa-wifi'}"></i>${esc(link)}</div></div>${batteryRing(b)}</div>
      <div class="dev-state ${st.cls}"><i class="fa-solid ${st.icon}"></i>${esc(st.label)}</div>
      <div class="dev-meta"><span><i class="fa-solid fa-layer-group"></i>${esc(profName)}</span>${d.firmware ? `<span><i class="fa-solid fa-microchip"></i>${esc(d.firmware)}</span>` : ''}</div>
      ${isMouse(d) && MOUSE_PHOTOS[d.id] ? '<div class="hint">Click a number to change what that button does.</div>' : ''}
      ${others.length ? `<div class="dev-others"><div class="sec-title"><span>Other devices</span></div>${others.map(x => `<button class="other" data-act="home-open" data-key="${esc(x.id)}"><i class="fa-solid ${isMouse(x) ? 'fa-computer-mouse' : 'fa-keyboard'}"></i><span class="grow">${esc(x.name)}</span>${x.battery ? `<span class="${batClass(x.battery)}">${x.battery.percent}%${x.battery.charging ? ' <i class="fa-solid fa-bolt"></i>' : ''}</span>` : ''}</button>`).join('')}</div>` : ''}
    </aside>`;
  }
  const THEMES = [['light', 'Light', 'linear-gradient(135deg,#fff 50%,#3584e4 50%)'], ['dark', 'Dark', 'linear-gradient(135deg,#222 50%,#3584e4 50%)'], ['ubuntu', 'Ubuntu', 'linear-gradient(135deg,#fafafa 50%,#e95420 50%)'], ['ubuntu-dark', 'Ubuntu dark', 'linear-gradient(135deg,#2c2c2c 50%,#e95420 50%)']];
  const themeMenu = () => `<div class="menu" data-menu><div class="mhead">Appearance</div>${THEMES.map(([k, l, s]) => `<button data-act="theme" data-key="${k}"><span class="swatch" style="background:${s}"></span><span>${l}</span>${S.theme === k ? '<i class="fa-solid fa-check chk"></i>' : ''}</button>`).join('')}</div>`;
  const mainMenu = () => `<div class="menu" data-menu>
    <button data-act="export"><i class="fa-solid fa-download"></i>Export settings…</button>
    <button data-act="import"><i class="fa-solid fa-upload"></i>Import settings…</button>
    <button data-act="pair"><i class="fa-solid fa-plus"></i>Pair a device…</button>
    <button data-act="pause"><i class="fa-solid ${S.status.paused ? 'fa-play' : 'fa-pause'}"></i>${S.status.paused ? 'Resume diversion' : 'Pause diversion'}</button>
    <div class="sep"></div>
    <button data-act="page" data-page="apps"><i class="fa-solid fa-layer-group"></i>Profiles</button>
    ${S.devices.some(isMouse) ? '' : '<button data-act="page" data-page="ring"><i class="fa-solid fa-circle-notch"></i>Action ring</button>'}
    <button data-act="page" data-page="notif"><i class="fa-solid fa-bell"></i>Notifications</button>
    <button data-act="page" data-page="backup"><i class="fa-solid fa-cloud-arrow-down"></i>Backup & sync</button>
    <button data-act="page" data-page="settings"><i class="fa-solid fa-sliders"></i>Settings</button>
    <button data-act="page" data-page="about"><i class="fa-solid fa-circle-info"></i>About LogiMX</button>
    <div class="sep"></div>
    <button data-act="quit"><i class="fa-solid fa-power-off"></i>Quit</button></div>`;

  function renderPage(d) {
    if (S.appDetail) return pageAppDetail(S.appDetail);
    switch (S.page) {
      case 'buttons': return d ? pageButtons(d) : '';
      case 'gestures': return d ? pageGestures(d) : '';
      case 'pointer': return d ? pagePointer(d) : '';
      case 'haptics': return d ? pageHaptics(d) : '';
      case 'thumb': return d ? pageButtons(d) : '';   // merged into Buttons
      case 'easy': return d ? pageEasy(d) : '';
      case 'info': return d ? pageDeviceSettings(d) + (isMouse(d) && (d.state || {}).haptic ? pageHaptics(d) : '') + pageInfo(d) : '';   // the device's Settings (the app's own are under the sliders icon)
      case 'keys': return d ? pageKeys(d) : '';
      case 'backlight': return d ? pageBacklight(d) : '';
      case 'home': return pageHome();
      case 'apps': return pageApps();
      case 'ring': return pageRing();
      case 'notif': return pageNotif();
      case 'flow': return d ? pageFlow() : '';
      case 'backup': return pageBackup();
      case 'settings': return pageSettings();
      case 'about': return pageAbout();
    }
    return '';
  }

  // ----------------------------------------------------------- photos
  // One photo per mouse model, keyed by device id like the keyboards. A spot is a control id (or
  // 'thumb' for the thumb wheel) and where it is on the photo; its number is the row it has on the
  // Buttons page, so the two always agree. A mouse without an entry shows the rows only.
  const MOUSE_PHOTOS = (() => {
    const s3 = { src: '../assets/devices/b034.png', w: 1021, h: 1644, pt: [['wheel', 690, 300], ['thumb', 520, 770], ['pointer', 640, 1250]], spots: [[82, 690, 300], [196, 815, 590], [86, 357, 707], ['thumb', 520, 770], [83, 450, 975], [195, 82, 954]] };
    const m4 = { src: '../assets/devices/b042.png', w: 1021, h: 1594, pt: [['wheel', 771, 303], ['thumb', 577, 899], ['pointer', 700, 1220]], spots: [[82, 771, 303], [196, 822, 630], [195, 394, 575], [86, 434, 749], [83, 483, 956], ['thumb', 577, 899], [416, 310, 779]] };
    return { b034: s3, b035: s3, b043: s3, b042: m4, b048: m4 };
  })();
  const buttonRows = d => PHYS.filter(([cid]) => d.controls.some(c => c.cid === cid));
  // The mouse photo: a ring on each button and its name beside it, on the side away from the mouse.
  // A ring opens that button's panel (like a key on the keyboard); the one being edited is filled.
  function mousePhoto(d, plain) {
    const P = MOUSE_PHOTOS[d.id];
    if (!P) return '';
    if (plain) return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/></svg>`;
    const order = buttonRows(d).map(([cid]) => cid);
    const editing = k => drawerUp() && String(S.picker.cid) === String(k);
    const shown = P.spots.filter(([k]) => k === 'thumb' ? d.controls.length : order.includes(k));
    const spots = shown.map(([k, x, y]) => {
      const a = k === 'thumb' ? assignment(d, 'thumbwheel') : assignment(d, 'buttons', k);
      const nm = k === 'thumb' ? 'Thumb wheel' : ((PHYS.find(x => x[0] === k) || [])[1] || (d.controls.find(c => c.cid === k) || {}).label || 'Button');
      return `<g class="hotspot ms ${editing(k) ? 'selected' : ''}" data-section="${k === 'thumb' ? 'thumbwheel' : 'buttons'}" data-cid="${k}" data-name="${esc(nm)}" data-does="${esc(presetLabel(a))}" data-custom="${isNative(a) ? '' : '1'}"><circle class="ring" cx="${x}" cy="${y}" r="40"/></g>`;
    }).join('');
    // names sit in two columns just outside the photo, each joined to its ring by a thin line; on
    // each side they are spaced so none overlaps the one above
    const GAP = 150, place = {};
    for (const side of ['l', 'r']) {
      let prev = -Infinity;
      shown.filter(([, x]) => (x < P.w / 2) === (side === 'l')).sort((p, q) => p[2] - q[2]).forEach(([k, , y]) => { const ly = Math.max(y, prev + GAP); place[k] = ly; prev = ly; });
    }
    const lines = shown.map(([k, x, y]) => { const left = x < P.w / 2, ly = place[k]; return `<polyline class="ms-line ${editing(k) ? 'on' : ''}" points="${left ? x - 40 : x + 40},${y} ${left ? -20 : P.w + 20},${ly}"/>`; }).join('');
    const labels = shown.map(([k, x]) => {
      const a = k === 'thumb' ? assignment(d, 'thumbwheel') : assignment(d, 'buttons', k);
      const nm = k === 'thumb' ? 'Thumb wheel' : ((PHYS.find(x => x[0] === k) || [])[1] || (d.controls.find(c => c.cid === k) || {}).label || 'Button');
      const left = x < P.w / 2;
      return `<div class="ms-lab ${left ? 'l' : 'r'} ${editing(k) ? 'on' : ''} ${isNative(a) ? '' : 'custom'}" data-ring="${k}" style="top:${(place[k] / P.h * 100).toFixed(2)}%"><span class="k">${esc(nm)}</span><span class="d">${esc(presetLabel(a))}</span></div>`;
    }).join('');
    return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${lines}${spots}</svg>${labels}`;
  }
  // One photo per keyboard model, keyed by the device id the agent uses (its product id in hex:
  // the Bluetooth pid, or the receiver-side pid when it comes through a receiver). Each spot is a
  // control id with the centre of its key cap in photo pixels; only the controls the connected
  // keyboard reports are drawn. A keyboard with no entry here gets no photo, only the key tiles.
  const KEYBOARD_PHOTOS = (() => {
    const s = { src: '../assets/devices/b378.png', w: 2596, h: 800, kw: 99, kh: 75, spots: [[199, 288, 142], [200, 402, 142], [226, 517, 142], [227, 632, 142], [259, 749, 143], [264, 862, 142], [284, 976, 142], [228, 1090, 142], [229, 1206, 142], [230, 1320, 142], [231, 1433, 142], [232, 1547, 142], [233, 1663, 142], [10, 2157, 142], [266, 2274, 142], [234, 2388, 142], [111, 2503, 142]] };
    const keys = { src: '../assets/devices/b35b.png', w: 2004, h: 618, kw: 76, kh: 57, spots: [[199, 222, 109], [200, 310, 109], [224, 399, 109], [225, 488, 109], [110, 575, 109], [226, 665, 109], [227, 753, 109], [228, 842, 109], [229, 931, 109], [230, 1019, 109], [231, 1108, 109], [232, 1194, 109], [233, 1284, 109], [10, 1665, 109], [191, 1755, 109], [234, 1844, 109], [111, 1932, 109]] };
    const mac = { src: '../assets/devices/b361.png', w: 2004, h: 618, kw: 76, kh: 57, spots: [[199, 222, 109], [200, 310, 109], [224, 399, 109], [225, 488, 109], [226, 575, 109], [227, 665, 109], [228, 753, 109], [229, 842, 109], [230, 931, 109], [231, 1019, 109], [232, 1108, 109], [233, 1194, 109], [13, 1284, 109], [10, 1665, 109], [191, 1755, 109], [234, 1844, 109], [111, 1932, 109]] };
    const business = { src: '../assets/devices/b363.png', w: 2004, h: 618, kw: 76, kh: 57, spots: [[199, 222, 109], [200, 310, 109], [226, 399, 109], [227, 488, 109], [259, 575, 109], [264, 665, 109], [284, 753, 109], [228, 842, 109], [229, 931, 109], [230, 1019, 109], [231, 1108, 109], [232, 1194, 109], [233, 1284, 109], [10, 1665, 109], [266, 1755, 109], [234, 1844, 109], [111, 1932, 109]] };
    const mini = { src: '../assets/devices/b369.png', w: 1382, h: 616, kw: 77, kh: 58, spots: [[226, 424, 114], [227, 513, 114], [259, 602, 114], [264, 689, 114], [266, 778, 114], [284, 866, 114], [229, 955, 114], [231, 1043, 114], [232, 1132, 114], [233, 1220, 114]] };
    const miniMac = { src: '../assets/devices/b36a.png', w: 1634, h: 725, kw: 91, kh: 68, spots: [[226, 498, 125], [227, 604, 125], [259, 709, 125], [264, 815, 125], [266, 918, 125], [284, 1023, 125], [229, 1129, 125], [231, 1233, 125], [232, 1338, 125], [233, 1444, 125], [285, 1548, 125]] };
    const miniBusiness = { src: '../assets/devices/b36e.png', w: 1382, h: 616, kw: 77, kh: 58, spots: [[226, 424, 114], [227, 513, 114], [259, 602, 114], [264, 689, 114], [266, 778, 114], [284, 866, 114], [229, 955, 114], [231, 1043, 115], [232, 1132, 114], [233, 1220, 114]] };
    return { b378: s, b379: s, b37a: s, b35b: keys, '408a': keys, b361: mac, '4092': mac, b363: business, b369: mini, b36e: miniBusiness, b36a: miniMac };
  })();
  function keyboardPhoto(d, plain) {
    const P = KEYBOARD_PHOTOS[d.id];
    if (!P) return '';
    const hot = plain ? '' : P.spots.filter(([cid]) => d.controls.some(c => c.cid === cid)).map(([cid, x, y]) => {
      const a = assignment(d, 'keys', cid); const ctl = d.controls.find(c => c.cid === cid);
      const editing = drawerUp() && S.picker.cid === cid;
      return `<g class="hotspot key-photo ${isNative(a) ? '' : 'assigned'} ${editing ? 'selected' : ''}" data-section="keys" data-cid="${cid}" data-name="${esc(ctl ? ctl.label : cid)}" data-does="${esc(isNative(a) ? (ctl ? ctl.label : 'Default') : presetLabel(a))}" data-custom="${isNative(a) ? '' : '1'}"><rect x="${x - P.kw / 2}" y="${y - P.kh / 2}" width="${P.kw}" height="${P.kh}" rx="12"/></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${hot}</svg>`;
  }

  // ----------------------------------------------------------- pages
  const PHYS = [[82, 'Middle button'], [83, 'Back'], [86, 'Forward'], [195, 'Gesture button'], [196, 'Mode shift'], [416, 'Haptic panel']];
  function pageButtons(d) {
    const rows = buttonRows(d).map(([cid, label], i) => {
      const a = assignment(d, 'buttons', cid);
      return `<div class="row"><span class="num">${i + 1}</span><span class="grow lbl">${label}</span>${drop(a, `data-act="pick" data-section="buttons" data-cid="${cid}" data-label="${esc(label)}"`)}</div>`;
    }).join('');
    const tw = assignment(d, 'thumbwheel');
    const twInvert = !!((d.config.settings || {}).thumbwheel || {}).invert;
    const twGain = typeof tw === 'object' && tw && tw.gain ? tw.gain : 8;
    const twSpeed = Math.max(1, Math.min(10, Math.round(twGain / 1.6)));
    const twRow = d.controls.length ? `<div class="row"><span class="num">${buttonRows(d).length + 1}</span><span class="grow lbl">Thumb wheel</span>${drop(tw, `data-act="pick" data-section="thumbwheel" data-cid="thumb" data-label="Thumb wheel"`)}</div>` : '';
    const photo = mousePhoto(d);
    if (photo) return `<div class="photo-card ms-photo">${photo}</div>`;
    return `<div class="${photo ? 'photo-col' : ''}">${photo ? `<div class="photo-card">${photo}<div class="kb-tip" hidden></div></div>` : ''}
      <div style="display:flex;flex-direction:column;gap:18px">${sec('Buttons', card(rows + twRow) + `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="reset-buttons"><i class="fa-solid fa-rotate-left"></i>Restore defaults</button></div><div class="hint">Left and right click cannot be reassigned. Overrides for the focused app are set in <a href="#" data-act="page" data-page="apps">Profiles</a>.</div>`)}${twRow ? sec('Thumb wheel', card(
        row('Invert direction', '', sw(twInvert, 'data-act="setting" data-path="thumbwheel.invert"')) +
        `<div class="row"><span class="grow lbl">Speed</span>${range('data-act="thumb-speed" data-out="tws"', twSpeed, 1, 10, 1)}<span class="val" data-out="tws" style="width:24px;text-align:right">${twSpeed}</span></div>`)) : ''}</div></div>`;
  }

  const SLOTS = { tap: ['Tap', 'click'], up: ['Swipe up', 'up'], down: ['Swipe down', 'down'], left: ['Swipe left', 'left'], right: ['Swipe right', 'right'] };
  const gestureCapable = d => d.controls.filter(c => c.divertable && c.raw_xy && c.cid !== 0xD7);
  const isRingAction = a => a === 'action_ring' || (!!a && typeof a === 'object' && a.type === 'ui' && a.event === 'ring');
  // the button that is held: the one carrying gestures or the action ring (they share it, one at a time)
  function gestureControl(d) {
    const picked = (S.holdCid || {})[d.id];
    if (picked !== undefined && gestureCapable(d).some(c => c.cid === picked)) return picked;
    for (const c of gestureCapable(d)) { const a = assignment(d, 'buttons', c.cid); const r = typeof a === 'string' ? (S.presets.all[a] || {}) : (a || {}); if (r.type === 'gesture' || isRingAction(a)) return c.cid; }
    return 195;
  }
  function gestureObject(d, cid) {
    const a = assignment(d, 'buttons', cid);
    const src = typeof a === 'string' ? S.presets.all[a] : a;
    if (src && src.type === 'gesture') return JSON.parse(JSON.stringify(src));
    const kept = ((S.ui || {}).savedGesture || {})[d.id + ':' + cid] || ((S.ui || {}).savedGesture || {})[d.id];   // what the button did before the ring took it
    if (kept && kept.type === 'gesture') return JSON.parse(JSON.stringify(kept));
    const o = JSON.parse(JSON.stringify(S.presets.all.gesture_navigation)); o.label = 'Custom gestures'; return o;
  }
  function pageGestures(d) {
    const cid = gestureControl(d), g = gestureObject(d, cid), slot = SLOTS[S.dir][1];
    const a = assignment(d, 'buttons', cid); const active = (typeof a === 'string' ? (S.presets.all[a] || {}) : (a || {})).type === 'gesture';
    const mode = isRingAction(a) ? 'ring' : active ? 'gestures' : 'off';
    const sens = Math.max(1, Math.min(10, Math.round((165 - (g.threshold ?? 60)) / 15)));
    const seg = (k, l) => `<button class="${mode === k ? 'on' : ''}" data-act="hold-mode" data-key="${k}">${l}</button>`;
    // gestures and the action ring share the held button: choosing one turns the other off
    const holdRows = `<div class="row"><div class="grow"><div class="lbl">When held</div><div class="sub">${mode === 'ring' ? 'Opens the action ring; gestures are off' : mode === 'gestures' ? 'Swipes run gestures; the action ring is off' : 'The button does what the mouse does by itself'}</div></div><span class="seg">${seg('gestures', 'Gestures')}${seg('ring', 'Action ring')}${seg('off', 'Off')}</span></div>` +
      `<div class="row"><div class="grow"><div class="lbl">Button</div><div class="sub">Each button that can be held has its own choice</div></div><select class="sel" data-act="gest-button">${gestureCapable(d).map(c => { const ca = assignment(d, 'buttons', c.cid); const ct = (typeof ca === 'string' ? (S.presets.all[ca] || {}) : (ca || {})).type; return `<option value="${c.cid}" ${c.cid === cid ? 'selected' : ''}>${esc(c.label)}${isRingAction(ca) ? ' · action ring' : ct === 'gesture' ? ' · gestures' : ''}</option>`; }).join('')}</select></div>`;
    if (mode === 'ring') {
      const rs = ringState();
      const pchips = rs.profiles.map((p, i) => `<button class="pill ${i === rs.active ? 'on' : ''}" data-act="ring-profile" data-key="${i}">${esc(p.name)}</button>`).join('') + '<button class="pill" data-act="ring-profile-add" title="New profile"><i class="fa-solid fa-plus"></i>New</button>';
      const free = row('Keep the pointer visible and free', rs.free_pointer ? 'The pointer moves anywhere; the action under it is chosen' : 'The pointer hides and the mouse steers the ring', sw(rs.free_pointer, 'data-act="ring-free"'));
      const feel = rs.free_pointer ? '' : `<div class="row"><span class="grow lbl">Travel before it picks</span>${range('data-act="ring-travel" data-out="rtravel"', rs.travel, 10, 80, 5)}<span class="val" data-out="rtravel" style="width:24px;text-align:right">${rs.travel}</span></div>`;
      return `<div class="ring-page">${ringStage()}<div class="rs-bar"><span></span><button class="btn" data-act="ring-test"><i class="fa-solid fa-play"></i>Try it</button></div></div>`;
    }
    if (mode === 'off') return sec('Gesture button', card(holdRows)) + `<div class="hint" style="margin-top:12px">Pick Gestures or Action ring to give the button something to do while it is held.</div>`;
    const cell = (k, txt, cls = '') => `<button class="${cls} ${S.dir === k ? 'on' : ''}" data-act="dir-pick" data-key="${k}">${txt}</button>`;
    const grid = `<div class="gest-grid"><div></div>${cell('up', '↑')}<div></div>${cell('left', '←')}${cell('tap', 'Tap', 'tap')}${cell('right', '→')}<div></div>${cell('down', '↓')}<div></div></div>`;
    const presetsRow = ['gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan'].map(k => `<button class="pill ${g.label === S.presets.all[k].label ? 'on' : ''}" data-act="gesture-preset" data-key="${k}">${esc(S.presets.all[k].label.replace('Gestures: ', ''))}</button>`).join('');
    return `<div class="photo-col" style="grid-template-columns:240px 1fr">${grid}
      <div style="display:flex;flex-direction:column;gap:22px">
        ${sec(SLOTS[S.dir][0], card(
          `<div class="row"><span class="grow lbl">Action</span>${drop(g[slot] && g[slot].preset ? g[slot].preset : (g[slot] || { type: 'nothing' }), `data-act="pick-gesture" data-slot="${slot}"`)}</div>` +
          `<div class="row"><span class="grow lbl">Mode</span><span class="seg"><button class="${g.continuous ? '' : 'on'}" data-act="gest-mode" data-key="once">One-shot</button><button class="${g.continuous ? 'on' : ''}" data-act="gest-mode" data-key="continuous">Continuous</button></span></div>`))}
        ${sec('Gesture button', card(holdRows +
          `<div class="row"><span class="grow lbl">Sensitivity</span>${range('data-act="gest-sens"', sens, 1, 10, 1)}<span class="val" style="width:24px;text-align:right">${sens}</span></div>` +
          (g.continuous ? `<div class="row"><span class="grow lbl">Repeat distance</span>${range('data-act="gest-step"', g.step ?? 40, 5, 120, 5)}<span class="val" style="width:24px;text-align:right">${g.step ?? 40}</span></div>` : '')))}
        ${sec('Presets', `<div class="chips">${presetsRow}</div>`)}
      </div></div>`;
  }

  const WAVES = { 0: 'Sharp tick', 1: 'Soft thud', 2: 'Sharp knock', 3: 'Soft knock', 4: 'Light tick', 5: 'Happy alert', 6: 'Angry alert', 7: 'Completed', 8: 'Square', 9: 'Wave', 10: 'Firework', 11: 'Mad', 12: 'Knock', 13: 'Jingle', 14: 'Ringing', 27: 'Whisper' };
  function pageHaptics(d) {
    const st = (d.state || {}).haptic || {}, s = (d.config.settings || {}).haptic || {};
    const on = s.enabled ?? st.enabled ?? true, level = s.level ?? st.level ?? 50;
    const force = ((d.state || {}).force || [])[0], pf = (d.config.settings || {}).panel_force ?? (force ? force.current : 0);
    const step = force ? Math.max(1, Math.round((force.max - force.min) / 20)) : 1;
    const pct = force ? Math.round((pf - force.min) * 100 / Math.max(1, force.max - force.min)) : 0;
    const waves = (st.waveforms || []).map(w => `<button class="pill" data-act="haptic-play" data-key="${w}" ${on ? '' : 'disabled'}>${esc(WAVES[w] || 'Pattern ' + w)}</button>`).join('');
    return sec('Haptic feedback', card(
        row('Haptic feedback', 'The panel under the thumb answers with a short vibration', sw(on, 'data-act="setting" data-path="haptic.enabled"')) +
        `<div class="row"><div class="grow"><div class="lbl">Strength</div><div class="sub">${on ? 'Felt at once when you let go of the slider' : 'Feedback is off'}</div></div>${range('data-act="haptic-level" data-out="hl"', level, 5, 100, 5)}<span class="val" data-out="hl" style="width:32px;text-align:right">${level}</span></div>`)) +
      sec('Felt when', card(
        row('The action ring moves or runs', 'A light tick on each action, a soft thud when one runs', sw(s.ring ?? true, 'data-act="setting" data-path="haptic.ring"')) +
        row('A gesture is recognised', 'A sharp tick when a swipe does its action', sw(s.gestures ?? true, 'data-act="setting" data-path="haptic.gestures"')))) +
      (force ? sec('Haptic panel press', card(
        `<div class="row"><div class="grow"><div class="lbl">Press force</div><div class="sub">How hard the panel has to be pressed: lower is lighter</div></div>${range('data-act="setting-range" data-path="panel_force" data-out="pf"' + (force.changeable ? '' : ' disabled'), pf, force.min, force.max, step)}<span class="val" data-out="pf" style="width:40px;text-align:right">${pct}%</span></div>`) +
        `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="panel-force-reset"><i class="fa-solid fa-rotate-left"></i>Default force</button></div>`) : '') +
      sec('Try a pattern', `<div class="chips">${waves}</div>`, 'plays on the mouse');
  }
  // Point & scroll, laid out like the keyboard's Backlight: the mouse with a tag saying how it is set,
  // its settings in the panel on the right (the tag opens the panel again once it is closed)
  // Point & scroll on the mouse photo, laid out like Buttons: a ring on the scroll wheel, the thumb
  // wheel and the body (pointer speed), each named beside it; a ring opens its settings on the right
  const PT_NAMES = { wheel: 'Scroll wheel', thumb: 'Thumb wheel', pointer: 'Pointer speed' };
  function ptSummary(d, k) {
    const st = d.state || {}, s = d.config.settings || {};
    if (k === 'pointer') { const dpi = s.dpi ?? (st.dpi ? st.dpi.dpi : 1000); return `${dpi} DPI · speed ${Math.round(((s.pointer_speed ?? 0) + 1) * 50)}`; }
    if (k === 'wheel') { const ss = s.smartshift || {}; return (ss.mode || (st.smartshift || {}).mode || 'ratchet') === 'ratchet' ? 'SmartShift on' : 'Free spin'; }
    return presetLabel(assignment(d, 'thumbwheel'));
  }
  function pointPhoto(d) {
    const P = MOUSE_PHOTOS[d.id];
    const shown = P.pt.filter(([k]) => k !== 'thumb' || d.controls.length);
    const on = k => backlightPanel(d) && S.ptSel === k;
    const spots = shown.map(([k, x, y]) => `<g class="hotspot ms pt ${on(k) ? 'selected' : ''}" data-cid="${k}" data-name="${esc(PT_NAMES[k])}"><circle class="ring" cx="${x}" cy="${y}" r="40"/></g>`).join('');
    const GAP = 150, place = {};
    for (const side of ['l', 'r']) {
      let prev = -Infinity;
      shown.filter(([, x]) => (x < P.w / 2) === (side === 'l')).sort((p, q) => p[2] - q[2]).forEach(([k, , y]) => { const ly = Math.max(y, prev + GAP); place[k] = ly; prev = ly; });
    }
    const lines = shown.map(([k, x, y]) => { const left = x < P.w / 2, ly = place[k]; return `<polyline class="ms-line ${on(k) ? 'on' : ''}" points="${left ? x - 40 : x + 40},${y} ${left ? -20 : P.w + 20},${ly}"/>`; }).join('');
    const labels = shown.map(([k, x]) => `<div class="ms-lab ${x < P.w / 2 ? 'l' : 'r'} ${on(k) ? 'on' : ''}" data-ring="${k}" style="top:${(place[k] / P.h * 100).toFixed(2)}%"><span class="k">${esc(PT_NAMES[k])}</span><span class="d">${esc(ptSummary(d, k))}</span></div>`).join('');
    return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${lines}${spots}</svg>${labels}`;
  }
  function pagePointer(d) {
    if (MOUSE_PHOTOS[d.id]) return `<div class="photo-card ms-photo">${pointPhoto(d)}</div>`;
    return pointerSettings(d) + thumbSettings(d);
  }
  function pointerSettings(d, only) {
    const st = d.state || {}, s = d.config.settings || {};
    const dpi = s.dpi ?? (st.dpi ? st.dpi.dpi : 1000);
    const [min, max, step] = st.dpi && st.dpi.stepped ? st.dpi.levels : [200, 8000, 50];
    const speed = Math.round(((s.pointer_speed ?? 0) + 1) * 50);
    const ss = s.smartshift || {}, hr = s.hires || {};
    const ssOn = (ss.mode || (st.smartshift || {}).mode || 'ratchet') === 'ratchet';
    const pointer = sec('Pointer', card(
      `<div class="row" style="flex-direction:column;align-items:stretch;gap:8px"><div style="display:flex;justify-content:space-between"><span class="lbl">DPI</span><span class="val" data-out="dpi">${dpi}</span></div>${range('data-act="dpi" data-out="dpi" style="width:100%"', dpi, min, max, step)}<div style="display:flex;justify-content:space-between" class="hint"><span>${min}</span><span>${max}</span></div></div>` +
      `<div class="row"><span class="grow lbl">Desktop pointer speed</span>${range('data-act="pspeed" data-out="pspeed"', speed, 0, 100, 5)}<span class="val" data-out="pspeed" style="width:32px;text-align:right">${speed}</span></div>`));
    const wheel = sec('Scroll wheel', card(
        row('SmartShift', 'Switch from ratchet to free-spin when the wheel is flicked', sw(ssOn, 'data-act="setting" data-path="smartshift.mode" data-on="ratchet" data-off="freespin"')) +
        `<div class="row"><span class="grow lbl">SmartShift sensitivity</span>${range('data-act="setting-range" data-path="smartshift.threshold" data-out="sst"', ss.threshold ?? (st.smartshift || {}).threshold ?? 14, 1, 50, 1)}<span class="val" data-out="sst" style="width:24px;text-align:right">${ss.threshold ?? (st.smartshift || {}).threshold ?? 14}</span></div>` +
        ((st.smartshift || {}).tunable_torque ? `<div class="row"><div class="grow"><div class="lbl">Ratchet force</div><div class="sub">How firm each step of the wheel feels</div></div>${range('data-act="setting-range" data-path="smartshift.torque" data-out="sstq"', ss.torque ?? (st.smartshift || {}).torque ?? 75, 1, 100, 1)}<span class="val" data-out="sstq" style="width:24px;text-align:right">${ss.torque ?? (st.smartshift || {}).torque ?? 75}</span></div>` : '') +
        row('Smooth scrolling', 'High-resolution wheel events', sw(hr.enabled ?? (st.hires || {}).hires ?? true, 'data-act="setting" data-path="hires.enabled"')) +
        row('Natural scroll direction', '', sw(hr.invert ?? (st.hires || {}).invert ?? false, 'data-act="setting" data-path="hires.invert"'))));
    return only === 'pointer' ? pointer : only === 'wheel' ? wheel : pointer + wheel;
  }
  // the thumb wheel's action, direction and speed
  function thumbSettings(d) {
    if (!d.controls.length) return '';
    const tw = assignment(d, 'thumbwheel');
    const twInvert = !!((d.config.settings || {}).thumbwheel || {}).invert;
    const twGain = typeof tw === 'object' && tw && tw.gain ? tw.gain : 8;
    const twSpeed = Math.max(1, Math.min(10, Math.round(twGain / 1.6)));
    return sec('Thumb wheel', card(
      `<div class="row"><span class="grow lbl">Action</span>${drop(tw, `data-act="pick" data-section="thumbwheel" data-cid="thumb" data-label="Thumb wheel"`)}</div>` +
      row('Invert direction', '', sw(twInvert, 'data-act="setting" data-path="thumbwheel.invert"')) +
      `<div class="row"><span class="grow lbl">Speed</span>${range('data-act="thumb-speed" data-out="tws"', twSpeed, 1, 10, 1)}<span class="val" data-out="tws" style="width:24px;text-align:right">${twSpeed}</span></div>`));
  }

  const WHEEL_ACTIONS = [['hscroll', 'Horizontal scroll'], ['vscroll', 'Vertical scroll'], ['zoom_wheel', 'Zoom'], ['volume_wheel', 'Volume'], ['tabs_wheel', 'Switch tabs'], ['workspaces_wheel', 'Workspaces'], ['brightness_wheel', 'Brightness']];

  function pageEasy(d) {
    const h = (d.state || {}).hosts;
    if (!h) return sec('Easy-Switch', card(row('Not supported by this device', '', '')));
    const cards = [0, 1, 2].map(i => {
      const n = h.names[i] || { index: i, paired: false, name: '', bus_type: 0 };
      const cur = h.current === i, empty = !n.paired;
      const bus = n.bus_type === 1 ? ['fa-usb', 'Bolt receiver'] : n.bus_type === 2 || n.bus_type === 3 ? ['fa-bluetooth-b', 'Bluetooth'] : empty ? ['fa-link-slash', 'Not paired'] : ['fa-usb', 'Receiver'];
      return `<div class="host ${cur ? 'cur' : ''}"><div class="top"><span class="n">${i + 1}</span><span class="st">${cur ? 'Connected' : empty ? '' : 'Paired'}</span></div>
        <div class="name">${esc(n.name || (empty ? 'Empty slot' : 'Unnamed host'))}</div>
        <div class="conn"><i class="fa-${bus[0] === 'fa-bluetooth-b' || bus[0] === 'fa-usb' ? 'brands' : 'solid'} ${bus[0]}"></i>${bus[1]}</div>
        <div class="hacts">${cur ? '<button class="btn sm flat" disabled>Current</button>' : empty ? '<button class="btn sm" data-act="pair">Pair…</button>' : `<button class="btn sm primary" data-act="host" data-key="${i}">Switch</button>`}${empty ? '' : `<button class="btn sm" data-act="rename-host" data-key="${i}" title="Rename"><i class="fa-solid fa-pen"></i></button>`}</div></div>`;
    }).join('');
    return sec(`Hosts · ${esc(d.name)}`, `<div class="hosts">${cards}</div>`) +
      `<div class="easy-opts">` + card(row('Linked switching', `Move all devices to the same host together`, sw(!!S.general.linked_easy_switch, 'data-act="general" data-key="linked_easy_switch"')) +
        row('Keyboard shortcut', 'Switch host from the tray or with a shortcut', `<span class="val">${META()} + ${ALT()} + 1…3</span>`)) + `</div>`;
  }

  function pageInfo(d) {
    const b = d.battery || { percent: 0 }; const hist = S.history[d.id] || [];
    const bars = (hist.length ? hist : [b.percent]).slice(-14);
    const rows = [['Model', d.name], ['Connection', `${d.transport === 'bolt' ? 'Bolt receiver' : 'Bluetooth'} · host ${((d.state || {}).hosts || {}).current + 1 || 1}`], ['Firmware', d.firmware || 'n/a'], ['Serial', d.serial || 'n/a'], ['Protocol', 'HID++ 2.0'], ['Wireless PID', d.id.toUpperCase()]];
    const est = b.charging ? 'Charging over USB-C' : b.level ? `Level: ${b.level}` : '';
    const thr = S.general.notify_low_threshold ?? 20;
    return `<div class="grid2">
      <div class="card pad" style="display:flex;flex-direction:column;gap:8px"><div class="sec-title"><span>Battery</span><span class="meta" style="color:var(--ok)">${b.charging ? 'Charging' : 'Discharging'}</span></div><div class="big">${b.percent}%</div><div class="meter ${b.percent <= 10 ? 'crit' : b.percent <= 20 ? 'low' : ''}"><i style="width:${b.percent}%"></i></div><div class="hint">${esc(est)}</div></div>
      <div class="card pad" style="display:flex;flex-direction:column;gap:8px"><div class="sec-title"><span>Last 7 days</span></div><div class="hist">${bars.map(v => `<span style="height:${v}%" title="${v}%"></span>`).join('')}</div><div style="display:flex;justify-content:space-between" class="hint"><span>${hist.length > 1 ? 'Earlier' : ''}</span><span>Today</span></div></div></div>` +
      sec('Device', card(rows.map(([k, v]) => `<div class="row"><span class="grow lbl">${k}</span><span class="val">${esc(v)}</span></div>`).join(''))) +
      sec('Alerts', card(`<div class="row"><div class="grow"><div class="lbl">Low battery warning</div><div class="sub">Notify at</div></div>${range('data-act="general-range" data-key="notify_low_threshold" data-out="thr"', thr, 5, 50, 5)}<span class="val" data-out="thr" style="width:32px;text-align:right">${thr}%</span></div>` +
        row('Firmware update', 'Check with fwupd / LVFS', `<button class="btn sm" data-act="fwupd">Check…</button>`)));
  }

  const KEY_ICONS = { brightness_down: 'fa-sun', brightness_up: 'fa-sun', backlight_down: 'fa-lightbulb', backlight_up: 'fa-lightbulb', dictation: 'fa-microphone', emoji: 'fa-face-smile', emoji_heart_eyes: 'fa-face-smile', emoji_crying: 'fa-face-smile', emoji_smiley: 'fa-face-smile', emoji_tears: 'fa-face-smile', mic_mute: 'fa-microphone-slash', prev_track: 'fa-backward-step', play_pause: 'fa-play', next_track: 'fa-forward-step', mute: 'fa-volume-xmark', volume_down: 'fa-volume-low', volume_up: 'fa-volume-high', calculator: 'fa-calculator', screenshot: 'fa-camera', context_menu: 'fa-bars', screen_lock: 'fa-lock', mission_control: 'fa-table-cells-large', launchpad: 'fa-grip', show_desktop: 'fa-desktop', home_show_desktop: 'fa-desktop', screen_capture: 'fa-camera', eject: 'fa-eject', do_not_disturb: 'fa-moon', app_switch: 'fa-window-restore', app_switch_dashboard: 'fa-window-restore', search: 'fa-magnifying-glass', home: 'fa-house', virtual_keyboard: 'fa-keyboard', language_switch: 'fa-language', voice_assistant: 'fa-comment-dots', open_apps: 'fa-window-restore', all_apps: 'fa-grip', switch_app: 'fa-window-restore' };
  // What the MX Keys S reports, used only when a keyboard gives no positions for its F row
  const FROW_FALLBACK = [199, 200, 226, 227, 259, 264, 284, 228, 229, 230, 231, 232];
  // The F row and the keys beside it come from the keyboard itself: every reprogrammable control
  // says which F key it sits on (1-12, 0 for a dedicated key). The MX Keys, MX Keys S and Craft all
  // put different functions on those keys, so nothing here is fixed to one model.
  function keyLayout(d) {
    const ctls = (d.controls || []).filter(c => c.divertable);
    const byPos = ctls.filter(c => c.position >= 1 && c.position <= 12).sort((a, b) => a.position - b.position);
    const frow = (byPos.length ? byPos : FROW_FALLBACK.map((cid, i) => { const c = ctls.find(x => x.cid === cid); return c && Object.assign({}, c, { position: i + 1 }); }).filter(Boolean))
      .map(c => ({ cid: c.cid, pos: c.position, k: 'F' + c.position, icon: KEY_ICONS[c.name] || 'fa-keyboard', label: c.label }));
    const inRow = new Set(frow.map(k => k.cid));
    const special = ctls.filter(c => !inRow.has(c.cid)).map(c => ({ cid: c.cid, icon: KEY_ICONS[c.name] || 'fa-keyboard', label: c.label }));
    return { frow, special };
  }
  function pageKeys(d) {
    // only the keyboard: hovering a key says what it does, clicking it opens its actions beside it
    const photo = keyboardPhoto(d);
    return photo ? `<div class="kb-photo">${photo}</div><div class="kb-tip" hidden></div>` : sec('Keys', card(row('No photo for this keyboard', '', '')));
  }


  const backlightPanel = d => !!(d && !S.blClosed && !S.appDetail && ((S.page === 'backlight' && !isMouse(d) && (d.state || {}).backlight && KEYBOARD_PHOTOS[d.id]) || (S.page === 'pointer' && isMouse(d) && MOUSE_PHOTOS[d.id])));
  // the tag pinned above the keyboard on the Backlight page, saying how the backlight is set right now
  function backlightTag(d) {
    const st = d.state.backlight, s = (d.config.settings || {}).backlight || {}, n = st.num_levels || 8;
    const on = s.enabled ?? st.enabled, auto = (s.mode || (st.mode === 3 ? 'manual' : 'auto')) !== 'manual';
    const level = s.level ?? st.level, dur = s.duration_hands_out ?? st.duration_hands_out ?? 5;
    const step = Math.max(1, Math.min(BL_STEPS, Math.round(level * BL_STEPS / (n - 1))));
    const bits = !on ? ['Off'] : [auto ? 'Automatic' : `Level ${step} of ${BL_STEPS}`, `${dur >= 60 ? Math.round(dur / 60) + ' min' : dur + ' s'} after hands leave`].concat(s.battery_saving ? ['Battery saving'] : []);
    return `<div class="kb-pin bl-pin" data-act="bl-open" title="Backlight settings"><span class="k">Backlight</span><span class="d">${esc(bits.join(' · '))}</span></div>`;
  }
  function pageBacklight(d) {
    if (!isMouse(d) && (d.state || {}).backlight && KEYBOARD_PHOTOS[d.id]) return `<div class="kb-photo">${keyboardPhoto(d, true)}${backlightTag(d)}</div>`;   // settings live in the panel
    const st = (d.state || {}).backlight, s = (d.config.settings || {}).backlight || {};
    if (!st) return sec('Backlight', card(row('Not supported by this device', '', '')));
    const on = s.enabled ?? st.enabled, manual = (s.mode || (st.mode === 3 ? 'manual' : 'auto')) === 'manual';
    const level = manual ? (s.level ?? st.level) : st.current_level;
    const levels = Array.from({ length: st.num_levels || 8 }, (_, i) => `<button class="${on && i < level + (manual ? 1 : 0) ? (manual ? 'on' : 'auto') : ''}" style="height:${8 + i * 2.8}px" data-act="bl-level" data-key="${i}" title="Level ${i}"></button>`).join('');
    const hint = !on ? 'Backlight is off' : manual ? `Level ${level} of ${(st.num_levels || 8) - 1}` : 'Set by the ambient light sensor';
    const timers = [['duration_hands_out', 'fa-hand', 'Hands away', 'No hands over the keyboard', 1, 60, 1], ['duration_hands_in', 'fa-keyboard', 'Hands present', 'Typing paused', 1, 60, 1], ['duration_powered', 'fa-plug', 'On power', 'Charging cable connected', 5, 600, 5]];
    const fmt = v => v >= 60 ? `${Math.round(v / 60)} min` : `${v} s`;
    return sec('Backlight', card(row('Backlight', '', sw(on, 'data-act="setting" data-path="backlight.enabled"')) +
        `<div class="row"><span class="grow lbl">Mode</span><span class="seg"><button class="${manual ? '' : 'on'}" data-act="setting-val" data-path="backlight.mode" data-val="auto">Automatic</button><button class="${manual ? 'on' : ''}" data-act="setting-val" data-path="backlight.mode" data-val="manual">Manual</button></span></div>` +
        `<div class="row"><div class="grow"><div class="lbl">Level</div><div class="sub">${hint}</div></div><div class="levels">${levels}</div></div>`)) +
      sec('Turn off after', card(timers.map(([k, icon, label, desc, lo, hi, stp]) => { const v = s[k] ?? st[k]; return `<div class="row"><i class="fa-solid ${icon}" style="width:20px;text-align:center;color:var(--dim)"></i><div class="grow"><div class="lbl">${label}</div><div class="sub">${desc}</div></div><span class="stepper"><button data-act="step" data-key="${k}" data-d="${-stp}" data-lo="${lo}" data-hi="${hi}">−</button><span>${fmt(v)}</span><button data-act="step" data-key="${k}" data-d="${stp}" data-lo="${lo}" data-hi="${hi}">+</button></span></div>`; }).join('')));
  }

  function countOverrides(d, key) {
    const p = profileOf(d, key), def = profileOf(d, 'default'); let n = 0;
    for (const sec of ['buttons', 'keys']) for (const [cid, a] of Object.entries(p[sec] || {})) if (JSON.stringify(a) !== JSON.stringify((def[sec] || {})[cid])) n++;
    if (p.thumbwheel !== undefined && JSON.stringify(p.thumbwheel) !== JSON.stringify(def.thumbwheel)) n++;
    return n;
  }
  function allProfiles() {
    const map = {};
    for (const d of S.devices) for (const [k, p] of Object.entries((d.config || {}).profiles || {})) { if (k === 'default') continue; map[k] = map[k] || { key: k, name: p.name || k, match: p.match || [], overrides: 0 }; map[k].overrides += countOverrides(d, k); }
    return Object.values(map);
  }
  // ----------------------------------------------------------- home
  // The first thing seen: every connected device with its photo, its battery and whether it is
  // charging, how it is connected and which profile it is using. A card opens its device.
  const devicePhotoSrc = d => ((isMouse(d) ? MOUSE_PHOTOS : KEYBOARD_PHOTOS)[d.id] || {}).src;
  // Home shows a mouse from above; its own view shows it from the side with the buttons numbered
  const TOP_VIEWS = { b034: 'b034-top.png', b035: 'b034-top.png', b043: 'b034-top.png', b042: 'b042-top.png', b048: 'b042-top.png' };
  const homePhotoSrc = d => isMouse(d) && TOP_VIEWS[d.id] ? '../assets/devices/' + TOP_VIEWS[d.id] : devicePhotoSrc(d);
  // the foot of the device's page list: battery icon and percentage on a pill, which opens Battery & info
  function navBattery(d) {
    const b = d.battery, st = batteryState(b);
    return `<div class="dnav-bat ${b ? st.cls : 'none'}" title="${esc(st.label)}"><i class="fa-solid ${b ? batIcon(b) : 'fa-battery-empty'}"></i>${b ? `<span>${b.percent}%</span>` : '<span>Info</span>'}${b && b.charging ? '<i class="fa-solid fa-bolt"></i>' : ''}</div>`;
  }
  function batteryState(b) {
    if (!b) return { label: 'Battery not reported', cls: '', icon: 'fa-battery-empty' };
    const plugged = b.charging || b.external_power;
    if (plugged && (b.percent >= 100 || b.level === 'full') && !b.charging) return { label: 'Fully charged, unplug when you like', cls: 'ok', icon: 'fa-plug-circle-check' };
    if (b.charging) return { label: 'Charging', cls: 'ok charging', icon: 'fa-bolt' };
    if (b.percent <= 10) return { label: 'Low, charge soon', cls: 'err', icon: 'fa-battery-empty' };
    if (b.percent <= 20) return { label: 'Getting low', cls: 'warn', icon: 'fa-battery-quarter' };
    return { label: 'On battery', cls: 'ok', icon: batIcon(b) };
  }
  function batteryRing(b) {
    const p = b ? Math.max(0, Math.min(100, b.percent)) : 0, st = batteryState(b), C = 2 * Math.PI * 26;
    return `<div class="bat-ring ${st.cls}" title="${esc(st.label)}"><svg viewBox="0 0 64 64"><circle class="trk" cx="32" cy="32" r="26"/><circle class="val" cx="32" cy="32" r="26" style="stroke-dasharray:${(C * p / 100).toFixed(1)} ${C.toFixed(1)}"/></svg><span class="pct">${b ? p + '<small>%</small>' : '–'}</span>${b && b.charging ? '<i class="fa-solid fa-bolt bolt"></i>' : ''}</div>`;
  }
  function greeting() { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  // a device the agent knows but cannot reach right now (receiver link down, or Bluetooth gone)
  const isOffline = d => d.online === false || !!d.offline;
  const HOME_PER_VIEW = 2;   // two cards side by side at the window's size; more page with the arrows
  function pageHome() {
    const devs = S.devices;
    const charging = devs.filter(d => d.battery && d.battery.charging).length;
    const low = devs.filter(d => d.battery && !d.battery.charging && d.battery.percent <= 20);
    const summary = [`${devs.length} device${devs.length === 1 ? '' : 's'} connected`]
      .concat(charging ? [`${charging} charging`] : [], low.length ? [`${low.map(d => d.name).join(' and ')} ${low.length === 1 ? 'needs' : 'need'} charging`] : [], !charging && !low.length && devs.length ? ['batteries fine'] : []).join(' · ');
    const pages = Math.max(1, Math.ceil(devs.length / HOME_PER_VIEW));
    S.homeAt = Math.max(0, Math.min(pages - 1, S.homeAt || 0));
    const shown = devs.slice(S.homeAt * HOME_PER_VIEW, S.homeAt * HOME_PER_VIEW + HOME_PER_VIEW);
    const cards = shown.map(d => {
      const off = isOffline(d);
      const b = d.battery, st = batteryState(b), src = homePhotoSrc(d);
      const hosts = (d.state || {}).hosts, host = hosts && typeof hosts.current === 'number' ? `host ${hosts.current + 1}` : '';
      const link = (d.transport === 'bolt' ? 'Bolt receiver' : d.transport === 'bluetooth' ? 'Bluetooth' : d.transport || 'Connected') + (host ? ` · ${host}` : '');
      const profName = d.profile && d.profile !== 'default' ? (((d.config || {}).profiles || {})[d.profile] || {}).name || d.profile : 'All applications';
      // photo, battery and state only: the name is in the tooltip, the link is an icon
      const linkIcon = d.transport === 'bluetooth' ? '<i class="fa-brands fa-bluetooth-b"></i>' : '<i class="fa-solid fa-wifi"></i>';
      return `<div class="dev-card ${isMouse(d) ? 'mouse' : 'kbd'} ${off ? 'off' : ''}" ${off ? 'aria-disabled="true"' : 'data-act="home-open"'} data-key="${esc(d.id)}" title="${esc(d.name)} · ${off ? 'Not connected' : esc(link)}">
        <div class="dev-photo">${src ? `<img src="${esc(src)}" alt="${esc(d.name)}">` : `<i class="fa-solid ${isMouse(d) ? 'fa-computer-mouse' : 'fa-keyboard'}"></i>`}</div>
        <div class="dev-body centered">
          ${off ? '<div class="dev-state off"><i class="fa-solid fa-link-slash"></i><span class="dev-label">Not connected</span></div>' : ''}<div class="dev-state ${st.cls}" ${off ? 'hidden' : ''}>${b ? `<span class="dev-pct">${b.percent}%</span>` : ''}<i class="fa-solid ${b ? batIcon(b) : 'fa-battery-empty'}"></i>${b && b.charging ? '<i class="fa-solid fa-bolt dev-bolt"></i>' : ''}${st.label !== 'On battery' ? `<span class="dev-label">${esc(st.label)}</span>` : ''}${d.transport === 'bluetooth' ? `<span class="dev-link bt" title="${esc(link)}">${linkIcon}</span>` : ''}</div>
        </div></div>`;
    }).join('');
    if (pages < 2) return `<div class="home-grid">${cards}</div>`;
    const slide = S.homeSlide > 0 ? 'from-right' : S.homeSlide < 0 ? 'from-left' : ''; S.homeSlide = 0;
    const dots = Array.from({ length: pages }, (_, i) => `<span class="${i === S.homeAt ? 'on' : ''}"></span>`).join('');
    return `<div class="home-pager"><button class="home-arrow" data-act="home-step" data-key="-1" ${S.homeAt ? '' : 'disabled'} title="Previous devices"><i class="fa-solid fa-chevron-left"></i></button><div class="home-grid ${slide}">${cards}</div><button class="home-arrow" data-act="home-step" data-key="1" ${S.homeAt < pages - 1 ? '' : 'disabled'} title="More devices"><i class="fa-solid fa-chevron-right"></i></button></div><div class="home-dots">${dots}</div>`;
  }

  function pageApps() {
    const profs = allProfiles();
    const rows = [`<div class="row click app-row" data-act="app-detail" data-key="default"><span class="ch" style="background:var(--dim)">∗</span><div class="grow"><div class="lbl">Default</div><div class="sub">all other windows</div></div><i class="fa-solid fa-chevron-right" style="color:var(--dim)"></i></div>`]
      .concat(profs.map(p => `<div class="row click app-row" data-act="app-detail" data-key="${esc(p.key)}"><span class="ch" style="background:${colorFor(p.name)}">${esc(p.name.charAt(0).toUpperCase())}</span><div class="grow"><div class="lbl">${esc(p.name)}</div><div class="sub">${esc(p.match.join(', '))}</div></div><span class="val">${p.overrides} override${p.overrides === 1 ? '' : 's'}</span><i class="fa-solid fa-chevron-right" style="color:var(--dim)"></i></div>`)).join('');
    const sugg = (S.apps || []).filter(a => !profs.some(p => p.match.includes(a.wm_class || a.id))).slice(0, 8);
    return sec('Profiles', card(rows) + `<div style="margin-top:8px"><button class="btn" data-act="add-app"><i class="fa-solid fa-plus"></i>Add application</button></div>`, 'Matched on the focused window class') +
      sec('Suggestions from installed applications', `<div class="chips">${sugg.map(a => `<button class="chip" data-act="add-app-quick" data-name="${esc(a.name)}" data-cls="${esc(a.wm_class || a.id)}">${esc(a.name)}</button>`).join('') || '<span class="hint">No suggestions</span>'}</div>`);
  }
  const colorFor = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 55% 45%)`; };
  function pageAppDetail(ad) {
    const key = ad.key, isDef = key === 'default';
    const groups = S.devices.map(d => {
      const def = profileOf(d, 'default'), p = profileOf(d, key);
      const items = [];
      const ctls = isMouse(d) ? PHYS.filter(([cid]) => d.controls.some(c => c.cid === cid)).map(([cid, l]) => ['buttons', cid, l]) : (l => l.frow.concat(l.special).map(({ cid, label }) => ['keys', cid, label]))(keyLayout(d));
      for (const [secn, cid, label] of ctls) {
        const dv = (def[secn] || {})[String(cid)], v = (p[secn] || {})[String(cid)];
        const ov = !isDef && v !== undefined && JSON.stringify(v) !== JSON.stringify(dv);
        items.push(`<div class="row"><span class="ov-dot ${ov ? 'on' : ''}"></span><span class="grow lbl" style="${ov ? '' : 'color:var(--dim)'}">${esc(label)}</span>${ov ? `<span class="val">${esc(presetLabel(dv))}</span>` : ''}${drop(v !== undefined ? v : dv, `data-act="pick" data-dev="${d.id}" data-section="${secn}" data-cid="${cid}" data-label="${esc(label)}" data-profile="${esc(key)}"`)}${ov ? `<button class="btn sm flat" data-act="ov-reset" data-dev="${d.id}" data-section="${secn}" data-cid="${cid}" data-profile="${esc(key)}" title="Reset to default"><i class="fa-solid fa-rotate-left"></i></button>` : ''}</div>`);
      }
      if (isMouse(d)) { const dv = def.thumbwheel, v = p.thumbwheel; const ov = !isDef && v !== undefined && JSON.stringify(v) !== JSON.stringify(dv); items.push(`<div class="row"><span class="ov-dot ${ov ? 'on' : ''}"></span><span class="grow lbl" style="${ov ? '' : 'color:var(--dim)'}">Thumb wheel</span>${ov ? `<span class="val">${esc(presetLabel(dv))}</span>` : ''}${drop(v !== undefined ? v : dv, `data-act="pick" data-dev="${d.id}" data-section="thumbwheel" data-cid="thumb" data-label="Thumb wheel" data-profile="${esc(key)}"`)}</div>`); }
      return sec(d.name, card(items.join('')));
    }).join('');
    const prof = isDef ? { name: 'Default', match: [] } : (allProfiles().find(p => p.key === key) || { name: key, match: [] });
    return `<div class="row" style="border:0;padding:0 0 4px"><span class="ch app-row" style="width:36px;height:36px;border-radius:10px;background:${isDef ? 'var(--dim)' : colorFor(prof.name)};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${esc(prof.name.charAt(0).toUpperCase())}</span><div class="grow"><div class="lbl" style="font-size:16px;font-weight:600">${esc(prof.name)}</div><div class="sub">${isDef ? 'Used for all other windows' : esc(prof.match.join(', ')) + ' · ' + (prof.overrides || 0) + ' overrides'}</div></div>${isDef ? '' : `<button class="btn sm" data-act="reset-overrides" data-key="${esc(key)}"><i class="fa-solid fa-rotate-left"></i>Reset all</button><button class="btn sm" data-act="rename-profile" data-key="${esc(key)}"><i class="fa-solid fa-pen"></i>Rename</button><button class="btn sm danger" data-act="del-profile" data-key="${esc(key)}">Remove</button>`}</div>` +
      groups + (isDef ? '' : `<div class="legend"><span class="dot" style="background:var(--accbg)"></span>Overridden here<span class="dot" style="background:var(--trk);margin-left:8px"></span>Inherited from Default</div>`);
  }

  function pageNotif() {
    const g = S.general, ev = g.osd_events || { mic: true, smartshift: true, backlight: true, host: true, dpi: false };
    const pos = g.osd_position || 'bottom', dur = g.osd_duration ?? 1500;
    return sec('On-screen overlays', card(row('Show overlays', 'Toast when a diverted key changes device state', sw(g.osd_enabled ?? true, 'data-act="general" data-key="osd_enabled"')) +
        `<div class="row"><span class="grow lbl">Position</span><span class="seg">${['top', 'center', 'bottom'].map(p => `<button class="${pos === p ? 'on' : ''}" data-act="general-val" data-key="osd_position" data-val="${p}">${p === 'center' ? 'Centre' : p.charAt(0).toUpperCase() + p.slice(1)}</button>`).join('')}</span></div>` +
        `<div class="row"><span class="grow lbl">Duration</span>${range('data-act="general-range" data-key="osd_duration" data-out="dur"', dur, 500, 4000, 250)}<span class="val" data-out="dur" style="width:40px;text-align:right">${(dur / 1000).toFixed(1)} s</span></div>` +
        row('Toggle overlays shortcut', '', `<span class="val">${META()} + ${ALT()} + O</span>`) +
        `<div class="row"><span class="grow lbl">Preview</span>${['mic', 'smartshift', 'backlight', 'host', 'dpi', 'emoji'].map(k => `<button class="btn sm" data-act="osd-test" data-key="${k}">${k}</button>`).join('')}</div>`)) +
      sec('Show overlay for', card([['mic', 'fa-microphone-slash', 'Microphone mute'], ['smartshift', 'fa-gear', 'SmartShift mode'], ['backlight', 'fa-sun', 'Backlight level'], ['host', 'fa-right-left', 'Easy-Switch host'], ['dpi', 'fa-arrow-pointer', 'DPI change']].map(([k, icon, label]) => `<div class="row"><i class="fa-solid ${icon}" style="width:20px;text-align:center;color:var(--dim)"></i><span class="grow lbl">${label}</span>${sw(ev[k] !== false, `data-act="osd-event" data-key="${k}"`)}</div>`).join(''))) +
      sec('System notifications', card(row('Low battery', '', sw(g.notify_low ?? true, 'data-act="general" data-key="notify_low"')) + row('Device connected / disconnected', '', sw(g.notify_connect ?? false, 'data-act="general" data-key="notify_connect"'))));
  }

  function pageBackup() {
    const cfg = S.status.config_path || '~/.config/logimx/config.json';
    const n = S.devices.length, np = allProfiles().length;
    return sec('Configuration file', card(row(esc(cfg), `${n} device${n === 1 ? '' : 's'} · ${np} app profile${np === 1 ? '' : 's'}`, `<button class="btn sm" data-act="show-config"><i class="fa-solid fa-folder-open"></i>Show</button>`) +
        `<div class="row" style="gap:8px"><button class="btn" data-act="export"><i class="fa-solid fa-download"></i>Export…</button><button class="btn" data-act="import"><i class="fa-solid fa-upload"></i>Import…</button><span class="grow"></span><button class="btn danger" data-act="reset-all">Reset all</button></div>`)) +
      sec('On-board profiles', card(S.devices.map(d => `<div class="row"><i class="fa-solid ${isMouse(d) ? 'fa-computer-mouse' : 'fa-keyboard'}" style="width:20px;text-align:center;color:var(--dim)"></i><div class="grow"><div class="lbl">${esc(d.name)}</div><div class="sub" style="color:var(--ok)">Read from device</div></div><button class="btn sm" data-act="sync-device" data-key="${d.id}"><i class="fa-solid fa-arrows-rotate"></i>Sync from device</button></div>`).join('')) + `<div class="hint">Devices keep DPI, SmartShift and host settings in flash; syncing reads them back into the configuration after using another computer.</div>`) +
      sec('Backups', `<div style="display:flex;justify-content:flex-end;margin-bottom:4px"><button class="btn sm" data-act="create-backup"><i class="fa-solid fa-plus"></i>Back up now</button></div>` + card(S.backups.length ? S.backups.map(b => `<div class="row"><i class="fa-solid fa-clock-rotate-left" style="width:20px;text-align:center;color:var(--dim)"></i><span class="grow lbl">${esc(b.when)}</span><span class="val">${esc(b.note || '')}</span><button class="btn sm" data-act="restore-backup" data-key="${esc(b.file)}">Restore</button></div>`).join('') : row('No backups yet', 'A backup is written before every import and reset', '')));
  }

  const RING_DIRS = ['Top', 'Top right', 'Right', 'Bottom right', 'Bottom', 'Bottom left', 'Left', 'Top left'];
  // The ring keeps several sets of eight actions (profiles); one is in use. Older settings had a
  // single list of slots, which becomes the first profile.
  function ringState() {
    const r = S.general.ring || {};
    const eight = a => Array.from({ length: 8 }, (_, i) => (a || [])[i] || null);
    let profiles = Array.isArray(r.profiles) && r.profiles.length ? r.profiles.map(p => ({ name: p.name || 'Profile', slots: eight(p.slots) })) : [{ name: 'Default', slots: eight(r.slots) }];
    const active = Math.max(0, Math.min(profiles.length - 1, Number(r.active) || 0));
    return { profiles, active, travel: r.travel || 30, free_pointer: !!r.free_pointer };
  }
  const ringSlots = () => { const r = ringState(); return r.profiles[r.active].slots.slice(); };
  async function saveRing(patch) {
    const r = Object.assign(ringState(), patch);
    r.active = Math.max(0, Math.min(r.profiles.length - 1, r.active));
    r.slots = r.profiles[r.active].slots;   // what the overlay of an older build reads
    await setGeneral({ ring: r });
  }
  const saveRingSlots = slots => { const r = ringState(); r.profiles[r.active].slots = slots; return saveRing({ profiles: r.profiles }); };
  // Gestures & action ring in a device's view, laid out like the keyboard: the ring in the middle with
  // each slot's action beside it; a slot opens its actions in the panel on the right
  function ringStage() {
    const slots = ringSlots();
    const parts = slots.map((sl, i) => {
      const a = (i * 45 - 90) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      const x = 50 + 30 * c, y = 50 + 30 * sn, lx = 50 + 41 * c, ly = 50 + 41 * sn;
      const tx = c > 0.3 ? '0' : c < -0.3 ? '-100%' : '-50%', ty = sn > 0.3 ? '0' : sn < -0.3 ? '-100%' : '-50%';
      return `<button class="rs-chip ${sl ? '' : 'empty'} ${ringEditing(i) ? 'selected' : ''}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%" data-act="pick" data-section="ring" data-cid="${i}" data-label="${esc(RING_DIRS[i])}" title="${esc(RING_DIRS[i])}"><i class="fa-solid ${sl ? esc(sl.icon || 'fa-circle-dot') : 'fa-plus'}"></i></button>` +
        `<div class="rs-lab ${ringEditing(i) ? 'on' : ''} ${sl ? '' : 'empty'}" data-act="pick" data-section="ring" data-cid="${i}" data-label="${esc(RING_DIRS[i])}" style="left:${lx.toFixed(1)}%;top:${ly.toFixed(1)}%;transform:translate(${tx},${ty})">${esc(sl ? sl.label : 'Empty')}</div>`;
    }).join('');
    return `<div class="ring-stage"><div class="rs-disc">${parts}<div class="rs-hub"><i class="fa-solid fa-circle-notch"></i></div></div></div>`;
  }
  // the ring's profiles, from the panel head: switch, add one, or remove the one in use
  function ringProfileMenu() {
    const rs = ringState(), cur = rs.profiles[rs.active];
    const list = rs.profiles.map((pr, i) => `<button data-act="ring-profile" data-key="${i}"><i class="fa-solid fa-layer-group"></i>${esc(pr.name)}${i === rs.active ? '<i class="fa-solid fa-check chk"></i>' : ''}</button>`).join('');
    const menu = S.menu === 'ringprof' ? `<div class="menu prof-menu"><div class="mhead">Ring profiles</div>${list}<div class="sep"></div><button data-act="ring-profile-add"><i class="fa-solid fa-plus"></i>New profile</button>${rs.profiles.length > 1 ? `<button data-act="ring-profile-delete" class="danger"><i class="fa-solid fa-trash"></i>Remove "${esc(cur.name)}"</button>` : ''}</div>` : '';
    return `<div class="prof-dd"><button class="hbtn prof-btn" data-act="menu-ringprof" title="Ring profile"><i class="fa-solid fa-layer-group"></i><span>${esc(cur.name)}</span><i class="fa-solid fa-chevron-down"></i></button>${menu}</div>`;
  }
  // how the ring behaves, shown at the foot of the ring's action panel
  function ringBehaviour() {
    const rs = ringState();
    const free = row('Keep the pointer visible and free', rs.free_pointer ? 'The pointer moves anywhere; the action under it is chosen' : 'The pointer hides and the mouse steers the ring', sw(rs.free_pointer, 'data-act="ring-free"'));
    const feel = rs.free_pointer ? '' : `<div class="row"><span class="grow lbl">Travel before it picks</span>${range('data-act="ring-travel" data-out="rtravel"', rs.travel, 10, 80, 5)}<span class="val" data-out="rtravel" style="width:24px;text-align:right">${rs.travel}</span></div>`;
    return `<div class="ring-behaviour">${sec('Ring behaviour', card(free + feel))}</div>`;
  }
  const ringEditing = i => drawerUp() && S.picker.section === 'ring' && S.picker.cid === i;
  function pageRing() {
    const rs = ringState(), slots = ringSlots();
    const filled = slots.filter(Boolean).length;
    const pchips = rs.profiles.map((p, i) => `<button class="pill ${i === rs.active ? 'on' : ''}" data-act="ring-profile" data-key="${i}" title="${p.slots.filter(Boolean).length} of 8 slots filled">${esc(p.name)}</button>`).join('');
    const profilesRow = `<div class="row" style="gap:10px"><div class="chips grow">${pchips}<button class="pill" data-act="ring-profile-add" title="New profile"><i class="fa-solid fa-plus"></i>New</button></div><button class="btn flat" data-act="ring-profile-rename" title="Rename this profile"><i class="fa-solid fa-pen"></i></button><button class="btn flat" data-act="ring-profile-copy" title="Duplicate this profile"><i class="fa-solid fa-copy"></i></button>${rs.profiles.length > 1 ? '<button class="btn flat danger" data-act="ring-profile-delete" title="Delete this profile"><i class="fa-solid fa-trash"></i></button>' : ''}</div>`;
    // preview: the same geometry as the overlay, icons on a disc
    const chips = slots.map((sl, i) => { const a = (i * 45 - 90) * Math.PI / 180; const x = 50 + 36 * Math.cos(a), y = 50 + 36 * Math.sin(a); return `<button class="ring-chip ${sl ? '' : 'empty'} ${ringEditing(i) ? 'selected' : ''}" style="left:${x}%;top:${y}%" data-act="pick" data-section="ring" data-cid="${i}" data-label="${esc(RING_DIRS[i])}" title="${esc(sl ? sl.label : 'Empty · ' + RING_DIRS[i])}"><i class="fa-solid ${sl ? esc(sl.icon || 'fa-circle-dot') : 'fa-plus'}"></i></button>`; }).join('');
    const preview = `<div class="ring-preview"><div class="ring-disc">${chips}<div class="ring-hub"><i class="fa-solid fa-xmark"></i></div></div><div class="ring-side"><div class="lbl">${filled ? `${filled} of 8 slots filled` : 'No actions yet'}</div><div class="sub">${rs.free_pointer ? 'Hold the button, move the pointer onto an action and let go to run it' : 'Hold the button and nudge the mouse toward an action, then let go to run it'}; or tap the button and click. 1 to 8 and Esc work too.</div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn" data-act="ring-test"><i class="fa-solid fa-play"></i>Try it</button>${filled ? '<button class="btn flat danger" data-act="ring-clear"><i class="fa-solid fa-trash"></i>Clear all</button>' : ''}</div></div></div>`;
    const rows = slots.map((sl, i) => `<div class="row ${ringEditing(i) ? 'editing' : ''}"><span class="num">${i + 1}</span><span class="grow lbl">${RING_DIRS[i]}</span>${sl ? drop(sl.action, `data-act="pick" data-section="ring" data-cid="${i}" data-label="${esc(RING_DIRS[i])}"`) : `<button class="drop blank" data-act="pick" data-section="ring" data-cid="${i}" data-label="${esc(RING_DIRS[i])}"><i class="fa-solid ic fa-plus"></i>Empty<i class="fa-solid fa-chevron-down chev"></i></button>`}</div>`).join('');
    const travel = rs.travel;
    const free = `<div class="row"><div class="grow"><div class="lbl">Keep the pointer visible and free</div><div class="sub">${rs.free_pointer ? 'The pointer stays on screen and moves anywhere; the action under it is the one chosen' : 'While the button is held the pointer hides and the mouse steers the ring'}</div></div>${sw(rs.free_pointer, 'data-act="ring-free"')}</div>`;
    const feel = rs.free_pointer ? '' : `<div class="row"><div class="grow"><div class="lbl">Travel before it picks</div><div class="sub">How far the mouse moves before an action is chosen: lower is snappier, higher is calmer</div></div>${range('data-act="ring-travel" data-out="rtravel"', travel, 10, 80, 5)}<span class="val" data-out="rtravel" style="width:24px;text-align:right">${travel}</span></div>`;
    return sec('Action ring', card(preview + free + feel)) + sec('Profiles', card(profilesRow), 'sets of actions, one in use') + sec(`Slots · ${rs.profiles[rs.active].name}`, card(rows), 'clockwise from the top');
  }
  // the device's own settings, as Options+ lists them: General, the keys it can switch off, backup
  const DISABLE_KEYS = [['num_lock', 0x02, 'Num Lock'], ['caps_lock', 0x01, 'Caps Lock'], ['scroll_lock', 0x04, 'Scroll Lock'], ['insert', 0x08, 'Insert'], ['win', 0x10, 'Windows / Start key']];
  function pageDeviceSettings(d) {
    const st = d.state || {}, s = d.config.settings || {}, dk = st.disable_keys, ks = s.disable_keys || {};
    const general = (typeof st.fn_swap === 'boolean' ? row('Use F1, F2, etc. keys as standard function keys', 'Hold Fn for the printed functions', sw(!(s.fn_swap ?? st.fn_swap), 'data-act="setting" data-path="fn_swap" data-on="false" data-off="true"')) : '') +
      (st.platform ? row('Always keep the keyboard layout', 'The keyboard stops switching its layout by itself', sw(!!s.keep_layout, 'data-act="setting" data-path="keep_layout"')) : '');
    const keys = dk ? DISABLE_KEYS.filter(([, bit]) => dk.supported & bit).map(([k, bit, l]) => row(l, '', chk(ks[k] ?? !!(dk.disabled & bit), `data-act="setting" data-path="disable_keys.${k}" title="Disable ${esc(l)}"`))).join('') : '';
    const backup = row('Back up settings', 'Save LogiMX settings for all devices to a file', '<button class="btn sm" data-act="export"><i class="fa-solid fa-download"></i>Save…</button>') +
      row('Restore settings', 'Load settings saved earlier', '<button class="btn sm" data-act="import"><i class="fa-solid fa-upload"></i>Restore…</button>') +
      row('Read from device', 'Settings kept in the device\'s memory', `<button class="btn sm" data-act="sync-device" data-key="${esc(d.id)}"><i class="fa-solid fa-arrows-rotate"></i>Sync</button>`);
    return (general ? sec('General', card(general)) : '') + (keys ? sec('Disabled keys', card(keys), 'switched off while on') : '') + sec('Device backup', card(backup));
  }
  function pageSettings(generalTitle = 'General') {
    const u = S.ui || {};
    return sec('Startup', card(row(IS_LINUX() ? 'Start agent at login' : 'Start LogiMX at sign-in', IS_LINUX() ? 'systemd user service' : IS_WIN() ? 'Starts hidden in the notification area' : 'Login item, starts hidden in the menu bar', sw(!!u.autostart, 'data-act="ui" data-key="autostart"')) +
        row(IS_MAC() ? 'Show menu bar icon' : 'Show tray indicator', IS_WIN() ? 'Battery and Easy-Switch in the notification area' : IS_MAC() ? 'Battery and Easy-Switch in the menu bar' : 'Battery and Easy-Switch in the top bar', sw(u.tray !== false, 'data-act="ui" data-key="tray"')) +
        row('Keep running when window closes', 'Closing hides to the tray', sw(u.minimize !== false, 'data-act="ui" data-key="minimize"')) +
        row('Start hidden', 'Open in the tray only', sw(!!u.start_hidden, 'data-act="ui" data-key="start_hidden"')))) +
      sec(generalTitle, card(`<div class="row"><span class="grow lbl">Appearance</span><select class="sel" data-act="theme-select">${THEMES.map(([k, l]) => `<option value="${k}" ${S.theme === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` +
        row('Language', '', '<span class="val">System (English)</span>') +
        `<div class="row"><div class="grow"><div class="lbl">Check for updates</div><div class="sub">Looks at the GitHub release feed</div></div><button class="btn sm" data-act="check-updates">Check now</button>${sw(u.updates !== false, 'data-act="ui" data-key="updates"')}</div>`)) +
      sec('Privacy', card(row('Telemetry', 'Off. LogiMX never sends data anywhere.', '<span class="val">Not available</span>')));
  }

  // Flow: share the mouse, keyboard and clipboard with other computers on the LAN. LogiMX
  // drives Deskflow (the open-source software KVM) under the hood; this computer is the
  // server and the others join as clients. S.flow holds the last flow-info from main.
  const FLOW_POS = [['left', 'Left', 'fa-arrow-left'], ['right', 'Right', 'fa-arrow-right'], ['up', 'Above', 'fa-arrow-up'], ['down', 'Below', 'fa-arrow-down']];
  function flowRefresh() { window.agent.flowInfo().then(f => { S.flow = f; if (f) { S.flowStatus = f.status || (f.running ? 'running' : 'stopped'); } if (S.page === 'flow') render(); }); }
  // While Flow is off, the device's Flow page is a single invitation; Start using Flow opens
  // the setup (installing the sharing engine first if it is missing).
  function flowIntro(f) {
    const inst = S.flowStatus === 'installing';
    return `<div class="flow-intro">
      <div class="flow-art"><i class="fa-solid fa-laptop"></i><span class="flow-arrow"><i class="fa-solid fa-arrow-pointer"></i></span><i class="fa-solid fa-display"></i></div>
      <div class="t">Flow</div>
      <div class="s">Use this mouse and keyboard on more than one computer. Move the pointer off the edge of the screen to reach the next computer, and copy on one to paste on another.</div>
      ${inst ? `<div class="s"><i class="fa-solid fa-spinner fa-spin"></i> Installing Flow support…${S.flowDetail ? `<br><span class="hint">${esc(S.flowDetail)}</span>` : ''}</div>`
        : `<button class="btn primary lg" data-act="flow-begin"><i class="fa-solid fa-play"></i>Start using Flow</button>`}
      <div class="hint">Works on your local network. Nothing is sent anywhere online.</div>
    </div>`;
  }
  function pageFlow() {
    const f = S.flow;
    if (!f) { flowRefresh(); return sec('Flow', card(row('Loading…', '', ''))); }
    if (!S.flowSetup && !f.running) return flowIntro(f);
    if (!f.installed) {
      const inst = S.flowStatus === 'installing';
      return sec('Flow', card(
        row('Flow needs its sharing engine', 'LogiMX shares the mouse, keyboard and clipboard between computers using Deskflow, an open-source tool. Install it once to turn Flow on.',
          inst ? `<span class="val">Installing…</span>` : `<button class="btn primary" data-act="flow-install"><i class="fa-solid fa-download"></i>Install Flow support</button>`) +
        (inst && S.flowDetail ? `<div class="row sub" style="color:var(--dim)">${esc(S.flowDetail)}</div>` : ''))) +
        sec('', `<div class="hint">Deskflow is the open-source Barrier / Synergy fork. LogiMX only sets it up and runs it; nothing is sent anywhere online. <a href="#" data-act="open" data-url="https://deskflow.org">deskflow.org</a></div>`);
    }
    const peers = f.peers || [];
    const st = S.flowStatus, on = f.running;
    const statusText = on
      ? (f.peer || st === 'peer' ? 'Connected — a computer is sharing this mouse and keyboard' : `Running — waiting for a computer to connect at ${f.ip || 'this computer'}`)
      : st === 'error' ? (S.flowDetail || 'Flow stopped unexpectedly') : 'Off';
    const statusCls = on ? (f.peer || st === 'peer' ? 'ok' : 'warn') : st === 'error' ? 'err' : '';
    // this computer in the middle, each peer as a tile on its side
    const tile = (label, cls) => `<div class="flow-node ${cls}">${esc(label)}</div>`;
    const bySide = s => peers.filter(p => p.pos === s).map(p => tile(p.name, 'peer')).join('');
    const gridPreview = `<div class="flow-grid">
      <div class="fg up">${bySide('up')}</div>
      <div class="fg left">${bySide('left')}</div>
      ${tile(f.name + ' (this)', 'me')}
      <div class="fg right">${bySide('right')}</div>
      <div class="fg down">${bySide('down')}</div></div>`;
    const peerRows = peers.length ? peers.map((p, i) => `<div class="row">
        <span class="grow lbl">${esc(p.name)}</span>
        <select class="sel" data-act="flow-peer-pos" data-i="${i}">${FLOW_POS.map(([v, l]) => `<option value="${v}" ${p.pos === v ? 'selected' : ''}>${l} of me</option>`).join('')}</select>
        <button class="btn sm flat danger" data-act="flow-peer-del" data-i="${i}" title="Remove"><i class="fa-solid fa-trash"></i></button>
      </div>`).join('') : `<div class="row sub" style="color:var(--dim)">No computers yet. Add the Mac or PC you want to reach.</div>`;
    return sec('This computer', card(
        row('Name', 'How other computers see this one', `<input class="text" data-act="flow-name" value="${esc(f.name)}" style="width:180px" ${on ? 'disabled' : ''}>`) +
        row('Address', 'Where the others connect', `<span class="val flow-ip">${esc(f.ip || 'no network')}</span>`))) +
      sec('Computers', card(peerRows + `<div class="row"><button class="btn sm" data-act="flow-peer-add" ${on ? 'disabled' : ''}><i class="fa-solid fa-plus"></i>Add computer</button></div>`), 'drag your pointer off this edge to reach them') +
      (peers.length ? sec('Arrangement', card(`<div class="flow-arrange">${gridPreview}</div>`)) : '') +
      sec('Sharing', card(
        row('Share clipboard', 'Copy on one computer, paste on another', sw(f.clipboard !== false, 'data-act="flow-clip"')) +
        `<div class="row sub" style="color:var(--dim)">The keyboard and mouse are always shared with the computer your pointer is on.</div>`)) +
      sec('', card(`<div class="row"><div class="grow"><div class="lbl">Flow</div><div class="sub"><span class="dot ${statusCls}"></span>${esc(statusText)}</div></div>` +
        (on ? `<button class="btn danger" data-act="flow-stop"><i class="fa-solid fa-stop"></i>Stop</button>` : `<button class="btn primary" data-act="flow-start"><i class="fa-solid fa-play"></i>Start Flow</button>`) + `</div>`)) +
      sec('Connect another computer', `<div class="hint">On the other computer, install <a href="#" data-act="open" data-url="https://deskflow.org">Deskflow</a>, choose <b>Client</b>, and connect to <b>${esc(f.ip || 'this computer')}</b>. Give that computer the screen name you typed for it above, and accept the security fingerprint the first time.</div>`);
  }

  function pageAbout() {
    const links = [['fa-book', 'Documentation', 'https://github.com/aabdelghani/logimx#readme'], ['fa-code-branch', 'Source code', 'https://github.com/aabdelghani/logimx'], ['fa-bug', 'Report an issue', 'https://github.com/aabdelghani/logimx/issues'], ['fa-heart', 'Contributors', 'https://github.com/aabdelghani/logimx/graphs/contributors']];
    const logs = S.logs.length ? S.logs : [{ t: `${new Date().toLocaleTimeString()} INFO  agent ${S.connected ? 'connected' : 'not running'} · ${S.devices.length} device(s) · tracker ${S.status.tracker || 'n/a'}`, c: 'dim' }];
    return `<div class="card about-hero"><span class="mark"><i class="fa-solid fa-computer-mouse"></i></span><div class="name">LogiMX</div><div class="hint">Configuration for MX mice and keyboards on ${IS_WIN() ? 'Windows' : IS_MAC() ? 'macOS' : 'Linux'}</div><div class="tags"><span>v${S.status.version || VERSION}</span><span>MIT</span><span>${S.appInfo.packaged ? 'Packaged' : 'Source'}</span>${IS_LINUX() ? '' : '<span>Beta</span>'}</div></div>` +
      card(links.map(([i, l, u]) => `<div class="row click" data-act="open" data-url="${u}"><i class="fa-solid ${i}" style="width:20px;text-align:center;color:var(--dim)"></i><span class="grow lbl">${l}</span><i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--dim);font-size:11px"></i></div>`).join('')) +
      sec('Diagnostics', card(`<div class="logs">${logs.map(l => `<span class="${l.c || 'dim'}">${esc(l.t)}</span>`).join('')}</div>`) + `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn primary" data-act="report"><i class="fa-solid fa-bug"></i>Report a problem</button><button class="btn" data-act="export-diag"><i class="fa-solid fa-file-zipper"></i>Export diagnostics</button><button class="btn" data-act="copy-diag"><i class="fa-solid fa-copy"></i>Copy</button></div>`, `<button class="btn sm flat" data-act="refresh-logs">Refresh</button>`);
  }

  // ----------------------------------------------------------- dialogs
  const PICKER_CATS = [['all', 'All', 'fa-list'], ['key', 'Keystroke', 'fa-keyboard'], ['media', 'Media', 'fa-play'], ['window', 'Window', 'fa-window-maximize'], ['ws', 'Workspaces', 'fa-table-cells-large'], ['cmd', 'Command', 'fa-terminal'], ['app', 'Apps', 'fa-rocket'], ['device', 'Device', 'fa-computer-mouse']];
  const CAT_OF = { media: ['volume_up', 'volume_down', 'mute', 'mic_mute', 'play_pause', 'next_track', 'prev_track', 'brightness_up', 'brightness_down'],
    window: ['close_window', 'maximize', 'minimize', 'tile_left', 'tile_right', 'show_desktop', 'app_switcher', 'screenshot', 'screenshot_area', 'lock', 'terminal', 'calculator', 'emoji_picker', 'action_ring', 'emoji', 'context_menu', 'copy', 'paste', 'undo', 'redo', 'zoom_in', 'zoom_out', 'tab_next', 'tab_prev'],
    ws: ['overview', 'workspace_next', 'workspace_prev'],
    device: ['native', 'nothing', 'middle_click', 'back', 'forward', 'easy_switch_1', 'easy_switch_2', 'easy_switch_3', 'dpi_cycle', 'smartshift_toggle', 'open_home', 'gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan', 'hscroll', 'vscroll', 'zoom_wheel', 'volume_wheel', 'tabs_wheel', 'workspaces_wheel', 'brightness_wheel'] };
  const CAT_LABEL = { media: 'Media', window: 'Window', ws: 'Shell', device: 'Device' };
  function pickerItems(p) {
    const all = S.presets.all;
    const allowed = new Set(p.section === 'ring' ? S.presets.buttons.filter(k => !['native', 'nothing', 'action_ring'].includes(k) && all[k] && all[k].type !== 'gesture') : p.section === 'thumbwheel' ? S.presets.wheel : p.section === 'gesture' ? Object.keys(all).filter(k => ['nothing', 'keystroke', 'button', 'command', 'change_host', 'dpi_cycle', 'scroll', 'smartshift_toggle', 'open'].includes(all[k].type)) : p.section === 'keys' ? S.presets.keys.filter(k => k !== 'action_ring') : S.presets.buttons);
    const items = [];
    for (const [cat, keys] of Object.entries(CAT_OF)) for (const k of keys) if (allowed.has(k) && all[k] && (p.cat === 'all' || p.cat === cat)) {
      if (all[k].type === 'gesture' && p.section !== 'buttons') continue;
      if (p.section === 'buttons' && all[k].type === 'gesture' && !(p.ctl && p.ctl.raw_xy)) continue;
      items.push({ key: k, cat, icon: PRESET_ICON[k] || ICON[all[k].type], label: all[k].label, meta: CAT_LABEL[cat] });
    }
    const q = (p.q || '').toLowerCase();
    return q ? items.filter(i => i.label.toLowerCase().includes(q)) : items;
  }
  function renderDialog() {
    if (S.dlg === 'picker') return S.picker && S.picker.drawer ? '' : renderPicker();
    if (S.dlg === 'pair') return renderPair();
    if (S.dlg === 'prompt') return renderPrompt();
    if (S.dlg === 'report') return renderReport();
    return '';
  }
  function renderPicker() {
    const p = S.picker;
    const cur = p.current;
    const curKey = typeof cur === 'string' ? cur : (cur && cur.preset);
    const foot = `<div class="dlg-foot">${p.section === 'ring' ? '<button class="btn flat danger" data-act="pick-default"><i class="fa-solid fa-trash"></i>Clear slot</button>' : `<button class="btn flat" data-act="pick-default" title="Back to what this control does out of the box"><i class="fa-solid fa-rotate-left"></i>Reset to default</button><button class="btn flat danger" data-act="pick-disable">${p.section === 'gesture' ? 'Do nothing' : 'Disable ' + (p.section === 'keys' ? 'key' : p.section === 'thumbwheel' ? 'wheel' : 'button')}</button>`}<div class="r"><button class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" data-act="pick-assign">Assign</button></div></div>`;
    if (p.drawer) return renderPickerDrawer(foot.replace(/<div class="r">[\s\S]*<\/div><\/div>$/, '</div>'));
    let body = '';
    if (p.cat === 'key') {
      body = `<div class="recbox" data-act="rec-start"><i class="fa-solid fa-keyboard big-ic"></i><div class="t">${p.recording ? 'Press the keys to record' : 'Click here, then press the keys'}</div><div class="keys">${(p.chord || []).length ? p.chord.map(k => `<span>${esc(keyName(k))}</span>`).join('') : '<span style="opacity:.5">…</span>'}</div><div class="hint">Release to finish. Esc cancels.</div>${p.recording ? '' : '<button class="btn primary" data-act="rec-start">Start recording</button>'}</div>
        <div class="hint">Or type it: <input class="text" data-field="typed" placeholder="ctrl+alt+shift+z" style="width:200px;margin-left:8px" value="${esc(p.typed || '')}"></div>`;
    } else if (p.cat === 'cmd') {
      body = sec('Shell command', `<input class="mono" data-field="cmd" placeholder="${IS_WIN() ? 'notepad.exe' : IS_MAC() ? 'open -a Calculator' : 'gnome-screenshot -i'}" value="${esc(p.cmd || '')}"><div class="hint">Runs in the user session with your environment. Non-interactive.</div>`) +
        sec('Type text', `<input class="mono" data-field="text" placeholder="Text typed as keystrokes" value="${esc(p.text || '')}">`) +
        sec('Open URL, file or folder', `<input class="mono" data-field="open" placeholder="https://… or ~/Documents" value="${esc(p.open || '')}">`);
    } else if (p.cat === 'app') {
      body = `<div class="applist">${appTabHtml(p)}</div>`;
    } else {
      const items = pickerItems(p);
      body = `<div class="acts">${items.map(i => `<button class="act ${curKey === i.key || p.sel === i.key ? 'on' : ''}" data-act="pick-item" data-key="${i.key}"><i class="fa-solid ${i.icon} ic"></i><span class="t">${esc(i.label)}</span><span class="m">${i.meta}</span><i class="fa-solid fa-check chk"></i></button>`).join('') || '<div class="row hint">No actions match</div>'}</div>`;
    }
    return `${p.drawer ? '<div class="drawer-wrap"><div class="dlg drawer" data-stop>' : '<div class="scrim" data-act="close-dlg"><div class="dlg" data-stop>'}
      <div class="dlg-head">${p.drawer ? `<span class="dh-key">Action</span><span class="dh-sub">Choose what it does</span>` : `Choose action · ${esc(p.label)}`}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="dlg-body">
        <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input data-field="q" placeholder="Search actions" value="${esc(p.q || '')}"></div>
        <div class="cats">${PICKER_CATS.filter(([k]) => !(p.section === 'thumbwheel' && ['key', 'media', 'window', 'ws', 'app'].includes(k))).map(([k, l, i]) => `<button class="pill ${p.cat === k ? 'on' : ''}" data-act="pick-cat" data-key="${k}"><i class="fa-solid ${i}"></i>${l}</button>`).join('')}</div>
        ${body}
      </div>
      ${foot}
    </div></div>`;
  }
  // The key panel, laid out like Options+: RECOMMENDED open on top (from its per-key table,
  // recommendations_slot_win.json: the key's own function, then a keystroke, then the action ring),
  // then its categories folded, then what only LogiMX has. While searching, every match is listed.
  // Options+ card -> LogiMX preset, for the cards it recommends past a key's own function
  const OPTS_CARD = { win_print_screen: 'screenshot', win_emoji: 'emoji' };
  // key control id -> what Options+ names the key's own function, plus any extra card it offers
  const RECOMMEND = { 10: ['Calculator'], 110: ['Show desktop'], 111: ['Lock screen'], 191: ['Screen capture', 'win_print_screen'], 199: ['Brightness down'], 200: ['Brightness up'], 212: ['Search'], 224: ['Task view'], 225: ['Notifications'], 226: ['Backlight down'], 227: ['Backlight up'], 228: ['Previous track'], 229: ['Play / Pause'], 230: ['Next track'], 231: ['Mute'], 232: ['Volume down'], 233: ['Volume up'], 234: ['Context menu'], 259: ['Dictation'], 264: ['Emoji menu', 'win_emoji'], 266: ['Screen snip'], 284: ['Mute microphone'] };
  // a mouse's buttons and thumb wheel: what Options+ recommends for each (recommendations_slot_win.json,
  // MX Master 3S), as LogiMX presets; its own function comes first as Default
  const MOUSE_RECOMMEND = { 82: ['smartshift_toggle', 'overview', 'show_desktop', 'gesture_navigation', 'action_ring'], 83: ['copy', 'volume_down', 'undo', 'smartshift_toggle', 'action_ring'], 86: ['paste', 'volume_up', 'redo', 'smartshift_toggle', 'action_ring'],
    195: ['gesture_navigation', 'overview', 'show_desktop', 'screenshot', 'app_switcher', 'smartshift_toggle', 'action_ring'], 196: ['overview', 'middle_click', 'gesture_navigation', 'screenshot', 'action_ring'], 416: ['action_ring', 'smartshift_toggle', 'overview', 'screenshot'],
    thumb: ['zoom_wheel', 'volume_wheel', 'tabs_wheel'] };
  const MOUSE_GROUP = ['middle_click', 'back', 'forward', 'dpi_cycle', 'smartshift_toggle', 'gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan', 'action_ring'];
  const WHEEL_GROUP = ['hscroll', 'vscroll', 'zoom_wheel', 'volume_wheel', 'tabs_wheel', 'workspaces_wheel', 'brightness_wheel', 'nothing'];
  const K = (code, label) => ({ code: 'KEY_' + code, label: label || code });
  const keyRange = (a, f) => a.split(' ').map(c => K(c, f ? f(c) : c));
  const KEY_GROUPS = {
    fkeys: keyRange('F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12'),
    letters: keyRange('A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'),
    numbers: keyRange('1 2 3 4 5 6 7 8 9 0'),
    symbols: [K('GRAVE', '`'), K('MINUS', '-'), K('EQUAL', '='), K('LEFTBRACE', '['), K('RIGHTBRACE', ']'), K('BACKSLASH', '\\'), K('SEMICOLON', ';'), K('APOSTROPHE', "'"), K('COMMA', ','), K('DOT', '.'), K('SLASH', '/'), K('102ND', '< >')],
    numpad: keyRange('KP0 KP1 KP2 KP3 KP4 KP5 KP6 KP7 KP8 KP9', c => 'Num ' + c.slice(2)).concat([K('KPENTER', 'Num Enter'), K('KPEQUAL', 'Num ='), K('NUMLOCK', 'Num Lock'), K('KPMINUS', 'Num -'), K('KPDOT', 'Num .'), K('KPPLUS', 'Num +'), K('KPSLASH', 'Num /'), K('KPASTERISK', 'Num *')]),
    modifiers: [K('LEFTCTRL', 'Left Ctrl'), K('RIGHTCTRL', 'Right Ctrl'), K('LEFTSHIFT', 'Left Shift'), K('RIGHTSHIFT', 'Right Shift'), K('LEFTALT', 'Left ' + ALT()), K('RIGHTALT', 'Right ' + ALT()), K('LEFTMETA', 'Left ' + META()), K('RIGHTMETA', 'Right ' + META())],
    arrows: [K('UP', 'Up arrow'), K('DOWN', 'Down arrow'), K('LEFT', 'Left arrow'), K('RIGHT', 'Right arrow'), K('HOME', 'Home'), K('END', 'End'), K('PAGEUP', 'Page up'), K('PAGEDOWN', 'Page down'), K('INSERT', 'Insert')],
    others: [K('CAPSLOCK', 'Caps Lock'), K('SCROLLLOCK', 'Scroll Lock'), K('BACKSPACE', 'Backspace'), K('DELETE', 'Delete'), K('ESC', 'Escape'), K('TAB', 'Tab'), K('SPACE', 'Space'), K('ENTER', 'Enter')],
  };
  // Options+'s action categories with the LogiMX presets that belong to each
  const OPTS_CATS = {
    nav: ['overview', 'show_desktop', 'app_switcher', 'workspace_prev', 'workspace_next', 'close_window', 'maximize', 'minimize', 'tile_left', 'tile_right', 'tab_next', 'tab_prev', 'zoom_in', 'zoom_out', 'screenshot', 'screenshot_area', 'lock', 'calculator', 'emoji_picker', 'emoji', 'dictation', 'context_menu', 'brightness_up', 'brightness_down', 'terminal'],
    edit: ['copy', 'paste', 'undo', 'redo', 'open_home'],
    media: ['volume_dial', 'play_pause', 'prev_track', 'next_track', 'volume_up', 'volume_down', 'mute', 'mic_mute'],
    other: ['easy_switch_1', 'easy_switch_2', 'easy_switch_3', 'nothing'],
    mouse: MOUSE_GROUP, wheel: WHEEL_GROUP,
  };
  // three sections, as Options+ shows a key: what it recommends, Smart actions (things that run,
  // type or open), and every other action grouped under small headings
  const DRAWER_SECTIONS = [['rec', 'Recommended'], ['smart', 'Smart actions'], ['more', 'Other actions']];
  const ACTION_GROUPS = [['nav', 'Navigate computer'], ['edit', 'Edit files and folders'], ['media', 'Media and audio'], ['other', 'Device']];
  // what each kind of control lists: a key, a mouse button (with a mouse group first), or the thumb wheel
  const groupsFor = p => p.section === 'thumbwheel' ? [['wheel', 'Wheel']] : p.section === 'buttons' ? [['mouse', 'Mouse']].concat(ACTION_GROUPS) : ACTION_GROUPS;
  const sectionsFor = p => p.section === 'thumbwheel' ? DRAWER_SECTIONS.filter(([k]) => k !== 'smart') : DRAWER_SECTIONS;
  const KEY_GROUP_NAMES = [['fkeys', 'F keys'], ['letters', 'Letters'], ['numbers', 'Numbers'], ['symbols', 'Symbols'], ['numpad', 'Num pad'], ['modifiers', 'Modifier keys'], ['arrows', 'Arrow and navigation'], ['others', 'Others']];
  const curOf = p => typeof p.current === 'string' ? p.current : (p.current && p.current.preset);
  // a single key: its keystroke, so the panel can say which one is in use
  const keyCur = p => p.current && typeof p.current === 'object' && p.current.type === 'keystroke' && (p.current.keys || []).length === 1 ? p.current.keys[0] : null;
  const actRow = (p, i) => `<button class="act ${(p.selKey || curOf(p) || '') === i.key ? 'on' : ''}" data-act="pick-item" data-key="${i.key}"><i class="fa-solid ${i.icon} ic"></i><span class="t">${esc(i.label)}${i.key === 'action_ring' ? '<span class="new-tag">New</span>' : ''}</span>${i.meta ? `<span class="m">${esc(i.meta)}</span>` : ''}<i class="fa-solid fa-check chk"></i></button>`;
  const keyRow = (p, k, meta) => `<button class="act ${(p.selKey || (keyCur(p) && 'key:' + keyCur(p)) || '') === 'key:' + k.code ? 'on' : ''}" data-act="pick-key" data-key="${k.code}"><span class="kcap">${esc(k.label)}</span>${meta ? `<span class="m">${meta}</span>` : ''}<i class="fa-solid fa-check chk"></i></button>`;
  const keyCap = (p, k) => `<button class="kc ${(p.selKey || (keyCur(p) && 'key:' + keyCur(p)) || '') === 'key:' + k.code ? 'on' : ''}" data-act="pick-key" data-key="${k.code}" title="${esc(k.label)}">${esc(k.label)}</button>`;
  const presetItem = k => ({ key: k, icon: PRESET_ICON[k] || ICON[(S.presets.all[k] || {}).type] || 'fa-circle-dot', label: S.presets.all[k].label });
  // the presets a control can take: keys never get the ring, gestures only on a button that can be held and moved
  const RING_RECOMMEND = ['volume_dial', 'overview', 'show_desktop', 'screenshot_area', 'lock', 'calculator', 'emoji_picker', 'terminal', 'play_pause'];
  const GESTURE_RECOMMEND = ['overview', 'show_desktop', 'app_switcher', 'workspace_next', 'workspace_prev', 'volume_up', 'volume_down', 'play_pause'];
  const GESTURE_TYPES = ['nothing', 'keystroke', 'button', 'command', 'change_host', 'dpi_cycle', 'scroll', 'smartshift_toggle', 'open'];
  const allowedFor = p => new Set(p.section === 'ring' ? S.presets.buttons.filter(k => !['native', 'nothing', 'action_ring'].includes(k) && (S.presets.all[k] || {}).type !== 'gesture')
    : p.section === 'gesture' ? Object.keys(S.presets.all).filter(k => GESTURE_TYPES.includes(S.presets.all[k].type))
    : p.section === 'thumbwheel' ? S.presets.wheel.filter(k => k !== 'volume_dial') : p.section === 'buttons' ? S.presets.buttons.filter(k => k !== 'volume_dial' && ((S.presets.all[k] || {}).type !== 'gesture' || (p.ctl && p.ctl.raw_xy))) : S.presets.keys.filter(k => k !== 'action_ring' && k !== 'volume_dial'));
  function drawerItems(sec, p) {
    const ok = allowedFor(p || S.picker);
    return (OPTS_CATS[sec] || []).filter(k => ok.has(k) && S.presets.all[k]).map(presetItem);
  }
  const recBox = p => `<div class="recbox" data-act="rec-start"><i class="fa-solid fa-keyboard big-ic"></i><div class="t">${p.recording ? 'Press the keys to record' : 'Click here, then press the keys'}</div><div class="keys">${(p.chord || []).length ? p.chord.map(x => `<span>${esc(keyName(x))}</span>`).join('') : '<span style="opacity:.5">…</span>'}</div><div class="hint">Release to finish. Esc cancels.</div></div>
        <div class="hint">Or type it: <input class="text" data-field="typed" placeholder="ctrl+alt+shift+z" style="width:200px;margin-left:8px" value="${esc(p.typed || '')}"></div>`;
  function drawerSection(p, k) {
    if (k === 'rec') {
      const ok = allowedFor(p), mouse = p.section === 'buttons' || p.section === 'thumbwheel';
      // a ring slot or a gesture has no function of its own: only suggestions
      if (p.section === 'ring' || p.section === 'gesture') {
        const sugg = (p.section === 'ring' ? RING_RECOMMEND : GESTURE_RECOMMEND).filter(k => ok.has(k) && S.presets.all[k]).map(presetItem);
        const ks = `<button class="act ${p.cat === 'key' ? 'on' : ''}" data-act="rec-open"><i class="fa-solid fa-keyboard ic"></i><span class="t">Keystroke assignment</span><i class="fa-solid ${p.cat === 'key' ? 'fa-chevron-up' : 'fa-chevron-down'} more"></i></button>`;
        return `<div class="acts">${sugg.map(i => actRow(p, i)).join('')}${ks}</div>${p.cat === 'key' ? recBox(p) : ''}`;
      }
      const r = mouse ? null : RECOMMEND[p.cid];
      const own = r ? r[0] : p.section === 'thumbwheel' ? 'Horizontal scroll' : (p.ctl && p.ctl.label) || p.label || 'Default';
      const rows = [Object.assign(presetItem('native'), { label: own, meta: 'Default' })];
      for (const c of (r || []).slice(1)) if (OPTS_CARD[c] && ok.has(OPTS_CARD[c])) rows.push(presetItem(OPTS_CARD[c]));
      // a button that can be held and moved offers the action ring and gestures right after its own
      // function; the fixed gesture presets give way to the button's own gestures
      const holdable = p.section === 'buttons' && !!(p.ctl && p.ctl.raw_xy);
      if (holdable) rows.push(presetItem('action_ring'), { key: 'gestures', icon: 'fa-hand-pointer', label: 'Gestures' });
      if (mouse) for (const k of (MOUSE_RECOMMEND[p.cid] || [])) if (ok.has(k) && S.presets.all[k] && !(holdable && (k === 'action_ring' || S.presets.all[k].type === 'gesture'))) rows.push(presetItem(k));
      if (p.section === 'thumbwheel') return `<div class="acts">${rows.map(i => actRow(p, i)).join('')}</div>`;
      const ks = `<button class="act ${p.cat === 'key' ? 'on' : ''}" data-act="rec-open"><i class="fa-solid fa-keyboard ic"></i><span class="t">Keystroke assignment</span><i class="fa-solid ${p.cat === 'key' ? 'fa-chevron-up' : 'fa-chevron-down'} more"></i></button>`;
      // a button set to show the action ring gets a way straight to the ring's own settings
      // set to show the action ring: a way to the ring's own settings, tucked under that row
      const ringCfg = p.section === 'buttons' && isRingAction(p.current) ? `<button class="act ring-cfg" data-act="ring-config"><i class="fa-solid fa-sliders ic"></i><span class="t">Configure action ring</span><i class="fa-solid fa-arrow-right more"></i></button>` : '';
      const gesturesOn = p.section === 'buttons' && !!p.current && (typeof p.current === 'string' ? (S.presets.all[p.current] || {}) : p.current).type === 'gesture';
      const gestRow = `<button class="act ${gesturesOn ? 'on' : ''}" data-act="pick-gestures"><i class="fa-solid fa-hand-pointer ic"></i><span class="t">Gestures</span><span class="m">Hold and swipe</span><i class="fa-solid fa-check chk"></i></button>` +
        (gesturesOn ? `<button class="act ring-cfg" data-act="gest-config"><i class="fa-solid fa-sliders ic"></i><span class="t">Configure gestures</span><i class="fa-solid fa-arrow-right more"></i></button>` : '');
      return `<div class="acts">${rows.map(i => i.key === 'gestures' ? gestRow : actRow(p, i) + (i.key === 'action_ring' ? ringCfg : '')).join('')}${ks}</div>${p.cat === 'key' ? recBox(p) : ''}`;
    }
    if (k === 'smart') return sec('Run a command', `<input class="mono" data-field="cmd" placeholder="${IS_WIN() ? 'notepad.exe' : IS_MAC() ? 'open -a Calculator' : 'gnome-screenshot -i'}" value="${esc(p.cmd || '')}">`) +
        sec('Type text', `<input class="mono" data-field="text" placeholder="Text typed as keystrokes" value="${esc(p.text || '')}">`) +
        sec('Open URL, file or folder', `<input class="mono" data-field="open" placeholder="https://… or ~/Documents" value="${esc(p.open || '')}">`) +
        sec('Open application', `<div class="applist smart-apps">${appTabHtml(Object.assign({}, p, { q: '' }))}</div>`);
    const groups = groupsFor(p).map(([g, l]) => { const items = drawerItems(g, p); return items.length ? `<div class="kgroup"><div class="kg-t">${l}</div><div class="acts">${items.map(i => actRow(p, i)).join('')}</div></div>` : ''; }).join('');
    if (p.section === 'thumbwheel') return groups;
    const keys = KEY_GROUP_NAMES.map(([g, l]) => `<div class="kgroup"><div class="kg-t">${l}</div><div class="kgrid">${KEY_GROUPS[g].map(x => keyCap(p, x)).join('')}</div></div>`).join('');
    return groups + keys;
  }
  function renderPickerDrawer(foot) {
    const p = S.picker, q = (p.q || '').trim().toLowerCase();
    const fold = p.fold || (p.fold = { rec: true });
    let list;
    if (q) {
      const hits = [];
      for (const [g, l] of groupsFor(p)) for (const i of drawerItems(g, p)) if (i.label.toLowerCase().includes(q)) hits.push(actRow(p, Object.assign(i, { meta: l })));
      if (p.section !== 'thumbwheel') for (const [g, l] of KEY_GROUP_NAMES) for (const x of KEY_GROUPS[g]) if (x.label.toLowerCase() === q || (q.length > 1 && x.label.toLowerCase().includes(q))) hits.push(keyRow(p, x, l));
      if (p.section !== 'thumbwheel' && ('keystroke assignment'.includes(q) || 'shortcut'.includes(q))) hits.unshift(`<button class="act" data-act="rec-open"><i class="fa-solid fa-keyboard ic"></i><span class="t">Keystroke assignment</span><span class="m">Recommended</span></button>`);
      list = `<div class="acts">${hits.join('') || '<div class="row hint">No actions match</div>'}</div>`;
    } else {
      list = sectionsFor(p).map(([k, l]) => `<div class="acc ${fold[k] ? 'open' : ''}"><button class="acc-head" data-act="acc-toggle" data-key="${k}"><span class="grow">${l}</span><i class="fa-solid fa-chevron-down chev"></i></button>${fold[k] ? `<div class="acc-body ${p.unfolded === k ? 'unfold' : ''}">${drawerSection(p, k)}</div>` : ''}</div>`).join('');
      p.unfolded = null;
    }
    return `<div class="drawer-wrap"><div class="dlg drawer" data-stop>
      <div class="dlg-head"><span class="dh-key">Action</span><span class="dh-sub">Choose what it does</span>${p.section === 'ring' ? ringProfileMenu() : ''}</div>
      <div class="dlg-body">
        <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input data-field="q" placeholder="Search all actions" value="${esc(p.q || '')}"></div>
        <div class="acc-list">${list}</div>
        ${p.section === 'ring' ? ringBehaviour() : ''}
      </div>
      ${foot}
    </div></div>`;
  }
  // Backlight, laid out like a key's panel: the keyboard stays where it is, its settings on the right
  const BL_STEPS = 6;
  function renderPointerPanel(d) {
    return `<div class="drawer-wrap"><div class="dlg drawer bl-panel" data-stop>
      <div class="dlg-head"><span class="dh-key">Modify settings</span><span class="dh-sub">${esc(PT_NAMES[S.ptSel] || 'Point & scroll')}</span></div>
      <div class="dlg-body">${S.ptSel === 'thumb' ? thumbSettings(d) : pointerSettings(d, S.ptSel)}</div>
    </div></div>`;
  }
  function renderBacklightPanel(d) {
    const st = d.state.backlight, s = (d.config.settings || {}).backlight || {}, n = st.num_levels || 8;
    const on = s.enabled ?? st.enabled, auto = (s.mode || (st.mode === 3 ? 'manual' : 'auto')) !== 'manual';
    const level = s.level ?? st.level, dur = s.duration_hands_out ?? st.duration_hands_out ?? 5;
    // six steps spread over the keyboard's own levels (1 .. n-1)
    const stepLevel = i => Math.max(1, Math.round(i * (n - 1) / BL_STEPS));
    const steps = Array.from({ length: BL_STEPS }, (_, k) => k + 1).map(i => `<button class="${level >= stepLevel(i) ? 'on' : ''}" style="height:${10 + i * 5}px" data-act="bl-level" data-key="${stepLevel(i)}" title="Level ${i} of ${BL_STEPS}"></button>`).join('');
    const body = row('Backlighting', '', sw(on, 'data-act="setting" data-path="backlight.enabled"')) +
      (on ? `<div class="row"><div class="grow"><div class="lbl">Backlight duration</div><div class="sub">Stays on after your hands leave the keys</div></div></div>
        <div class="row bl-slider">${range('data-act="setting-range" data-path="backlight.duration_hands_out" data-out="bld"', dur, 1, 300, 1)}<span class="val" data-out="bld">${fmtOut('bld', dur)}</span></div>` +
        row('Automatic brightness', 'Follows the light in the room', sw(auto, 'data-act="setting" data-path="backlight.mode" data-on="auto" data-off="manual"')) +
        (auto ? '' : `<div class="row"><div class="grow"><div class="lbl">Brightness</div><div class="sub">Level ${Math.max(0, [...Array(BL_STEPS).keys()].filter(k => level >= stepLevel(k + 1)).length)} of ${BL_STEPS}</div></div><div class="levels">${steps}</div></div>`) : '') +
      row('Battery saving mode', 'Backlight off at 20% battery or less, until charging', sw(!!s.battery_saving, 'data-act="setting" data-path="backlight.battery_saving"'));
    return `<div class="drawer-wrap"><div class="dlg drawer bl-panel" data-stop>
      <div class="dlg-head"><span class="dh-key">Modify settings</span><span class="dh-sub">Backlight</span></div>
      <div class="dlg-body"><div class="card">${body}</div></div>
      <div class="dlg-foot"><button class="btn flat" data-act="bl-reset"><i class="fa-solid fa-rotate-left"></i>Reset backlighting</button></div>
    </div></div>`;
  }
  function renderPair() {
    const p = S.pair;
    const steps = [[1, 'Connection'], [2, 'Discover'], [3, 'Done']].map(([n, l]) => `<button class="${n < p.step ? 'done' : n === p.step ? 'cur' : ''}"><span class="bar"></span><span class="t">${l}</span></button>`).join('');
    let body = '';
    if (p.step === 1) body = `<button class="choice on"><span class="ic"><i class="fa-brands fa-usb"></i></span><div class="grow"><div>Bolt receiver</div><div class="sub">${S.status.receivers ? esc(S.status.receivers) : 'Plugged in'}</div></div></button>
      <button class="choice" data-act="open-bt"><span class="ic"><i class="fa-brands fa-bluetooth-b"></i></span><div class="grow"><div>Bluetooth</div><div class="sub">Via the system Bluetooth settings</div></div></button><div class="hint">Unifying receivers are supported for existing pairings only.</div>`;
    else if (p.step === 2) {
      const f = p.found[0];
      let title = 'Searching…', hint = 'Turn the device off and on, or hold its Easy-Switch key for 3 seconds until the LED blinks fast.';
      if (p.error) { title = 'Pairing failed'; hint = p.error; }
      else if (p.passkey && f) { title = `Confirm on ${f.name}`; hint = (f.authentication & 1) ? `Type these digits on the keyboard you are pairing, then press Enter.` : `Click ${[...p.passkey].map(c => c === '1' ? 'right' : 'left').join(', ')} on the mouse, then press both buttons together.`; }
      else if (f) { title = `Pairing ${f.name}`; hint = 'Waiting for the device to confirm.'; }
      body = `<div class="center"><span class="ring"><i class="fa-solid ${p.error ? 'fa-triangle-exclamation' : 'fa-satellite-dish'}"></i></span><div style="font-size:15px;font-weight:600">${esc(title)}</div><div class="hint">${esc(hint)}</div>${p.error ? '' : '<div class="progress"><i></i></div>'}${p.passkey && f && (f.authentication & 1) ? `<div class="keys">${[...p.passkey].map(c => `<span>${c}</span>`).join('')}</div>` : ''}${f ? `<div class="choice on" style="max-width:360px"><span class="ic"><i class="fa-solid ${f.kind === 'keyboard' ? 'fa-keyboard' : 'fa-computer-mouse'}"></i></span><div class="grow"><div>${esc(f.name)}</div><div class="sub">${esc(f.kind)}</div></div></div>` : ''}</div>`;
    }
    else body = `<div class="center"><span class="ring ok"><i class="fa-solid fa-check"></i></span><div style="font-size:15px;font-weight:600">${esc(p.done || 'Device paired')}</div><div class="hint">It will appear in the sidebar in a moment.</div></div>`;
    return `<div class="scrim" data-act="close-dlg"><div class="dlg" data-stop>
      <div class="dlg-head">Pair a device<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="dlg-body"><div class="steps">${steps}</div>${body}</div>
      <div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="pair-cancel">Cancel</button><button class="btn primary" data-act="pair-next" ${p.step === 2 && !p.error ? 'disabled' : ''}>${p.step === 3 ? 'Finish' : p.step === 2 ? 'Retry' : 'Continue'}</button></div></div></div></div>`;
  }
  // The report goes into a public issue, so it is shown in full before anything leaves the machine
  // and it is the person who submits it, signed in to their own account in the browser.
  const ISSUE_URL = 'https://github.com/aabdelghani/logimx/issues/new';
  function reportBody(r, withLog) {
    return `### What happened\n\n${(r.what || '').trim() || '<!-- What did you do, what did you expect, what happened instead? -->'}\n\n### Diagnostics\n\n${r.summary}\n` +
      (withLog && r.log ? `\n<details><summary>Agent log, last lines</summary>\n\n\`\`\`\n${r.log}\n\`\`\`\n\n</details>\n` : withLog ? '' : '\n_The agent log was too long for the link: it is on the clipboard, paste it here._\n');
  }
  function renderReport() {
    const r = S.report || {};
    return `<div class="scrim" data-act="close-dlg"><div class="dlg" style="width:640px" data-stop>
      <div class="dlg-head">Report a problem<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="dlg-body">
        <label class="hint">What happened?<textarea class="text" data-field="what" rows="3" style="display:block;width:100%;margin-top:4px;resize:vertical;font:inherit" placeholder="What did you do, what did you expect, what happened instead?">${esc(r.what || '')}</textarea></label>
        <div class="hint">This is what will be in the issue. Serial numbers, host names and your user name are removed, and custom commands are reduced to their kind.</div>
        <pre class="report-pre">${esc(r.summary || 'Gathering…')}${r.log ? '\n\n--- agent log, last lines ---\n' + esc(r.log) : ''}</pre>
        <div class="hint"><i class="fa-solid fa-circle-info"></i> Nothing is sent by LogiMX. Your browser opens a new issue on GitHub with this text filled in; it becomes public when you press Submit there.</div>
      </div>
      <div class="dlg-foot"><button class="btn flat" data-act="report-copy"><i class="fa-solid fa-copy"></i>Copy</button><div class="r"><button class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" data-act="report-open" ${r.summary ? '' : 'disabled'}><i class="fa-solid fa-arrow-up-right-from-square"></i>Open issue on GitHub</button></div></div></div></div>`;
  }
  function renderPrompt() {
    const p = S.prompt;
    return `<div class="scrim" data-act="close-dlg"><div class="dlg" style="width:460px" data-stop>
      <div class="dlg-head">${esc(p.title)}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="dlg-body">${p.fields.map(f => `<label class="hint">${esc(f.label)}<input class="text" style="display:block;width:100%;margin-top:4px" data-field="${f.key}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="dl-${f.key}"` : ''}>${f.list ? `<datalist id="dl-${f.key}">${f.list.map(o => `<option value="${esc(o.value)}">${esc(o.label || '')}</option>`).join('')}</datalist>` : ''}</label>`).join('')}${p.note ? `<div class="hint">${p.note}</div>` : ''}</div>
      <div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" data-act="prompt-ok">${esc(p.ok || 'OK')}</button></div></div></div></div>`;
  }
  const drawerUp = () => !!(S.picker && S.picker.drawer && (S.dlg === 'picker' || (S.dlg === 'prompt' && S.prompt && S.prompt.back === 'picker')));
  function prompt(title, fields, onOk, ok, note) { S.prompt = { title, fields, onOk, ok, note, back: drawerUp() ? 'picker' : null }; S.dlg = 'prompt'; render(); setTimeout(() => { const i = root.querySelector('.dlg input'); if (i) i.focus(); }, 30); }

  // ----------------------------------------------------------- states
  function renderEmpty() {
    const c = S.conflicts[0], needsBuild = agentNeedsBuild();
    const booting = !S.ready || (S.connected && !S.loaded);
    return `<div class="window"><main class="main empty-wrap">
      <header class="hb"><span class="title">LogiMX</span><div class="right"><div style="position:relative"><button class="hbtn icon" data-act="menu-theme"><i class="fa-solid fa-circle-half-stroke"></i></button>${S.menu === 'theme' ? themeMenu() : ''}</div><button class="hbtn close" data-act="win-close"><i class="fa-solid fa-xmark"></i></button></div></header>
      ${c ? `<div class="banner"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>${esc(c.name)} is running.</strong> Two programs diverting the same buttons will fight over the device.</span><button class="bact" data-act="stop-tool" data-tool="${esc(c.name)}">Stop ${esc(c.name)}</button></div>` : ''}
      <div class="empty"><div class="ring"><i class="${booting || S.agentBusy ? 'fa-solid fa-spinner fa-spin' : S.connected ? 'fa-brands fa-usb' : 'fa-solid fa-power-off'}"></i></div>
        <div class="t">${booting ? 'Looking for devices…' : S.connected ? 'No devices found' : S.agentBusy ? esc(S.buildStep || 'Starting the agent…') : 'Agent not running'}</div>
        <div class="s">${booting ? 'One moment.' : S.connected
          ? 'Plug in the Bolt or Unifying receiver, or pair over Bluetooth. Devices appear here as soon as they connect.'
          : S.agentBusy
            ? 'This can take a minute the first time. The window connects on its own.'
            : needsBuild
              ? 'The agent has not been compiled yet. The app can do that for you.'
              : `${S.agentErr ? esc(S.agentErr) + '. ' : ''}The agent is the background service that talks to your devices.`}</div>
        <div style="display:flex;gap:8px;margin-top:8px">${booting ? '' : S.connected
          ? '<button class="btn primary" data-act="pair"><i class="fa-solid fa-plus"></i>Pair a device</button>'
          : S.agentBusy ? '' : `<button class="btn primary" data-act="start-agent"><i class="fa-solid ${needsBuild ? 'fa-hammer' : 'fa-play'}"></i>${needsBuild ? 'Build and start' : 'Start the agent'}</button>`}${booting ? '' : '<button class="btn" data-act="onboard"><i class="fa-solid fa-shield-halved"></i>Setup guide</button>'}</div></div></main></div>`;
  }
  // Windows needs nothing granted; macOS needs Accessibility so LogiMX can press keys and buttons
  function onboardPermissions() {
    const agentOk = S.connected, conf = S.conflicts.length, ax = S.ax || { trusted: true };
    const mark = (ok, n) => ok ? '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>' : `<span class="mark-n">${n}</span>`;
    return `<div><h1>${IS_MAC() ? 'Permissions' : 'Getting ready'}</h1><div class="lead">${IS_MAC() ? 'LogiMX talks to your devices directly. To press keys and buttons for you, macOS asks you to allow it once.' : 'LogiMX talks to your devices directly. Nothing else needs to be installed.'}</div></div>
      ${card(`<div class="row">${mark(agentOk, 1)}<div class="grow"><div class="lbl">Background agent</div><div class="sub">${agentOk ? 'Running' : S.agentBusy ? 'Starting…' : esc(S.agentErr || 'Not running yet')}</div></div>${agentOk || S.agentBusy ? '' : '<button class="btn sm" data-act="start-agent">Start</button>'}</div>
        ${IS_MAC() ? `<div class="row">${mark(ax.trusted, 2)}<div class="grow"><div class="lbl">Accessibility</div><div class="sub">${ax.trusted ? 'Allowed' : 'System Settings > Privacy & Security > Accessibility: switch on LogiMX'}</div></div>${ax.trusted ? '' : '<button class="btn sm" data-act="ax-open">Open settings</button>'}</div>` : ''}
        <div class="row">${mark(!conf, IS_MAC() ? 3 : 2)}<div class="grow"><div class="lbl">Quit Logi Options+ while LogiMX runs</div>${conf ? `<div class="sub">${esc(S.conflicts.map(c => toolName(c.name)).join(', '))} is running</div>` : ''}</div>${conf ? `<button class="btn sm" data-act="stop-tool" data-tool="${esc(S.conflicts[0].name)}">Stop</button>` : ''}</div>`)}`;
  }
  function renderOnboard() {
    const o = S.ob;
    const steps = [[1, 'Permissions', IS_LINUX() ? 'udev rule and uinput' : IS_MAC() ? 'Accessibility' : 'Background agent'], [2, 'Devices', 'Choose what to manage'], [3, 'Preset', IS_LINUX() ? 'GNOME, macOS or Windows-like' : 'Gestures and the thumb wheel']].map(([n, t, s]) => `<button class="ob-step ${n === o.step ? 'cur' : n < o.step ? 'done' : ''}" data-act="ob-step" data-key="${n}"><span class="n">${n < o.step ? '✓' : n}</span><div><div class="t">${t}</div><div class="s">${s}</div></div></button>`).join('');
    let body = '';
    if (o.step === 1 && !IS_LINUX()) body = onboardPermissions();
    else if (o.step === 1) {
      const agentOk = S.connected, devOk = S.devices.length > 0;
      const conf = S.conflicts.length;
      body = `<div><h1>Permissions</h1><div class="lead">LogiMX talks to devices over HID and emits keys through uinput. Both need a one-time udev rule.</div></div>
        ${card(`<div class="row">${agentOk ? '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>' : '<span class="mark-n">1</span>'}<div class="grow"><div class="lbl">Background agent</div><div class="sub">${agentOk ? 'Running' : S.agentBusy ? 'Starting…' : esc(S.agentErr || 'Not running yet')}</div></div>${agentOk || S.agentBusy ? '' : `<button class="btn sm" data-act="start-agent">${agentNeedsBuild() ? 'Build and start' : 'Start now'}</button>`}</div>
          <div class="row">${devOk ? '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>' : '<span class="mark-n">2</span>'}<div class="grow"><div class="lbl">Access to /dev/hidraw* and /dev/uinput</div>${devOk ? '' : '<code class="cmd">sudo cp udev/60-logimx.rules /etc/udev/rules.d/ && sudo udevadm control --reload && sudo udevadm trigger</code>'}</div></div>
          <div class="row">${conf ? '<span class="mark-n">3</span>' : '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>'}<div class="grow"><div class="lbl">Stop Solaar or logid while LogiMX runs</div>${conf ? `<div class="sub">${esc(S.conflicts.map(c => c.name).join(', '))} is running</div>` : ''}</div>${conf ? `<button class="btn sm" data-act="stop-tool" data-tool="${esc(S.conflicts[0].name)}">Stop</button>` : ''}</div>`)}
        ${devOk ? '' : '<div><button class="btn primary" data-act="install-udev"><i class="fa-solid fa-shield-halved"></i>Install rule with pkexec</button></div>'}`;
    } else if (o.step === 2) {
      body = `<div><h1>Your devices</h1><div class="lead">${S.devices.length ? 'Found on the receiver.' : 'No devices yet. Switch a device on or plug in the receiver.'}</div></div>
        ${card(S.devices.map(d => `<div class="row"><span class="mark-ok"><i class="fa-solid fa-check"></i></span><i class="fa-solid ${isMouse(d) ? 'fa-computer-mouse' : 'fa-keyboard'}" style="color:var(--dim)"></i><div class="grow"><div class="lbl">${esc(d.name)}</div><div class="sub">${d.transport === 'bolt' ? 'Bolt' : 'Bluetooth'} · host ${((d.state || {}).hosts || {}).current + 1 || 1}</div></div><span class="val">${d.battery ? d.battery.percent + '%' : ''}</span></div>`).join('') || row('Waiting for devices…', '', ''))}
        <div><button class="btn" data-act="pair"><i class="fa-solid fa-plus"></i>Pair another device</button></div>`;
    } else {
      const presets = [['gnome', 'fa-linux', 'GNOME defaults', 'Gestures drive Overview and workspaces. F-keys follow the shell.'], ['mac', 'fa-apple', 'macOS-like', 'Gesture button acts as Mission Control; thumb wheel switches desktops.'], ['win', 'fa-windows', 'Windows-like', 'Task View on gesture tap, Alt+Tab on swipe; media row unchanged.']].filter(([k]) => IS_LINUX() || k !== 'gnome')
        .sort((a, b) => (b[0] === (IS_WIN() ? 'win' : IS_MAC() ? 'mac' : 'gnome')) - (a[0] === (IS_WIN() ? 'win' : IS_MAC() ? 'mac' : 'gnome')));
      body = `<div><h1>Pick a preset</h1><div class="lead">A starting point for buttons, gestures and F-keys. Everything can be changed later.</div></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${presets.map(([k, i, n, d]) => `<button class="choice ${o.preset === k ? 'on' : ''}" style="flex-direction:column;align-items:flex-start;gap:8px" data-act="ob-preset" data-key="${k}"><i class="fa-brands ${i}" style="font-size:22px;color:${o.preset === k ? 'var(--acc)' : 'var(--dim)'}"></i><span style="font-weight:600">${n}</span><span class="sub">${d}</span></button>`).join('')}</div>`;
    }
    return `<div class="window"><main class="main"><header class="hb"><span class="title">Welcome to LogiMX</span><div class="right"><button class="hbtn close" data-act="ob-close"><i class="fa-solid fa-xmark"></i></button></div></header>
      <div class="onboard"><div class="steps-col">${steps}<div class="hint" style="margin-top:auto">Step ${o.step} of 3</div></div>
      <div class="ob-body">${body}<div class="ob-foot"><button class="btn" data-act="ob-prev" ${o.step === 1 ? 'disabled' : ''}>Back</button><button class="btn primary" data-act="ob-next">${o.step === 3 ? 'Finish' : 'Continue'}</button></div></div></div></main></div>`;
  }

  // ============================================================ bind
  function bind() {
    root.querySelectorAll('[data-stop]').forEach(e => e.onclick = ev => ev.stopPropagation());
    root.querySelectorAll('.nav-item').forEach(b => b.onclick = () => go(b.dataset.page, b.dataset.dev || S.dev));
    // a button's name beside the mouse opens it just like its ring
    root.querySelectorAll('.ms-lab[data-ring]').forEach(l => l.onclick = () => { const h = root.querySelector(`.hotspot.ms[data-cid="${l.dataset.ring}"]`); if (h && h.onclick) h.onclick(); });
    root.querySelectorAll('.hotspot.pt').forEach(h => h.onclick = () => onAction('pt-pick', h));
    root.querySelectorAll('.hotspot:not(.pt)').forEach(h => h.onclick = () => openPicker({ drawer: h.classList.contains('key-photo') || h.classList.contains('ms'), dev: dev(), section: h.dataset.section, cid: h.dataset.cid === 'thumb' ? 'thumb' : Number(h.dataset.cid), label: h.dataset.name ? h.dataset.name : h.querySelector('title') ? h.querySelector('title').textContent.split(':')[0] : (h.dataset.section === 'thumbwheel' ? 'Thumb wheel' : (dev().controls.find(c => c.cid === Number(h.dataset.cid)) || {}).label) }));
    root.querySelectorAll('[data-act]').forEach(b => {
      const act = b.dataset.act;
      if (b.tagName === 'INPUT' && b.type === 'range') {
        b.oninput = () => { const out = root.querySelector(`[data-out="${b.dataset.out}"]:not(input)`); if (out) out.textContent = fmtOut(b.dataset.out, Number(b.value)); };
        b.onchange = () => onAction(act, b);
      } else if (b.tagName === 'SELECT') b.onchange = () => onAction(act, b);
      else if (b.tagName === 'INPUT') b.onchange = () => onAction(act, b);
      else b.onclick = e => { e.stopPropagation(); onAction(act, b, e); if (b.classList.contains('switch')) b.classList.toggle('on'); };   // a switch moves at once; the state it reports was read before this
    });
    root.querySelectorAll('[data-field]').forEach(i => {
      i.onclick = e => e.stopPropagation();
      i.oninput = () => { if (S.dlg === 'picker' && S.picker && S.picker.drawer) { const f = i.dataset.field; S.picker[f] = i.value; if (f === 'cmd' || f === 'text' || f === 'open') S.picker.cat = 'cmd'; else if (f === 'typed') S.picker.cat = 'key'; if (f === 'q') render(); return; } if (S.dlg === 'report') { S.report = Object.assign({}, S.report, { [i.dataset.field]: i.value }); return; } if (S.dlg === 'picker') { S.picker[i.dataset.field] = i.value; if (i.dataset.field === 'q') { if (S.picker.cat === 'app') renderAppList(); else { const list = root.querySelector('.acts'); if (list) renderPickerList(); } } } if (S.dlg === 'prompt') { const f = S.prompt.fields.find(f => f.key === i.dataset.field); if (f) f.value = i.value; } };
      i.onkeydown = e => { if (e.key === 'Enter' && S.dlg === 'prompt') { e.preventDefault(); onAction('prompt-ok'); } if (e.key === 'Enter' && S.dlg === 'picker' && S.picker && S.picker.drawer && ['cmd', 'text', 'open'].includes(i.dataset.field)) { e.preventDefault(); S.picker.cat = 'cmd'; onAction('pick-assign'); } };
    });
    if (S.dlg === 'picker' && S.picker.cat === 'key' && S.picker.recording && !recorderActive()) armRecorder();
    const typed = root.querySelector('[data-field="typed"]');
    if (typed) {
      // The recorder swallows every key while it is armed (the agent grab takes them before the
      // page, the in-page fallback preventDefaults them), so typing needs it out of the way.
      typed.onfocus = () => {
        if (!S.picker || !S.picker.recording) return;
        stopRecorder(); S.picker.recording = false;
        const t = root.querySelector('.recbox .t'); if (t) t.textContent = 'Click here, then press the keys';
        const box = root.querySelector('.recbox');
        if (box && !box.querySelector('[data-act="rec-start"]')) { const b = document.createElement('button'); b.className = 'btn primary'; b.dataset.act = 'rec-start'; b.textContent = 'Start recording'; b.onclick = e => { e.stopPropagation(); onAction('rec-start', b, e); }; box.appendChild(b); }
      };
      typed.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); onAction('pick-assign', typed); } };
    }
    // A re-render replaces the search box, and focusing it again would drop the caret to the
    // start, so anything typed next lands in front of what is already there.
    const q = root.querySelector('[data-field="q"]');
    if (q && S.dlg === 'picker' && (S.picker.cat !== 'key' || S.picker.drawer) && !S.picker.recording) setTimeout(() => {
      if (document.activeElement === q) return;
      q.focus();
      const n = q.value.length;
      try { q.setSelectionRange(n, n); } catch (e) {}
    }, 20);
  }
  function fmtOut(k, v) { if (k === 'pf') { const f = (((dev() || {}).state || {}).force || [])[0]; return f ? Math.round((v - f.min) * 100 / Math.max(1, f.max - f.min)) + '%' : String(v); } if (k === 'pspeed' || k === 'sst' || k === 'dpi' || k === 'tws') return String(v); if (k === 'thr') return v + '%'; if (k === 'bld') return v >= 60 ? `${Math.floor(v / 60)} min${v % 60 ? ' ' + (v % 60) + ' s' : ''}` : v + ' s'; if (k === 'dur') return (v / 1000).toFixed(1) + ' s'; return String(v); }
  function appTabHtml(p) {
    const q = (p.q || '').toLowerCase();
    const match = a => !q || (a.name || '').toLowerCase().includes(q) || (a.wm_class || '').toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q);
    const row = a => `<button class="act ${p.launch === a.id ? 'on' : ''}" data-act="pick-launch" data-key="${esc(a.id)}" title="${esc(a.wm_class || a.id)}"><i class="fa-solid ${a.source === 'steam' ? 'fa-gamepad' : 'fa-rocket'} ic"></i><span class="t">${esc(a.name)}</span>${a.source === 'steam' ? '<span class="m">Steam</span>' : ''}</button>`;
    const running = (S.running || []).filter(a => a.id && match(a));
    const runningIds = new Set(running.map(a => a.id));
    const rest = (S.apps || []).filter(a => match(a) && !runningIds.has(a.id));
    if (!running.length && !rest.length) return `<div class="row hint">${S.apps ? 'No application matches that search.' : 'Loading applications…'}</div>`;
    return (running.length ? sec('Running now', `<div class="acts">${running.map(row).join('')}</div>`) : '') +
      (rest.length ? sec(running.length ? 'All applications' : 'Applications', `<div class="acts">${rest.map(row).join('')}</div>`) : '');
  }
  // Replace only the list, so the search box keeps focus and the caret stays at the end.
  function renderAppList() {
    const wrap = root.querySelector('.applist');
    if (!wrap) return;
    wrap.innerHTML = appTabHtml(S.picker);
    wrap.querySelectorAll('[data-act]').forEach(b => b.onclick = e => { e.stopPropagation(); onAction('pick-launch', b); });
  }
  function renderPickerList() { const p = S.picker; const list = root.querySelector('.acts'); if (!list) return; const items = pickerItems(p); const curKey = typeof p.current === 'string' ? p.current : (p.current && p.current.preset); list.innerHTML = items.map(i => `<button class="act ${curKey === i.key || p.sel === i.key ? 'on' : ''}" data-act="pick-item" data-key="${i.key}"><i class="fa-solid ${i.icon} ic"></i><span class="t">${esc(i.label)}</span><span class="m">${i.meta}</span><i class="fa-solid fa-check chk"></i></button>`).join('') || '<div class="row hint">No actions match</div>'; list.querySelectorAll('[data-act]').forEach(b => b.onclick = e => { e.stopPropagation(); onAction('pick-item', b); }); }
  // The window manager reserves Alt+Tab, Super and Ctrl+Alt+arrow, and acts on them before any
  // window sees them. The agent can grab the keyboard at the X level, which overrides that, so
  // ask it first and fall back to listening in the page (Wayland, or no X display).
  function armRecorder() {
    // Re-renders happen for unrelated reasons (a battery tick every 30 s); restarting the recorder
    // then would drop the keys already held and leave the next release with nothing to finish.
    if (recorderActive()) return;
    const onPartial = chord => {
      S.picker.chord = chord;
      const box = root.querySelector('.recbox .keys');
      if (box) box.innerHTML = chord.map(k => `<span>${esc(keyName(k))}</span>`).join('');
    };
    const onFinal = keys => {
      agentGrab = false;
      S.picker.chord = keys;
      S.picker.recording = false;
      if (keys && keys.length) assignPicked({ type: 'keystroke', keys });
      else render();
    };
    const gen = ++recGen;
    armPending = true;
    window.agent.call('record_start').then(() => {
      armPending = false;
      // disarmed while the agent was setting the grab up (the typed field took focus): let go
      // again, or the agent would keep swallowing keys the page no longer wants
      if (gen !== recGen) { window.agent.call('record_cancel').catch(() => {}); return; }
      agentGrab = true; recordDone = onFinal; recordPartial = onPartial;
    })
      .catch(() => {
        armPending = false;
        if (gen !== recGen) return;
        agentGrab = false;
        startRecorder((chord, cancelled) => {
          if (cancelled) { S.picker.chord = chord; S.picker.recording = false; render(); return; }
          onPartial(chord);
        }, onFinal);
      });
  }
  function openPicker(t) {
    // what is open right now, so the launch list can lead with it instead of 122 alphabetical entries
    window.agent.call('running_apps').then(r => { S.running = r; if (S.picker && S.picker.cat === 'app') renderAppList(); }).catch(() => { S.running = []; });
    const d = t.dev || dev();
    const section = t.section, cid = t.cid;
    const gslot = section === 'gesture' && d && t.slot ? gestureObject(d, cid)[t.slot] : null;
    const current = section === 'gesture' ? (gslot ? gslot.preset || gslot : null) : section === 'ring' ? (ringSlots()[cid] || {}).action || null : assignment(d, section, cid, t.profile);
    const ctl = typeof cid === 'number' && section !== 'ring' && d ? d.controls.find(c => c.cid === cid) : null;
    S.picker = { drawer: !!t.drawer, fold: t.drawer ? { rec: true } : null, dev: d ? d.id : null, section, cid, label: t.label, profile: t.profile || 'default', cat: t.cat || 'all', current, ctl, sel: null, slot: t.slot, recording: t.drawer ? false : t.cat === 'key' };
    S.dlg = 'picker'; render();
  }
  async function assignPicked(action) {
    const p = S.picker; const d = S.devices.find(x => x.id === p.dev);
    if (p.section === 'ring') {
      const slots = ringSlots();
      slots[p.cid] = { action, label: presetLabel(action), icon: actionIcon(action) };
      await saveRingSlots(slots);
      if (p.drawer) { p.current = action; p.sel = null; p.selKey = null; p.cat = 'all'; p.chord = []; p.typed = ''; render(); toast(`Slot ${p.cid + 1}: ${presetLabel(action)}`); return; }
      S.dlg = null; toast(`Slot ${p.cid + 1}: ${presetLabel(action)}`); render(); return;
    }
    if (p.section === 'gesture') {
      const cid = gestureControl(d), g = gestureObject(d, cid);
      let sub = typeof action === 'string' ? JSON.parse(JSON.stringify(S.presets.all[action])) : action;
      if (typeof action === 'string') sub.preset = action;
      if (sub.type === 'scroll' && !sub.amount) sub.amount = (p.slot === 'up' || p.slot === 'right') ? 360 : -360;
      g[p.slot] = sub; g.label = 'Custom gestures'; g.type = 'gesture';
      await setAssign(d, 'buttons', cid, g);
    } else {
      await setAssign(d, p.section, p.cid, action, p.profile);
    }
    if (p.drawer) { p.current = action; p.sel = null; p.selKey = null; p.cat = 'all'; p.chord = []; p.typed = ''; render(); toast('Assigned ' + presetLabel(action)); return; }
    S.dlg = null; toast('Assigned ' + presetLabel(action)); render();
  }

  async function onAction(act, b, e) {
    const d = dev(); const key = b && b.dataset.key;
    switch (act) {
      case 'page': go(b.dataset.page); return;
      case 'go-home':
        // opened from a button's Configure: back to the mouse's Buttons, panel and all
        if (S.cfgFrom && S.page === 'gestures') { const to = S.cfgFrom; const back = () => { S.cfgFrom = null; S.page = to; S.picker = null; }; if (drawerUp()) closeDrawer(back); else { back(); render(); } return; }
        // with a panel open on the right, the back arrow folds the panel away first
        if (drawerUp()) { closeDrawer(); return; }
        if (root.querySelector('.devview2.panel-open')) { closeDrawer(() => { S.blClosed = true; }); return; }
        if (S.picker && S.picker.recording) { stopRecorder(); S.picker.recording = false; } go('home'); return;
      case 'home-step': { const n = Math.ceil(S.devices.length / HOME_PER_VIEW); S.homeAt = Math.max(0, Math.min(n - 1, (S.homeAt || 0) + Number(key))); S.homeSlide = Number(key); render(); return; }
      case 'home-open': go(devicePages(S.devices.find(x => x.id === key) || {})[0], key); return;
      case 'bl-open': if (S.blClosed) { S.blClosed = false; render(); } return;
      // Point & scroll opens on the mouse alone, like Buttons; its tag or the mouse opens the panel
      case 'home-page': S.blClosed = b.dataset.page === 'pointer'; S.ptSel = null; go(b.dataset.page, key); return;
      case 'pt-pick': { const k = b.dataset.cid; if (!S.blClosed && S.ptSel === k) { closeDrawer(() => { S.blClosed = true; }); return; } S.ptSel = k; S.blClosed = false; render(); return; }
      case 'dir-pick': { S.dir = key; const cid = gestureControl(d); openPicker({ drawer: S.page === 'gestures', dev: d, section: 'gesture', cid, label: SLOTS[key][0], slot: SLOTS[key][1] }); return; }
      case 'goinfo': go('info', S.dev); return;
      case 'back-apps': S.appDetail = null; render(); return;
      case 'win-close': window.agent.windowAction('close'); return;
      case 'quit': window.agent.windowAction('quit'); return;
      case 'menu-theme': S.menu = S.menu === 'theme' ? null : 'theme'; render(); return;
      case 'menu-main': S.menu = S.menu === 'main' ? null : 'main'; render(); return;
      case 'menu-ringprof': S.menu = S.menu === 'ringprof' ? null : 'ringprof'; render(); return;
      case 'theme': S.theme = key; try { localStorage.setItem('theme', key); } catch (x) {} window.agent.setTheme(key); S.menu = null; render(); return;
      case 'theme-select': S.theme = b.value; try { localStorage.setItem('theme', b.value); } catch (x) {} window.agent.setTheme(b.value); render(); return;
      case 'start-agent': {
        const build = agentNeedsBuild();
        S.agentBusy = true; S.agentErr = null; S.buildStep = build ? 'Preparing the build…' : null; render();
        let r;
        try { r = build ? await window.agent.buildAgent() : await window.agent.startAgent(); }
        catch (x) { r = { ok: false, error: x.message }; }
        S.agentBusy = false; S.buildStep = null;
        try { S.agentInfo = await window.agent.agentInfo(); } catch (x) {}
        if (r && r.ok) { toast('Agent started'); try { await refresh(); } catch (x) {} }
        else { S.agentErr = (r && r.error) || 'could not start'; toast('Could not start the agent: ' + S.agentErr, true); }
        render(); return;
      }
      case 'osd-test': window.agent.osdTest(key); return;
      case 'pause': await call(S.status.paused ? 'resume_diversion' : 'pause_diversion'); S.status = await call('status'); render(); return;
      case 'dismiss-conflict': S.conflictDismissed = true; render(); return;
      case 'stop-tool': { const r = await window.agent.stopTool(b.dataset.tool); toast(r && r.ok ? `${b.dataset.tool} stopped` : (r && r.error) || 'Could not stop', !(r && r.ok)); setTimeout(refresh, 1500); return; }
      case 'open': window.agent.openExternal(b.dataset.url); return;
      case 'flow-install': window.agent.flowInstall(); S.flowStatus = 'installing'; render(); return;
      case 'flow-begin': S.flowSetup = true; if (S.flow && !S.flow.installed) { window.agent.flowInstall(); S.flowStatus = 'installing'; } render(); return;
      case 'flow-start': { const r = await window.agent.flowStart(); if (r && !r.ok) toast(r.error || 'Could not start Flow', true); flowRefresh(); return; }
      case 'flow-stop': await window.agent.flowStop(); flowRefresh(); return;
      case 'flow-name': { const v = (b.value || '').trim(); if (v) await window.agent.flowConfig({ name: v }); flowRefresh(); return; }
      case 'flow-clip': { const cur = (S.flow || {}).clipboard !== false; await window.agent.flowConfig({ clipboard: !cur }); flowRefresh(); return; }
      case 'flow-peer-add': prompt('Add computer', [{ key: 'name', label: 'Name', placeholder: 'macbook, work-pc…' }], async v => { const name = (v.name || '').trim(); if (!name) return; const peers = ((S.flow || {}).peers || []).slice(); if (peers.some(p => p.name === name)) return toast('That name is already added', true); peers.push({ name: name.replace(/[^A-Za-z0-9_-]/g, '-'), pos: 'right' }); await window.agent.flowConfig({ peers }); flowRefresh(); }, 'Add'); return;
      case 'flow-peer-del': { const peers = ((S.flow || {}).peers || []).slice(); peers.splice(Number(b.dataset.i), 1); await window.agent.flowConfig({ peers }); flowRefresh(); return; }
      case 'flow-peer-pos': { const peers = ((S.flow || {}).peers || []).slice(); const i = Number(b.dataset.i); if (peers[i]) peers[i] = Object.assign({}, peers[i], { pos: b.value }); await window.agent.flowConfig({ peers }); flowRefresh(); return; }
      case 'open-bt': window.agent.openBluetooth(); toast('Opening Bluetooth settings'); return;
      case 'close-dlg': if (S.dlg === 'prompt' && S.prompt && S.prompt.back) { S.dlg = S.prompt.back; render(); return; } if (drawerUp()) { closeDrawer(); return; } stopRecorder(); if (S.dlg === 'pair') call('pair_cancel').catch(() => {}); S.dlg = null; render(); return;
      case 'dir': S.dir = key; render(); return;
      case 'pick': openPicker({ drawer: S.page === 'gestures' && (b.dataset.section === 'ring' || b.dataset.section === 'gesture'), dev: b.dataset.dev ? S.devices.find(x => x.id === b.dataset.dev) : d, section: b.dataset.section, cid: b.dataset.cid === 'thumb' ? 'thumb' : Number(b.dataset.cid), label: b.dataset.label, cat: b.dataset.cat, profile: b.dataset.profile }); return;
      case 'pick-gesture': openPicker({ drawer: S.page === 'gestures', dev: d, section: 'gesture', cid: gestureControl(d), label: SLOTS[S.dir][0], slot: b.dataset.slot }); return;
      case 'pick-gestures': {
        // this button now carries gestures: what it had for them before, else the navigation set
        const p = S.picker, dd = S.devices.find(x => x.id === p.dev) || d, g = gestureObject(dd, p.cid);
        g.type = 'gesture';
        await setAssign(dd, 'buttons', p.cid, g, p.profile);
        S.holdCid = Object.assign({}, S.holdCid, { [dd.id]: p.cid });
        p.current = g; p.sel = null;
        toast(`Gestures on ${p.label || 'this button'}`);
        render(); return;
      }
      case 'gest-config': {
        const p = S.picker, dd = S.devices.find(x => x.id === p.dev) || d;
        stopRecorder();
        S.holdCid = Object.assign({}, S.holdCid, { [dd.id]: p.cid });
        go('gestures', dd.id);
        S.cfgFrom = 'buttons';
        render();
        return;
      }
      case 'ring-config': {
        // to the ring's settings: on this mouse's Gestures & action ring page when the button can carry
        // it there, otherwise the Action ring page
        const p = S.picker, dd = S.devices.find(x => x.id === p.dev) || d, cap = dd && gestureCapable(dd).some(c => c.cid === p.cid);
        stopRecorder();
        if (!cap) { go('ring'); return; }
        // the ring in the middle with its actions open on the right (the left bar folds away, as
        // with any panel); the back arrow returns to the mouse's Buttons
        S.holdCid = Object.assign({}, S.holdCid, { [dd.id]: p.cid });
        go('gestures', dd.id);
        S.cfgFrom = 'buttons';
        const slots = ringSlots(), first = Math.max(0, slots.findIndex(s => !s));
        openPicker({ drawer: true, dev: dd, section: 'ring', cid: first, label: RING_DIRS[first] });
        return;
      }
      case 'acc-toggle': { const p = S.picker; p.fold = Object.assign({}, p.fold, { [key]: !(p.fold || {})[key] }); p.unfolded = p.fold[key] ? key : null; render(); return; }
      case 'rec-open': { const p = S.picker; p.q = ''; p.fold = Object.assign({}, p.fold, { rec: true }); p.sel = null; p.selKey = null; if (p.cat === 'key') { stopRecorder(); p.recording = false; p.cat = 'all'; } else { p.cat = 'key'; p.recording = true; } render(); return; }
      case 'pick-key': { const p = S.picker; if (p.drawer) return assignPicked({ type: 'keystroke', keys: [key] }); p.cat = 'all'; p.sel = { type: 'keystroke', keys: [key] }; p.selKey = 'key:' + key; root.querySelectorAll('.drawer .act').forEach(x => x.classList.toggle('on', x.dataset.act === 'pick-key' && x.dataset.key === key)); root.querySelectorAll('.drawer .kc').forEach(x => x.classList.toggle('on', x.dataset.key === key)); return; }
      case 'pick-cat': S.picker.cat = key; S.picker.recording = key === 'key'; render(); return;
      case 'pick-item': if (S.picker.drawer) return assignPicked(key); S.picker.sel = key; root.querySelectorAll(S.picker.drawer ? '.drawer .act, .drawer .kc' : '.act').forEach(x => x.classList.toggle('on', x.dataset.act === 'pick-item' && x.dataset.key === key)); return;
      case 'rec-start': if (S.picker.drawer) S.picker.cat = 'key'; if (S.picker.recording) return; S.picker.recording = true; render(); return;
      case 'pick-launch': { if (S.picker.drawer) { S.picker.cat = 'app'; S.picker.launch = key; S.picker.cmd = S.picker.text = S.picker.open = ''; return onAction('pick-assign'); } S.picker.launch = key; S.picker.cmd = ''; S.picker.text = ''; S.picker.open = ''; if (S.picker.cat === 'app') renderAppList(); else render(); return; }
      case 'pick-disable': await assignPicked('nothing'); return;
      case 'ring-test': window.agent.ringShow(); return;
      case 'ring-travel': await saveRing({ travel: Number(b.value) }); return;
      case 'ring-free': await saveRing({ free_pointer: !b.classList.contains('on') }); render(); return;
      case 'ring-profile': await saveRing({ active: Number(key) }); S.menu = null; if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null; render(); return;
      case 'ring-profile-add': S.menu = null; prompt('New ring profile', [{ key: 'name', label: 'Name', placeholder: 'Work, Editing, Gaming…' }], async v => { const r = ringState(); const name = (v.name || '').trim() || `Profile ${r.profiles.length + 1}`; r.profiles.push({ name, slots: [] }); await saveRing({ profiles: r.profiles, active: r.profiles.length - 1 }); toast(`Profile "${name}" added`); render(); }, 'Create'); return;
      case 'ring-profile-copy': { const r = ringState(); const src = r.profiles[r.active]; r.profiles.push({ name: src.name + ' copy', slots: JSON.parse(JSON.stringify(src.slots)) }); await saveRing({ profiles: r.profiles, active: r.profiles.length - 1 }); toast('Profile duplicated'); render(); return; }
      case 'ring-profile-rename': { const r = ringState(); prompt('Rename ring profile', [{ key: 'name', label: 'Name', value: r.profiles[r.active].name }], async v => { const name = (v.name || '').trim(); if (!name) return render(); const n = ringState(); n.profiles[n.active].name = name; await saveRing({ profiles: n.profiles }); render(); }, 'Rename'); return; }
      case 'ring-profile-delete': { S.menu = null; const r = ringState(); if (r.profiles.length < 2) return; const gone = r.profiles.splice(r.active, 1)[0]; await saveRing({ profiles: r.profiles, active: Math.max(0, r.active - 1) }); toast(`Profile "${gone.name}" deleted`); render(); return; }
      case 'ring-clear': await saveRingSlots([]); toast('Slots cleared'); render(); return;
      case 'pick-default': {
        const p = S.picker; const dd = S.devices.find(x => x.id === p.dev) || d;
        if (p.section === 'ring') { const slots = ringSlots(); slots[p.cid] = null; await saveRingSlots(slots); S.dlg = null; toast(`Slot ${p.cid + 1} cleared`); render(); return; }
        const defs = ((await window.agent.call('defaults', { id: dd.id })).profiles || {}).default || {};
        let a = 'native';
        if (p.section === 'thumbwheel') a = defs.thumbwheel || 'native';
        else if (p.section === 'gesture') a = 'nothing';
        else a = (defs[p.section] || {})[String(p.cid)] || 'native';
        if (p.profile && p.profile !== 'default') { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[p.profile] && profs[p.profile][p.section]) { delete profs[p.profile][p.section][String(p.cid)]; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } S.picker = null; toast('Override removed, follows All applications'); render(); return; }
        await assignPicked(a); return;
      }
      case 'pick-assign': {
        const p = S.picker;
        if (p.cat === 'key') {
          const t = (p.typed || '').trim();
          if (t) { stopRecorder(); return assignPicked({ type: 'keystroke', keys: t.split('+').map(k => 'KEY_' + k.trim().toUpperCase().replace(/^CTRL$/, 'LEFTCTRL').replace(/^SHIFT$/, 'LEFTSHIFT').replace(/^ALT$/, 'LEFTALT').replace(/^SUPER$|^META$|^WIN$/, 'LEFTMETA')) }); }
          // whatever the box shows is what the user wants, whether or not the recorder saw a release
          if ((p.chord || []).length) { stopRecorder(); p.recording = false; return assignPicked({ type: 'keystroke', keys: p.chord.slice() }); }
          return toast('Record or type a keystroke first', true);
        }
        if (p.cat === 'cmd') { if (p.cmd) return assignPicked({ type: 'command', cmd: p.cmd, label: 'Run: ' + p.cmd }); if (p.text) return assignPicked({ type: 'type_text', text: p.text }); if (p.open) return assignPicked({ type: 'open', target: p.open, label: 'Open ' + p.open.replace(/^https?:\/\//, '').slice(0, 24) }); return toast('Enter a command, text or target', true); }
        if (p.cat === 'app') {
          if (!p.launch) return toast('Pick an application first', true);
          const a = (S.apps || []).concat(S.running || []).find(x => x.id === p.launch);
          if (a && a.url) return assignPicked({ type: 'open', target: a.url, label: a.name });
          return assignPicked({ type: 'launch', app: p.launch, label: a ? a.name : p.launch });
        }
        if (p.sel) return assignPicked(p.sel);
        return toast('Pick an action first', true);
      }
      case 'gesture-preset': await setAssign(d, 'buttons', gestureControl(d), key); render(); return;
      case 'gest-mode': { const cid = gestureControl(d), g = gestureObject(d, cid); g.continuous = key === 'continuous'; if (g.continuous && !g.step) g.step = 40; g.type = 'gesture'; await setAssign(d, 'buttons', cid, g); render(); return; }
      case 'gest-enable': { const cid = gestureControl(d); const on = !b.classList.contains('on'); if (on) { const g = gestureObject(d, cid); g.type = 'gesture'; await setAssign(d, 'buttons', cid, g); } else await setAssign(d, 'buttons', cid, 'native'); render(); return; }
      case 'gest-button': { S.holdCid = Object.assign({}, S.holdCid, { [d.id]: Number(b.value) }); render(); return; }
      case 'hold-mode': {
        // one button, one job: taking the ring keeps the gestures aside so they come back as they were
        const cid = gestureControl(d), cur = assignment(d, 'buttons', cid);
        const curType = (typeof cur === 'string' ? (S.presets.all[cur] || {}) : (cur || {})).type;
        if (curType === 'gesture') S.ui = await window.agent.uiSettings({ savedGesture: Object.assign({}, (S.ui || {}).savedGesture, { [d.id + ':' + cid]: gestureObject(d, cid) }) }) || S.ui;
        if (key === 'ring') await setAssign(d, 'buttons', cid, 'action_ring');
        else if (key === 'gestures') { const g = gestureObject(d, cid); g.type = 'gesture'; await setAssign(d, 'buttons', cid, g); }
        else await setAssign(d, 'buttons', cid, 'native');
        toast(key === 'ring' ? 'Action ring on this button' : key === 'gestures' ? 'Gestures on this button' : 'Button left to the mouse');
        render(); return;
      }
      case 'gest-sens': { const cid = gestureControl(d), g = gestureObject(d, cid); g.threshold = 165 - 15 * Number(b.value); g.type = 'gesture'; await setAssign(d, 'buttons', cid, g); return; }
      case 'gest-step': { const cid = gestureControl(d), g = gestureObject(d, cid); g.step = Number(b.value); g.type = 'gesture'; await setAssign(d, 'buttons', cid, g); return; }
      case 'dpi': await setSetting(d, ['dpi'], Number(b.value)); return;
      case 'pspeed': await setSetting(d, ['pointer_speed'], Number((Number(b.value) / 50 - 1).toFixed(2))); return;
      case 'setting': { const on = !b.classList.contains('on'); const path = b.dataset.path.split('.'); let v = b.dataset.on ? (on ? b.dataset.on : b.dataset.off) : on; if (v === 'true') v = true; else if (v === 'false') v = false; await setSetting(d, path, v); render(); return; }
      case 'setting-val': await setSetting(d, b.dataset.path.split('.'), b.dataset.val); render(); return;
      case 'setting-range': await setSetting(d, b.dataset.path.split('.'), Number(b.value)); return;
      case 'haptic-level': await setSetting(d, ['haptic', 'level'], Number(b.value)); window.agent.call('haptic_play', { id: d.id, waveform: 4 }).catch(() => {}); return;
      case 'haptic-play': window.agent.call('haptic_play', { id: d.id, waveform: Number(key) }).catch(e => toast(e.message, true)); return;
      case 'panel-force-reset': { const f = ((d.state || {}).force || [])[0]; if (f) { await setSetting(d, ['panel_force'], f.default); render(); } return; }
      case 'bl-reset': { const def = (((await window.agent.call('defaults', { id: d.id })).settings || {}).backlight) || { enabled: true, mode: 'auto' }; for (const k of ['enabled', 'mode']) if (k in def) await setSetting(d, ['backlight', k], def[k]); await setSetting(d, ['backlight', 'battery_saving'], false); toast('Backlighting reset'); render(); return; }
      case 'bl-level': await setSetting(d, ['backlight', 'mode'], 'manual'); await setSetting(d, ['backlight', 'level'], Number(key)); render(); return;
      case 'step': { const st = (d.state || {}).backlight || {}, s = (d.config.settings || {}).backlight || {}; const v = Math.max(Number(b.dataset.lo), Math.min(Number(b.dataset.hi), (s[key] ?? st[key] ?? 0) + Number(b.dataset.d))); await setSetting(d, ['backlight', key], v); render(); return; }
      case 'thumb-speed': { const tw = assignment(d, 'thumbwheel'); let a = typeof tw === 'string' ? Object.assign({}, S.presets.all[tw], { preset: tw }) : Object.assign({}, tw || S.presets.all.hscroll); a.gain = Number(b.value) * 1.6; await setAssign(d, 'thumbwheel', '', a); return; }
      case 'assign-thumb': await setAssign(d, 'thumbwheel', '', key); render(); return;
      case 'host': await call('change_host', { id: d.id, host: Number(key) }); toast(`${d.name}: switching to host ${Number(key) + 1}`); return;
      case 'rename-host': { const h = d.state.hosts.names[Number(key)]; prompt('Rename host', [{ key: 'name', label: 'Name shown on the device', value: h.name }], async v => { merge(await call('set_host_name', { id: d.id, host: Number(key), name: v.name.trim() })); render(); }, 'Rename'); return; }
      case 'general': await setGeneral({ [key]: !b.classList.contains('on') }); render(); return;
      case 'general-val': await setGeneral({ [key]: b.dataset.val }); render(); return;
      case 'general-range': await setGeneral({ [key]: Number(b.value) }); return;
      case 'osd-event': { const ev = Object.assign({ mic: true, smartshift: true, backlight: true, host: true, dpi: false }, S.general.osd_events || {}); ev[key] = !b.classList.contains('on'); await setGeneral({ osd_events: ev }); render(); return; }
      case 'ui': { const v = !b.classList.contains('on'); S.ui = await window.agent.uiSettings({ [key]: v }) || Object.assign(S.ui, { [key]: v }); render(); return; }
      case 'fwupd': toast('Are you serious now ?'); setTimeout(() => toast('You must be a Windows user !'), 2200); return;
      case 'check-updates': { const r = await window.agent.checkUpdates(); if (!r.ok) return toast('Update check failed: ' + r.error, true); const cur = S.status.version || VERSION; const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; } return false; }; const has = r.latest && newer(r.latest, cur); toast(has ? `Version ${r.latest} is available` : `You are on the latest version (${cur})`); if (has && r.url) window.agent.openExternal(r.url); return; }
      case 'reset-overrides': { for (const dd of S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[key]) { const keep = { name: profs[key].name, match: profs[key].match }; profs[key] = keep; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } } toast('Overrides cleared'); render(); return; }
      case 'reset-buttons': { const defs = ((await window.agent.call('defaults', { id: d.id })).profiles || {}).default || {}; const btns = defs.buttons || {}; for (const cid of Object.keys(btns)) await setAssign(d, 'buttons', cid, btns[cid]); if (defs.thumbwheel) await setAssign(d, 'thumbwheel', null, defs.thumbwheel); toast('Buttons reset to defaults'); render(); return; }
      case 'reset-keys': { const defs = ((await window.agent.call('defaults', { id: d.id })).profiles || {}).default || {}; const keys = defs.keys || {}; const lay = keyLayout(d); for (const { cid } of lay.frow.concat(lay.special)) await setAssign(d, 'keys', cid, keys[cid] || 'native'); toast('Keys reset to defaults'); render(); return; }
      case 'app-detail': { const p = allProfiles().find(x => x.key === key); S.appDetail = key === 'default' ? { key: 'default', name: 'Default' } : Object.assign({ key }, p || { name: key }); S.menu = null; render(); return; }
      case 'add-app': prompt('Add application', [{ key: 'name', label: 'Name', placeholder: 'Firefox', list: (S.apps || []).map(a => ({ value: a.name })) }, { key: 'cls', label: 'Window class to match', placeholder: 'firefox', value: S.status.app || '', list: (S.apps || []).filter(a => a.wm_class || a.id).map(a => ({ value: a.wm_class || a.id, label: a.name })) }], v => addProfile(v.name, v.cls), 'Add', S.status.app ? `Currently focused: ${esc(S.status.app)}` : ''); return;
      case 'add-app-quick': await addProfile(b.dataset.name, b.dataset.cls); return;
      case 'rename-profile': prompt('Rename profile', [{ key: 'name', label: 'Name', value: (S.appDetail || {}).name }], async v => { for (const dd of S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[key]) { profs[key].name = v.name; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } } S.appDetail.name = v.name; render(); }, 'Rename'); return;
      case 'del-profile': { if (!confirm('Remove this profile on all devices?')) return; for (const dd of S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[key]) { delete profs[key]; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } } S.appDetail = null; render(); return; }
      case 'ov-reset': { const dd = S.devices.find(x => x.id === b.dataset.dev); const profs = JSON.parse(JSON.stringify(dd.config.profiles)); const sect = profs[b.dataset.profile][b.dataset.section]; if (sect) delete sect[b.dataset.cid]; merge(await call('set_profiles', { id: dd.id, profiles: profs })); render(); return; }
      case 'export': { const cfg = await call('export_config'); const p = await window.agent.saveJson('logimx-settings.json', cfg); if (p) toast('Saved ' + p); S.menu = null; return; }
      case 'import': { const cfg = await window.agent.openJson(); if (!cfg) return; await call('import_config', { config: cfg }); toast('Settings imported'); S.menu = null; refresh(); return; }
      case 'reset-all': { if (!confirm('Reset every device to default settings and assignments?')) return; for (const dd of S.devices) merge(await call('reset_device', { id: dd.id })); toast('Reset to defaults'); render(); return; }
      case 'show-config': window.agent.openPath(S.status.config_path || '~/.config/logimx'); return;
      case 'sync-device': { const dd = S.devices.find(x => x.id === key); try { merge(await call('sync_from_device', { id: key })); toast(`${dd.name}: settings read from device`); } catch (x) { merge(await call('device', { id: key })); } render(); return; }
      case 'restore-backup': { if (!confirm('Restore this backup? Current settings are backed up first.')) return; await call('restore_backup', { file: key }); toast('Backup restored'); refresh(); return; }
      case 'create-backup': { await call('create_backup', { note: 'Manual' }); S.backups = await call('list_backups'); toast('Backup written'); render(); return; }
      case 'pair': S.pair = { step: 1, found: [] }; S.dlg = 'pair'; S.menu = null; render(); return;
      case 'pair-next': {
        if (S.pair.step === 1 || (S.pair.step === 2 && S.pair.error)) { S.pair.step = 2; S.pair.error = null; S.pair.found = []; S.pair.passkey = null; render(); try { await call('pair_start'); } catch (x) { S.pair.error = x.message || 'Pairing is not available'; render(); } return; }
        if (S.pair.step === 3) { S.dlg = null; render(); return; }
        return;
      }
      case 'pair-confirm': { try { await call('pair_confirm', { address: key }); S.pair.step = 3; S.pair.done = 'Pairing… the device joins when it confirms'; } catch (x) { S.pair.error = x.message; } render(); return; }
      case 'pair-cancel': call('pair_cancel').catch(() => {}); S.dlg = null; render(); return;
      case 'prompt-ok': { const p = S.prompt; const vals = {}; for (const f of p.fields) vals[f.key] = f.value || ''; S.dlg = p.back || null; await p.onOk(vals); return; }
      case 'report': { S.report = { what: '' }; S.dlg = 'report'; render(); const r = await window.agent.diagReport(); S.report = Object.assign({ what: (S.report || {}).what || '' }, r); if (S.dlg === 'report') render(); return; }
      case 'report-copy': window.agent.copy(reportBody(S.report, true)); toast('Report copied'); return;
      case 'report-open': {
        const r = S.report; if (!r || !r.summary) return;
        // a link can only carry so much: past that the log travels on the clipboard instead
        let body = reportBody(r, true), full = true;
        if (encodeURIComponent(body).length > 6000) { body = reportBody(r, false); full = false; window.agent.copy('```\n' + r.log + '\n```'); }
        window.agent.openExternal(`${ISSUE_URL}?title=${encodeURIComponent(r.title)}&body=${encodeURIComponent(body)}`);
        S.dlg = null; toast(full ? 'Issue opened in your browser' : 'Issue opened; the log is on the clipboard to paste', false); render(); return;
      }
      case 'export-diag': { const diag = { status: S.status, devices: S.devices, config: await call('export_config'), logs: S.logs, ui: S.ui, when: new Date().toISOString() }; const p = await window.agent.saveJson('logimx-diagnostics.json', diag); if (p) toast('Saved ' + p); return; }
      case 'copy-diag': window.agent.copy(S.logs.map(l => l.t).join('\n') || JSON.stringify(S.status)); toast('Copied'); return;
      case 'refresh-logs': await loadLogs(); render(); return;
      case 'ax-open': window.agent.accessibility(true); window.agent.openAccessibility(); setTimeout(async () => { S.ax = await window.agent.accessibility(false); render(); }, 4000); return;
      case 'install-udev': { const r = await window.agent.installUdev(); toast(r && r.ok ? 'Rule installed, re-plug the receiver' : (r && r.error) || 'Failed', !(r && r.ok)); setTimeout(refresh, 2000); return; }
      case 'onboard': S.mode = 'onboard'; S.ob = { step: 1, preset: IS_WIN() ? 'win' : IS_MAC() ? 'mac' : 'gnome' }; render(); return;
      case 'ob-close': S.mode = 'app'; try { localStorage.setItem('onboarded', '1'); } catch (x) {} render(); return;
      case 'ob-step': S.ob.step = Number(key); render(); return;
      case 'ob-prev': S.ob.step = Math.max(1, S.ob.step - 1); render(); return;
      case 'ob-next': if (S.ob.step < 3) { S.ob.step++; render(); } else { await applyPreset(S.ob.preset); S.mode = 'app'; try { localStorage.setItem('onboarded', '1'); } catch (x) {} render(); } return;
      case 'ob-preset': S.ob.preset = key; render(); return;
    }
  }
  async function addProfile(name, cls) {
    name = (name || '').trim(); cls = (cls || '').trim();
    if (!name || !cls) return toast('Name and window class are required', true);
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    for (const dd of S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (!profs[key]) { profs[key] = { name, match: [cls] }; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } }
    S.appDetail = { key, name, match: [cls] }; render();
  }
  async function applyPreset(k) {
    const P = { gnome: { tap: 'overview', up: 'workspace_prev', down: 'workspace_next', left: 'tab_prev', right: 'tab_next' },
      mac: { tap: 'overview', up: 'maximize', down: 'show_desktop', left: 'workspace_prev', right: 'workspace_next' },
      win: { tap: 'overview', up: 'maximize', down: 'minimize', left: 'app_switcher', right: 'app_switcher' } }[k];
    for (const d of S.devices.filter(isMouse)) {
      const g = { type: 'gesture', label: `${k === 'gnome' ? 'GNOME' : k === 'mac' ? 'macOS-like' : 'Windows-like'} preset`, threshold: 60 };
      for (const [slot, preset] of Object.entries(P)) { g[slot === 'tap' ? 'click' : slot] = Object.assign({}, S.presets.all[preset], { preset }); }
      await setAssign(d, 'buttons', gestureControl(d), g);
      if (k !== 'gnome') await setAssign(d, 'thumbwheel', '', k === 'mac' ? 'workspaces_wheel' : 'hscroll');
    }
    toast('Preset applied');
  }

  // --------------------------------------------------------- lifecycle
  async function loadLogs() { try { S.logs = (await window.agent.call('logs')).map(t => ({ t, c: /WARN/.test(t) ? 'warn' : /ERR|fatal/.test(t) ? 'err' : 'dim' })); } catch (e) { S.logs = []; } }
  async function refresh() {
    try {
      // everything the first paint needs, in one round trip
      const [devices, status, presets] = await Promise.all([
        window.agent.call('devices'),
        window.agent.call('status'),
        S.presets ? Promise.resolve(S.presets) : window.agent.call('presets'),
      ]);
      S.devices = devices; S.status = status; S.presets = presets;
      S.general = status.general || {}; S.conflicts = status.conflicts || [];
      if (!S.dev || !S.devices.some(d => d.id === S.dev)) { S.dev = S.devices.length ? S.devices[0].id : null; if (S.dev && !generalPagesAll.includes(S.page) && S.page !== 'home') S.page = devicePages(S.devices[0])[0]; }
      S.connected = true; S.loaded = true;
      render();
      // the rest is not needed to show the device, so let it arrive afterwards
      if (!S.apps) window.agent.call('applications').then(a => { S.apps = a; }).catch(() => { S.apps = []; });
      try { S.backups = await window.agent.call('list_backups'); } catch (e) { S.backups = []; }
      for (const d of S.devices) { try { S.history[d.id] = await window.agent.call('battery_history', { id: d.id }); } catch (e) {} }
      if (S.page === 'about') await loadLogs();
    } catch (e) { S.connected = false; }
    render();
  }
  document.addEventListener('click', () => { if (S.menu) { S.menu = null; render(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.dlg && !recorder) { S.dlg = S.dlg === 'prompt' && S.prompt && S.prompt.back ? S.prompt.back : null; render(); } });
  // on Home the arrow keys page through the devices when there are more than fit
  document.addEventListener('keydown', e => {
    if (S.page !== 'home' || S.dlg || recorder || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || /input|textarea|select/i.test((e.target || {}).tagName || '')) return;
    const b = root.querySelector(`.home-arrow[data-key="${e.key === 'ArrowLeft' ? -1 : 1}"]:not([disabled])`);
    if (b) { e.preventDefault(); onAction('home-step', b); }
  });
  window.agent.onStatus(st => {
    S.connected = !!st.connected;
    if (st.connected) { S.agentBusy = false; S.agentErr = null; refresh(); }
    else { S.devices = []; S.loaded = false; if (st.starting) S.agentBusy = true; render(); }
  });
  window.agent.onBuild(m => { if (m && m.step) { S.buildStep = m.step; S.agentBusy = true; render(); } });
  window.agent.onFlowEvent(m => { if (!m) return; S.flowStatus = m.status; S.flowDetail = m.detail || ''; if (S.flow) { S.flow.status = m.status; S.flow.peer = !!m.peer; S.flow.running = !(m.status === 'stopped' || m.status === 'error' || m.status === 'installing'); if (m.status === 'stopped' && m.detail && /installed/i.test(m.detail)) S.flow.installed = true; } if (S.page === 'flow') { flowRefresh(); } });
  window.agent.onEvent(msg => {
    const { event, data } = msg;
    if (event === 'device' || event === 'device_added') { merge(data); if (!S.dev) S.dev = data.id; render(); }
    else if (event === 'device_removed') {
      // keep the card, greyed out, so a device that dropped off (asleep, out of range) stays in view
      const gone = S.devices.find(d => d.id === data.id); if (gone) gone.offline = true;
      if (S.dev === data.id && S.page !== 'home') go('home');
      render();
    }
    else if (event === 'battery') { const d = S.devices.find(x => x.id === data.id); if (d) { d.battery = data.battery; render(); } }
    else if (event === 'app') { S.status.app = data.app || ''; }
    else if (event === 'profile') { const d = S.devices.find(x => x.id === data.id); if (d) d.profile = data.profile; }
    else if (event === 'backlight') { const d = S.devices.find(x => x.id === data.id); if (d && d.state && d.state.backlight) { d.state.backlight.current_level = data.level; if (S.page === 'backlight') render(); } }
    else if (event === 'record') {
      if (!agentGrab || !S.picker) return;
      if (data.done && data.timeout) { recordDone = recordPartial = null; agentGrab = false; S.picker.chord = data.keys || []; S.picker.recording = false; render(); }
      else if (data.done) { const f = recordDone; recordDone = recordPartial = null; agentGrab = false; if (f) f(data.keys || []); }
      else if (recordPartial) recordPartial(data.keys || []);
    }
    else if (event === 'pair') { if (S.dlg === 'pair') { if (data.status === 'discovering' || data.status === 'found') S.pair.passkey = null; if (data.found) S.pair.found = data.found; if (data.error) S.pair.error = data.error; if (data.passkey) S.pair.passkey = data.passkey; if (data.done) { S.pair.step = 3; S.pair.done = data.done; } if (data.timeout !== undefined) S.pair.timeout = data.timeout; if (data.status === 'cancelled') S.pair.error = S.pair.error || 'Cancelled'; render(); } }
  });
  render();
  (async () => {
    S.ui = (await window.agent.uiSettings()) || {};
    // the theme also lives in the agent-side settings, which survive a rename of the app
    let storedTheme = null; try { storedTheme = localStorage.getItem('theme'); } catch (e) {}
    if (!storedTheme && S.ui.theme) { S.theme = S.ui.theme; try { localStorage.setItem('theme', S.ui.theme); } catch (e) {} }
    S.appInfo = (await window.agent.appInfo()) || {};
    if (IS_MAC()) S.ax = await window.agent.accessibility(false);
    if (!IS_LINUX() && S.ob.preset === 'gnome') S.ob.preset = IS_WIN() ? 'win' : 'mac';   // the first-run guide starts on this OS's own preset
    try { S.agentInfo = await window.agent.agentInfo(); } catch (e) {}
    let onboarded = false; try { onboarded = localStorage.getItem('onboarded') === '1'; } catch (e) {}
    if (!onboarded) S.mode = 'onboard';
    const c = await window.agent.connected();
    if (c) { S.connected = true; await refresh(); S.ready = true; render(); return; }
    // the main process starts the agent on launch; show that rather than a bare "not running"
    S.ready = true; S.agentBusy = true; render();
    setTimeout(() => { if (!S.connected) { S.agentBusy = false; render(); } }, 9000);
  })();
})();
