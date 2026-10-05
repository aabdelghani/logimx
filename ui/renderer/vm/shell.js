// View model of the window itself: which page and device are on screen, menus, theme, the
// agent's state, first run.

// from the rest of the window, filled in by link()
let IS_MAC, IS_WIN, S, SLOTS, agentNeedsBuild, api, applyPreset, call, changed, dev, devicePages, drawerUp, fx, gestureControl, go, openPicker, refresh, ringSelect, toast;
export function link(ctx) { ({ IS_MAC, IS_WIN, S, SLOTS, agentNeedsBuild, api, applyPreset, call, changed, dev, devicePages, drawerUp, fx, gestureControl, go, openPicker, refresh, ringSelect, toast } = ctx); }

const HOME_PER_VIEW = 2;   // two cards side by side at the window's size; more page with the arrows
// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'page': async (it, e, d, key) => { go(it.data.page); return; },
  'go-home': async (it, e, d, key) => {
    if (S.page === 'gestures' && S.cfgKind === 'ring' && (S.ringPath || []).length) { const i = S.ringPath[0]; S.ringPath = []; S.menu = null; ringSelect(i); changed(); return; }
    // opened from a button's Configure: back to the mouse's Buttons, panel and all
    // with that button's actions open again on the right (the panel changes in place)
    if (S.cfgFrom && S.page === 'gestures') {
      const back = S.cfgBack, dd = dev();
      S.page = S.cfgFrom; S.cfgFrom = null; S.cfgBack = null;
      if (back && dd) openPicker({ drawer: true, dev: dd, section: 'buttons', cid: back.cid, label: back.label, profile: back.profile });
      else { S.dlg = null; S.picker = null; changed(); }
      return;
    }
    // with a panel open on the right, the back arrow folds the panel away first
    if (drawerUp()) { fx.closeDrawer(); return; }
    if (fx.panelOpen()) { fx.closeDrawer(() => { if (S.addPanel) { S.addPanel = false; S.addSel = []; } else S.blClosed = true; }); return; }
    if (S.picker && S.picker.recording) { fx.stopRecorder(); S.picker.recording = false; } go('home'); return;
  },
  'home-step': async (it, e, d, key) => { const n = Math.ceil(S.devices.length / HOME_PER_VIEW); S.homeAt = Math.max(0, Math.min(n - 1, (S.homeAt || 0) + Number(key))); S.homeSlide = Number(key); changed(); return; },
  'home-open': async (it, e, d, key) => { go(devicePages(S.devices.find(x => x.id === key) || {})[0], key); return; },
  'bl-open': async (it, e, d, key) => { if (S.blClosed) { S.blClosed = false; changed(); } return; },
  // Point & scroll opens on the mouse alone, like Buttons; its tag or the mouse opens the panel
  'home-page': async (it, e, d, key) => { S.blClosed = it.data.page === 'pointer' || it.data.page === 'easy'; S.ptSel = null; S.esSel = null; go(it.data.page, key); return; },
  'es-pick': async (it, e, d, key) => { const i = Number(it.data.cid); if (!S.blClosed && S.esSel === i) { fx.closeDrawer(() => { S.blClosed = true; }); return; } S.esSel = i; S.blClosed = false; changed(); return; },
  'pt-pick': async (it, e, d, key) => { const k = it.data.cid; if (!S.blClosed && S.ptSel === k) { fx.closeDrawer(() => { S.blClosed = true; }); return; } S.ptSel = k; S.blClosed = false; changed(); return; },
  'dir-pick': async (it, e, d, key) => { S.dir = key; const cid = gestureControl(d); openPicker({ drawer: S.page === 'gestures', dev: d, section: 'gesture', cid, label: SLOTS[key][0], slot: SLOTS[key][1] }); return; },
  'goinfo': async (it, e, d, key) => { go('info', S.dev); return; },
  'back-apps': async (it, e, d, key) => { S.appDetail = null; changed(); return; },
  'win-close': async (it, e, d, key) => { api.host.windowAction('close'); return; },
  'quit': async (it, e, d, key) => { api.host.windowAction('quit'); return; },
  'menu-theme': async (it, e, d, key) => { S.menu = S.menu === 'theme' ? null : 'theme'; changed(); return; },
  'menu-main': async (it, e, d, key) => { S.menu = S.menu === 'main' ? null : 'main'; changed(); return; },
  'menu-ringprof': async (it, e, d, key) => { S.menu = S.menu === 'ringprof' ? null : 'ringprof'; changed(); return; },
  'theme': async (it, e, d, key) => { S.theme = key; try { localStorage.setItem('theme', key); } catch (x) {} api.host.setTheme(key); S.menu = null; changed(); return; },
  'theme-select': async (it, e, d, key) => { S.theme = it.value; try { localStorage.setItem('theme', it.value); } catch (x) {} api.host.setTheme(it.value); changed(); return; },
  'start-agent': async (it, e, d, key) => {
    const build = agentNeedsBuild();
    S.agentBusy = true; S.agentErr = null; S.buildStep = build ? 'Preparing the build…' : null; changed();
    let r;
    try { r = build ? await api.host.buildAgent() : await api.host.startAgent(); }
    catch (x) { r = { ok: false, error: x.message }; }
    S.agentBusy = false; S.buildStep = null;
    try { S.agentInfo = await api.host.agentInfo(); } catch (x) {}
    if (r && r.ok) { toast('Agent started'); try { await refresh(); } catch (x) {} }
    else { S.agentErr = (r && r.error) || 'could not start'; toast('Could not start the agent: ' + S.agentErr, true); }
    changed(); return;
  },
  'osd-test': async (it, e, d, key) => { api.host.osdTest(key); return; },
  'pause': async (it, e, d, key) => { await call(S.status.paused ? 'resume_diversion' : 'pause_diversion'); S.status = await call('status'); changed(); return; },
  'dismiss-conflict': async (it, e, d, key) => { S.conflictDismissed = true; changed(); return; },
  'stop-tool': async (it, e, d, key) => { const r = await api.host.stopTool(it.data.tool); toast(r && r.ok ? `${it.data.tool} stopped` : (r && r.error) || 'Could not stop', !(r && r.ok)); setTimeout(refresh, 1500); return; },
  'open': async (it, e, d, key) => { api.host.openExternal(it.data.url); return; },
  'close-dlg': async (it, e, d, key) => { if (S.dlg === 'prompt' && S.prompt && S.prompt.back) { S.dlg = S.prompt.back; changed(); return; } if (drawerUp()) { fx.closeDrawer(); return; } fx.stopRecorder(); if (S.dlg === 'pair') { call('pair_cancel').catch(() => {}); if (S.pair && S.pair.bt) api.host.btClose(); } S.dlg = null; changed(); return; },
  'dir': async (it, e, d, key) => { S.dir = key; changed(); return; },
  'ax-open': async (it, e, d, key) => { api.host.accessibility(true); api.host.openAccessibility(); setTimeout(async () => { S.ax = await api.host.accessibility(false); changed(); }, 4000); return; },
  'install-udev': async (it, e, d, key) => { const r = await api.host.installUdev(); toast(r && r.ok ? 'Rule installed, re-plug the receiver' : (r && r.error) || 'Failed', !(r && r.ok)); setTimeout(refresh, 2000); return; },
  'onboard': async (it, e, d, key) => { S.mode = 'onboard'; S.ob = { step: 1, preset: IS_WIN() ? 'win' : IS_MAC() ? 'mac' : 'gnome' }; changed(); return; },
  'ob-close': async (it, e, d, key) => { S.mode = 'app'; try { localStorage.setItem('onboarded', '1'); } catch (x) {} changed(); return; },
  'ob-step': async (it, e, d, key) => { S.ob.step = Number(key); changed(); return; },
  'ob-prev': async (it, e, d, key) => { S.ob.step = Math.max(1, S.ob.step - 1); changed(); return; },
  'ob-next': async (it, e, d, key) => { if (S.ob.step < 3) { S.ob.step++; changed(); } else { await applyPreset(S.ob.preset); S.mode = 'app'; try { localStorage.setItem('onboarded', '1'); } catch (x) {} changed(); } return; },
  'ob-preset': async (it, e, d, key) => { S.ob.preset = key; changed(); return; },
};

export const provide = { HOME_PER_VIEW };
