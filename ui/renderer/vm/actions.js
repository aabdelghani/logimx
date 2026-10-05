// View model: what each button in the window does (its data-act), in one place.
import { isFolderSlot, RING_DIRS, RING_NEXT_PROFILE, RING_BRIGHTNESS, newRingId } from '../../shared/ring.mjs';
import * as Act from '../../shared/actions.mjs';

// from the rest of the window, filled in by link()
let APP_ACTIONS, HOME_PER_VIEW, ISSUE_URL, IS_MAC, IS_WIN, S, SLOTS, VERSION, addLabel, addProfile, agentNeedsBuild, allProfiles, api, appClass, applyPreset, assignPicked, assignment, call, closeDrawer, dev, devicePages, deviceProfiles, drawerUp, flowRefresh, gestureCapable, gestureControl, gestureObject, go, keyLayout, keyName, loadLogs, merge, openPicker, prompt, refresh, refreshBar, render, renderAppList, reportBody, ringApp, ringAppMatch, ringAppName, ringSelect, ringSelectAdd, ringSlots, ringState, ringTidyFolders, ringUseName, root, saveRing, saveRingSlots, setAssign, setGeneral, setSetting, stopRecorder, toast, wishBody;
export function link(ctx) { ({ APP_ACTIONS, HOME_PER_VIEW, ISSUE_URL, IS_MAC, IS_WIN, S, SLOTS, VERSION, addLabel, addProfile, agentNeedsBuild, allProfiles, api, appClass, applyPreset, assignPicked, assignment, call, closeDrawer, dev, devicePages, deviceProfiles, drawerUp, flowRefresh, gestureCapable, gestureControl, gestureObject, go, keyLayout, keyName, loadLogs, merge, openPicker, prompt, refresh, refreshBar, render, renderAppList, reportBody, ringApp, ringAppMatch, ringAppName, ringSelect, ringSelectAdd, ringSlots, ringState, ringTidyFolders, ringUseName, root, saveRing, saveRingSlots, setAssign, setGeneral, setSetting, stopRecorder, toast, wishBody } = ctx); }

async function onAction(act, b, e) {
  const d = dev(); const key = b && b.dataset.key;
  switch (act) {
    case 'page': go(b.dataset.page); return;
    case 'go-home':
      if (S.page === 'gestures' && S.cfgKind === 'ring' && (S.ringPath || []).length) { const i = S.ringPath[0]; S.ringPath = []; S.menu = null; ringSelect(i); render(); return; }
      // opened from a button's Configure: back to the mouse's Buttons, panel and all
      // with that button's actions open again on the right (the panel changes in place)
      if (S.cfgFrom && S.page === 'gestures') {
        const back = S.cfgBack, dd = dev();
        S.page = S.cfgFrom; S.cfgFrom = null; S.cfgBack = null;
        if (back && dd) openPicker({ drawer: true, dev: dd, section: 'buttons', cid: back.cid, label: back.label, profile: back.profile });
        else { S.dlg = null; S.picker = null; render(); }
        return;
      }
      // with a panel open on the right, the back arrow folds the panel away first
      if (drawerUp()) { closeDrawer(); return; }
      if (root.querySelector('.devview2.panel-open')) { closeDrawer(() => { if (S.addPanel) { S.addPanel = false; S.addSel = []; } else S.blClosed = true; }); return; }
      if (S.picker && S.picker.recording) { stopRecorder(); S.picker.recording = false; } go('home'); return;
    case 'home-step': { const n = Math.ceil(S.devices.length / HOME_PER_VIEW); S.homeAt = Math.max(0, Math.min(n - 1, (S.homeAt || 0) + Number(key))); S.homeSlide = Number(key); render(); return; }
    case 'home-open': go(devicePages(S.devices.find(x => x.id === key) || {})[0], key); return;
    case 'bl-open': if (S.blClosed) { S.blClosed = false; render(); } return;
    // Point & scroll opens on the mouse alone, like Buttons; its tag or the mouse opens the panel
    case 'home-page': S.blClosed = b.dataset.page === 'pointer' || b.dataset.page === 'easy'; S.ptSel = null; S.esSel = null; go(b.dataset.page, key); return;
    case 'es-pick': { const i = Number(b.dataset.cid); if (!S.blClosed && S.esSel === i) { closeDrawer(() => { S.blClosed = true; }); return; } S.esSel = i; S.blClosed = false; render(); return; }
    case 'pt-pick': { const k = b.dataset.cid; if (!S.blClosed && S.ptSel === k) { closeDrawer(() => { S.blClosed = true; }); return; } S.ptSel = k; S.blClosed = false; render(); return; }
    case 'dir-pick': { S.dir = key; const cid = gestureControl(d); openPicker({ drawer: S.page === 'gestures', dev: d, section: 'gesture', cid, label: SLOTS[key][0], slot: SLOTS[key][1] }); return; }
    case 'goinfo': go('info', S.dev); return;
    case 'back-apps': S.appDetail = null; render(); return;
    case 'win-close': api.host.windowAction('close'); return;
    case 'quit': api.host.windowAction('quit'); return;
    case 'menu-theme': S.menu = S.menu === 'theme' ? null : 'theme'; render(); return;
    case 'menu-main': S.menu = S.menu === 'main' ? null : 'main'; render(); return;
    case 'menu-ringprof': S.menu = S.menu === 'ringprof' ? null : 'ringprof'; render(); return;
    case 'theme': S.theme = key; try { localStorage.setItem('theme', key); } catch (x) {} api.host.setTheme(key); S.menu = null; render(); return;
    case 'theme-select': S.theme = b.value; try { localStorage.setItem('theme', b.value); } catch (x) {} api.host.setTheme(b.value); render(); return;
    case 'start-agent': {
      const build = agentNeedsBuild();
      S.agentBusy = true; S.agentErr = null; S.buildStep = build ? 'Preparing the build…' : null; render();
      let r;
      try { r = build ? await api.host.buildAgent() : await api.host.startAgent(); }
      catch (x) { r = { ok: false, error: x.message }; }
      S.agentBusy = false; S.buildStep = null;
      try { S.agentInfo = await api.host.agentInfo(); } catch (x) {}
      if (r && r.ok) { toast('Agent started'); try { await refresh(); } catch (x) {} }
      else { S.agentErr = (r && r.error) || 'could not start'; toast('Could not start the agent: ' + S.agentErr, true); }
      render(); return;
    }
    case 'osd-test': api.host.osdTest(key); return;
    case 'pause': await call(S.status.paused ? 'resume_diversion' : 'pause_diversion'); S.status = await call('status'); render(); return;
    case 'dismiss-conflict': S.conflictDismissed = true; render(); return;
    case 'stop-tool': { const r = await api.host.stopTool(b.dataset.tool); toast(r && r.ok ? `${b.dataset.tool} stopped` : (r && r.error) || 'Could not stop', !(r && r.ok)); setTimeout(refresh, 1500); return; }
    case 'open': api.host.openExternal(b.dataset.url); return;
    case 'flow-install': api.host.flowInstall(); S.flowStatus = 'installing'; render(); return;
    case 'flow-begin': S.flowSetup = true; if (S.flow && !S.flow.installed) { api.host.flowInstall(); S.flowStatus = 'installing'; } render(); return;
    case 'flow-start': { const r = await api.host.flowStart(); if (r && !r.ok) toast(r.error || 'Could not start Flow', true); flowRefresh(); return; }
    case 'flow-stop': await api.host.flowStop(); flowRefresh(); return;
    case 'flow-name': { const v = (b.value || '').trim(); if (v) await api.host.flowConfig({ name: v }); flowRefresh(); return; }
    case 'flow-clip': { const cur = (S.flow || {}).clipboard !== false; await api.host.flowConfig({ clipboard: !cur }); flowRefresh(); return; }
    case 'flow-peer-add': prompt('Add computer', [{ key: 'name', label: 'Name', placeholder: 'macbook, work-pc…' }], async v => { const name = (v.name || '').trim(); if (!name) return; const peers = ((S.flow || {}).peers || []).slice(); if (peers.some(p => p.name === name)) return toast('That name is already added', true); peers.push({ name: name.replace(/[^A-Za-z0-9_-]/g, '-'), pos: 'right' }); await api.host.flowConfig({ peers }); flowRefresh(); }, 'Add'); return;
    case 'flow-peer-del': { const peers = ((S.flow || {}).peers || []).slice(); peers.splice(Number(b.dataset.i), 1); await api.host.flowConfig({ peers }); flowRefresh(); return; }
    case 'flow-peer-pos': { const peers = ((S.flow || {}).peers || []).slice(); const i = Number(b.dataset.i); if (peers[i]) peers[i] = Object.assign({}, peers[i], { pos: b.value }); await api.host.flowConfig({ peers }); flowRefresh(); return; }
    case 'open-bt': api.host.openBluetooth(); toast('Opening Bluetooth settings'); return;
    case 'pf-edit': { const k = key === 'default' ? null : key; if ((S.editProfile || null) === k) return; S.editProfile = k; S.ringPath = []; S.previewProfile = null; S.dlg = null; S.picker = null; render(); return; }
    case 'pf-add': { if (S.addPanel) return; S.addPanel = true; S.addSel = []; S.dlg = null; S.picker = null; S.previewProfile = null; if (!S.apps) { try { S.apps = await api.quiet('applications'); } catch (e) { S.apps = []; } } render(); return; }
    case 'add-pick': {
      // tick or untick; the bar shows the ticked ones at once, faded until Add
      const sel = S.addSel || (S.addSel = []), i = sel.indexOf(key);
      if (i >= 0) sel.splice(i, 1); else sel.push(key);
      b.classList.toggle('on', i < 0);
      const ok = root.querySelector('[data-act=add-confirm]');
      if (ok) { ok.disabled = !sel.length; ok.innerHTML = `<i class="fa-solid fa-plus"></i>${addLabel()}`; }
      refreshBar();
      return;
    }
    case 'add-confirm': {
      const picked = (S.addSel || []).map(id => (S.apps || []).find(x => x.id === id)).filter(Boolean);
      if (!picked.length) return;
      S.addSel = [];
      closeDrawer(() => { S.addPanel = false; });
      for (const a of picked) await addProfile(a.name, a.wm_class || a.id || appClass(a.name), 'quiet');
      toast(picked.length > 1 ? `${picked.length} applications added. Click one to set it up.` : `${picked[0].name} added. Click it to set it up.`);
      render(); return;
    }
    case 'pf-add-old': prompt('Add application', [{ key: 'name', label: 'Application', placeholder: 'Firefox', list: (S.apps || []).map(a => ({ value: a.name })) }], v => addProfile(v.name, appClass(v.name), true), 'Add'); return;
    case 'pf-remove': {
      const dd = dev(), p = deviceProfiles(dd).find(x => x.key === key); if (!p) return;
      S.previewProfile = null;
      S.confirm = { title: `Remove ${p.name} settings?`, text: `This permanently removes the custom settings for ${p.name} on your ${dd.name}. In ${p.name}, it goes back to the global settings.`, ok: 'Remove', onOk: async () => {
        const profs = JSON.parse(JSON.stringify(dd.config.profiles)); delete profs[key]; merge(await call('set_profiles', { id: dd.id, profiles: profs }));
        if (S.editProfile === key) S.editProfile = null;
        toast(`${p.name} settings removed`);
      } };
      S.dlg = 'confirm'; render(); return;
    }
    case 'confirm-ok': { const p = S.confirm; S.dlg = null; S.confirm = null; render(); if (p && p.onOk) { await p.onOk(); render(); } return; }
    case 'close-dlg': if (S.dlg === 'prompt' && S.prompt && S.prompt.back) { S.dlg = S.prompt.back; render(); return; } if (drawerUp()) { closeDrawer(); return; } stopRecorder(); if (S.dlg === 'pair') { call('pair_cancel').catch(() => {}); if (S.pair && S.pair.bt) api.host.btClose(); } S.dlg = null; render(); return;
    case 'dir': S.dir = key; render(); return;
    case 'pick': {
      // a folder on the ring opens straight away (its ⋯ menu removes it)
      if (b.dataset.ins && S.picker && S.picker.section === 'ring') { ringSelectAdd(b.dataset.ins); render(); return; }
      const fc = Number(b.dataset.cid);
      if (b.dataset.section === 'ring' && S.page === 'gestures' && S.cfgKind === 'ring' && !(S.ringPath || []).length && isFolderSlot(ringSlots()[fc])) {
        S.menu = null; S.ringPath = [fc]; S.ringAnim = { kind: 'in', from: fc }; ringSelectAdd(); render(); return;
      }
    }
      openPicker({ drawer: S.page === 'gestures' && (b.dataset.section === 'ring' || b.dataset.section === 'gesture'), dev: b.dataset.dev ? S.devices.find(x => x.id === b.dataset.dev) : d, section: b.dataset.section, cid: b.dataset.cid === 'thumb' ? 'thumb' : Number(b.dataset.cid), label: b.dataset.label, cat: b.dataset.cat, profile: b.dataset.profile }); return;
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
      // like the action ring: the panel stays and turns into the Tap gesture's actions, the
      // directions in the middle pick which one it shows; back returns to the mouse's Buttons
      S.holdCid = Object.assign({}, S.holdCid, { [dd.id]: p.cid });
      S.page = 'gestures'; S.dev = dd.id; S.menu = null; S.appDetail = null;
      S.cfgFrom = 'buttons'; S.cfgKind = 'gestures'; S.cfgBack = { cid: p.cid, label: p.label, profile: p.profile };
      S.dir = 'tap';
      openPicker({ drawer: true, dev: dd, section: 'gesture', cid: p.cid, label: SLOTS.tap[0], slot: SLOTS.tap[1] });
      return;
    }
    case 'ring-config': {
      ringTidyFolders();
      // to the ring's settings: on this mouse's Gestures & action ring page when the button can carry
      // it there, otherwise the Action ring page
      const p = S.picker, dd = S.devices.find(x => x.id === p.dev) || d, cap = dd && gestureCapable(dd).some(c => c.cid === p.cid);
      stopRecorder();
      if (!cap) { go('ring'); return; }
      // the ring in the middle with its actions open on the right (the left bar folds away, as
      // with any panel); the back arrow returns to the mouse's Buttons
      // the panel stays where it is and changes to the ring's: no closing and reopening on the way
      S.holdCid = Object.assign({}, S.holdCid, { [dd.id]: p.cid });
      S.page = 'gestures'; S.dev = dd.id; S.menu = null; S.appDetail = null;
      S.cfgFrom = 'buttons'; S.cfgKind = 'ring'; S.cfgBack = { cid: p.cid, label: p.label, profile: p.profile };
      const slots = ringSlots(), first = Math.max(0, slots.findIndex(s => !s));
      openPicker({ drawer: true, dev: dd, section: 'ring', cid: first, label: RING_DIRS[first] });
      return;
    }
    case 'acc-toggle': { const p = S.picker; p.fold = Object.assign({}, p.fold, { [key]: !(p.fold || {})[key] }); p.unfolded = p.fold[key] ? key : null; render(); return; }
    case 'rec-open': { const p = S.picker; p.q = ''; p.fold = Object.assign({}, p.fold, { rec: true }); p.sel = null; p.selKey = null; if (p.cat === 'key') { stopRecorder(); p.recording = false; p.cat = 'all'; } else { p.cat = 'key'; p.recording = true; } render(); return; }
    case 'pick-key': { const p = S.picker; if (p.drawer) return assignPicked({ type: 'keystroke', keys: [key] }); p.cat = 'all'; p.sel = { type: 'keystroke', keys: [key] }; p.selKey = 'key:' + key; root.querySelectorAll('.drawer .act').forEach(x => x.classList.toggle('on', x.dataset.act === 'pick-key' && x.dataset.key === key)); root.querySelectorAll('.drawer .kc').forEach(x => x.classList.toggle('on', x.dataset.key === key)); return; }
    case 'pick-cat': S.picker.cat = key; S.picker.recording = key === 'key'; render(); return;
    case 'pick-item':
      if (key.startsWith('app:')) return assignPicked(JSON.parse(JSON.stringify(APP_ACTIONS[key.slice(4)])));
      if (key === 'wheel:keys') {
        const typedKeys = Act.typedKeys;
        prompt('Two keystrokes', [{ key: 'up', label: 'Turning one way', placeholder: 'ctrl+tab' }, { key: 'down', label: 'Turning the other way', placeholder: 'ctrl+shift+tab' }], async v => {
          const plus = typedKeys(v.up || ''), minus = typedKeys(v.down || '');
          if (!plus || !minus) { toast('Type a keystroke for each way', true); return render(); }
          await assignPicked({ type: 'adapter', step: 120, label: `${plus.map(keyName).join(' + ')} / ${minus.map(keyName).join(' + ')}`, plus: { type: 'keystroke', keys: plus }, minus: { type: 'keystroke', keys: minus } });
        }, 'Assign');
        return;
      }
      if (key === 'ring:profile') return assignPicked(RING_NEXT_PROFILE);
      if (key === 'ring:brightness') return assignPicked(RING_BRIGHTNESS);
      if (key === 'ring:folder') {
        if (isFolderSlot({ action: S.picker.current })) return;
        prompt('New folder', [{ key: 'name', label: 'Name', placeholder: 'Media, Windows, Apps…' }], async v => {
          const name = (v.name || '').trim() || 'Folder';
          await assignPicked({ type: 'folder', label: name, slots: [] });
          const slots = ringSlots(); slots[S.picker.cid].label = name; slots[S.picker.cid].icon = 'fa-folder'; await saveRingSlots(slots); render();
        }, 'Create');
        return;
      }
      if (S.picker.drawer) return assignPicked(key); S.picker.sel = key; root.querySelectorAll(S.picker.drawer ? '.drawer .act, .drawer .kc' : '.act').forEach(x => x.classList.toggle('on', x.dataset.act === 'pick-item' && x.dataset.key === key)); return;
    case 'rec-start': if (S.picker.drawer) S.picker.cat = 'key'; if (S.picker.recording) return; S.picker.recording = true; render(); return;
    case 'pick-launch': { if (S.picker.drawer) { S.picker.cat = 'app'; S.picker.launch = key; S.picker.cmd = S.picker.text = S.picker.open = ''; return onAction('pick-assign'); } S.picker.launch = key; S.picker.cmd = ''; S.picker.text = ''; S.picker.open = ''; if (S.picker.cat === 'app') renderAppList(); else render(); return; }
    case 'pick-disable': await assignPicked('nothing'); return;
    case 'ring-test': api.host.ringShow(); return;
    case 'ring-size': await saveRing({ size: key }); render(); return;
    case 'folder-rename': { const n = root.querySelector('.folder-name'); if (n) { n.focus(); n.select(); } return; }
    case 'rs-parent': {
      const i = Number(key), open = (S.ringPath || [])[0];
      S.ringPath = []; S.menu = null;
      if (i !== open && isFolderSlot(ringSlots()[i])) { S.ringPath = [i]; S.ringAnim = { kind: 'in', from: i }; ringSelectAdd(); }
      else ringSelect(i);
      render(); return;
    }
    case 'rs-menu': S.menu = S.menu === 'rs:' + key ? null : 'rs:' + key; render(); return;
    case 'rs-folder': {
      const i = Number(key); S.menu = null;
      const slots = ringSlots(), had = slots[i];
      // the slot becomes a folder; an action already there moves inside as its first one
      slots[i] = { action: { type: 'folder', label: 'New folder', slots: had && !isFolderSlot(had) ? [had] : [] }, label: 'New folder', icon: 'fa-folder' };
      await saveRingSlots(slots);
      S.ringPath = [i]; S.ringAnim = { kind: 'in', from: i }; ringSelectAdd(); render();
      setTimeout(() => { const n = root.querySelector('.folder-name'); if (n) { n.focus(); n.select(); } }, 180);
      return;
    }
    case 'rs-open': S.menu = null; S.ringPath = [Number(key)]; S.ringAnim = { kind: 'in', from: Number(key) }; ringSelectAdd(); render(); return;
    case 'rs-clear': { S.menu = null; const slots = ringSlots(); slots[Number(key)] = null; await saveRingSlots(slots); ringSelect(Number(key)); render(); return; }
    case 'rp-use': {
      const r = ringState(), k = ringApp(); S.ringPath = [];
      if (key === '#own') return;
      if (k) { if (!key) delete r.apps[k]; else r.apps[k] = { profile: key, match: ringAppMatch(k) }; await saveRing({ apps: r.apps }); }
      else { const i = r.profiles.findIndex(p => p.id === key); if (i < 0) return; await saveRing({ active: i }); }
      if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null;
      render(); return;
    }
    case 'rp-new':
      prompt('New ring profile', [{ key: 'name', label: 'Name', placeholder: 'Work, Editing, Gaming…' }], async v => {
        const r = ringState(), k = ringApp(), id = newRingId(), name = (v.name || '').trim() || `Profile ${r.profiles.length + 1}`;
        r.profiles.push({ id, name, slots: [] });
        if (k) { r.apps[k] = { profile: id, match: ringAppMatch(k) }; await saveRing({ profiles: r.profiles, apps: r.apps }); }
        else await saveRing({ profiles: r.profiles, active: r.profiles.length - 1 });
        S.ringPath = [];
        // a blank ring with its first slot open: actions can be dragged onto any slot
        if (S.picker && S.picker.section === 'ring') { S.picker.cid = 0; S.picker.label = RING_DIRS[0]; S.picker.current = null; }
        toast(`"${name}" is a blank ring: drag actions onto it`); render();
      }, 'Create');
      return;
    case 'rp-rename': {
      const r0 = ringState(), pr = r0.profiles.find(p => p.id === key); if (!pr) return;
      prompt('Rename ring profile', [{ key: 'name', label: 'Name', value: pr.name }], async v => {
        const name = (v.name || '').trim(); if (!name) return render();
        const r = ringState(), t = r.profiles.find(p => p.id === key); if (t) t.name = name; await saveRing({ profiles: r.profiles }); render();
      }, 'Rename');
      return;
    }
    case 'rp-delete': {
      const r = ringState(); if (r.profiles.length < 2) return;
      const i = r.profiles.findIndex(p => p.id === key); if (i < 0) return;
      const gone = r.profiles.splice(i, 1)[0];
      for (const [ak, av] of Object.entries(r.apps)) if (av && av.profile === gone.id) delete r.apps[ak];   // its apps go back to the global ring
      await saveRing({ profiles: r.profiles, apps: r.apps, active: Math.min(r.active > i ? r.active - 1 : r.active, r.profiles.length - 1) });
      S.ringPath = []; if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null;
      toast(`Profile "${gone.name}" deleted`); render(); return;
    }
    case 'ring-app-use': {
      const r = ringState(), k = ringApp(); S.menu = null; if (!k || key === '#own') return render();
      if (!key) delete r.apps[k]; else r.apps[k] = { profile: key, match: ringAppMatch(k) };
      S.ringPath = []; await saveRing({ apps: r.apps });
      if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null;
      toast(`${ringAppName(k)} uses ${ringUseName(ringState(), k)}`); render(); return;
    }
    case 'ring-app-new': {
      const k = ringApp(); S.menu = null; if (!k) return render();
      prompt('New blank ring profile', [{ key: 'name', label: 'Name', value: ringAppName(k), placeholder: 'Work, Remote desktop…' }], async v => {
        const r = ringState(), name = (v.name || '').trim() || ringAppName(k), id = newRingId();
        r.profiles.push({ id, name, slots: [] }); r.apps[k] = { profile: id, match: ringAppMatch(k) };
        S.ringPath = []; await saveRing({ profiles: r.profiles, apps: r.apps });
        if (S.picker && S.picker.section === 'ring') S.picker.current = null;
        toast(`${ringAppName(k)} uses the new profile "${name}"`); render();
      }, 'Create');
      return;
    }
    case 'bri-setup': {
      toast('Setting up monitor brightness…');
      const r = await api.host.briSetup();
      S.briStatus = await api.host.briStatus().catch(() => null);
      toast(r && r.ok ? (S.briStatus && S.briStatus.ok ? 'Monitor brightness is ready' : 'Set up; this monitor does not answer brightness requests') : (r && r.error) || 'Failed', !(r && r.ok));
      render(); return;
    }
    case 'ring-up': { const i = (S.ringPath || [])[0]; S.ringPath = []; if (S.picker && S.picker.section === 'ring') { S.picker.cid = i; S.picker.label = RING_DIRS[i]; S.picker.current = (ringSlots()[i] || {}).action || null; } render(); return; }
    case 'ring-app-drop': { const r = ringState(); delete r.apps[ringApp()]; S.ringPath = []; await saveRing({ apps: r.apps }); if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null; toast('Uses the global ring'); render(); return; }
    case 'ring-travel': await saveRing({ travel: Number(b.value) }); return;
    case 'ring-free': await saveRing({ free_pointer: !b.classList.contains('on') }); render(); return;
    case 'ring-profile': S.ringPath = []; await saveRing({ active: Number(key) }); S.menu = null; if (S.picker && S.picker.section === 'ring') S.picker.current = (ringSlots()[S.picker.cid] || {}).action || null; render(); return;
    case 'ring-profile-add': S.menu = null; prompt('New ring profile', [{ key: 'name', label: 'Name', placeholder: 'Work, Editing, Gaming…' }], async v => { const r = ringState(); const name = (v.name || '').trim() || `Profile ${r.profiles.length + 1}`; r.profiles.push({ name, slots: [] }); await saveRing({ profiles: r.profiles, active: r.profiles.length - 1 }); toast(`Profile "${name}" added`); render(); }, 'Create'); return;
    case 'ring-profile-copy': { const r = ringState(); const src = r.profiles[r.active]; r.profiles.push({ name: src.name + ' copy', slots: JSON.parse(JSON.stringify(src.slots)) }); await saveRing({ profiles: r.profiles, active: r.profiles.length - 1 }); toast('Profile duplicated'); render(); return; }
    case 'ring-profile-rename': { const r = ringState(); prompt('Rename ring profile', [{ key: 'name', label: 'Name', value: r.profiles[r.active].name }], async v => { const name = (v.name || '').trim(); if (!name) return render(); const n = ringState(); n.profiles[n.active].name = name; await saveRing({ profiles: n.profiles }); render(); }, 'Rename'); return; }
    case 'ring-profile-delete': { S.menu = null; const r = ringState(); if (r.profiles.length < 2) return; const gone = r.profiles.splice(r.active, 1)[0];
      for (const [ak, av] of Object.entries(r.apps)) if (av && av.profile === gone.id) delete r.apps[ak];
      await saveRing({ profiles: r.profiles, apps: r.apps, active: Math.max(0, r.active - 1) }); toast(`Profile "${gone.name}" deleted`); render(); return; }
    case 'ring-clear': await saveRingSlots([]); toast('Slots cleared'); render(); return;
    case 'pick-default': {
      const p = S.picker; const dd = S.devices.find(x => x.id === p.dev) || d;
      if (p.section === 'ring') { const slots = ringSlots(); slots[p.cid] = null; await saveRingSlots(slots); S.dlg = null; toast(`Slot ${p.cid + 1} cleared`); render(); return; }
      const defs = ((await api.quiet('defaults', { id: dd.id })).profiles || {}).default || {};
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
        if (t) { stopRecorder(); return assignPicked({ type: 'keystroke', keys: Act.typedKeys(t) }); }
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
      if (curType === 'gesture') S.ui = await api.host.uiSettings({ savedGesture: Object.assign({}, (S.ui || {}).savedGesture, { [d.id + ':' + cid]: gestureObject(d, cid) }) }) || S.ui;
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
    case 'haptic-level': await setSetting(d, ['haptic', 'level'], Number(b.value)); api.quiet('haptic_play', { id: d.id, waveform: 4 }).catch(() => {}); return;
    case 'haptic-play': api.quiet('haptic_play', { id: d.id, waveform: Number(key) }).catch(e => toast(e.message, true)); return;
    case 'panel-force-reset': { const f = ((d.state || {}).force || [])[0]; if (f) { await setSetting(d, ['panel_force'], f.default); render(); } return; }
    case 'bl-reset': { const def = (((await api.quiet('defaults', { id: d.id })).settings || {}).backlight) || { enabled: true, mode: 'auto' }; for (const k of ['enabled', 'mode']) if (k in def) await setSetting(d, ['backlight', k], def[k]); await setSetting(d, ['backlight', 'battery_saving'], false); toast('Backlighting reset'); render(); return; }
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
    case 'ui': { const v = !b.classList.contains('on'); S.ui = await api.host.uiSettings({ [key]: v }) || Object.assign(S.ui, { [key]: v }); render(); return; }
    case 'fwupd': toast('Are you serious now ?'); setTimeout(() => toast('You must be a Windows user !'), 2200); return;
    case 'check-updates': { const r = await api.host.checkUpdates(); if (!r.ok) return toast('Update check failed: ' + r.error, true); const cur = S.status.version || VERSION; const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; } return false; }; const has = r.latest && newer(r.latest, cur); toast(has ? `Version ${r.latest} is available` : `You are on the latest version (${cur})`); if (has && r.url) api.host.openExternal(r.url); return; }
    case 'reset-overrides': { for (const dd of S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[key]) { const keep = { name: profs[key].name, match: profs[key].match }; profs[key] = keep; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } } toast('Overrides cleared'); render(); return; }
    case 'reset-buttons': { const defs = ((await api.quiet('defaults', { id: d.id })).profiles || {}).default || {}; const btns = defs.buttons || {}; for (const cid of Object.keys(btns)) await setAssign(d, 'buttons', cid, btns[cid]); if (defs.thumbwheel) await setAssign(d, 'thumbwheel', null, defs.thumbwheel); toast('Buttons reset to defaults'); render(); return; }
    case 'reset-keys': { const defs = ((await api.quiet('defaults', { id: d.id })).profiles || {}).default || {}; const keys = defs.keys || {}; const lay = keyLayout(d); for (const { cid } of lay.frow.concat(lay.special)) await setAssign(d, 'keys', cid, keys[cid] || 'native'); toast('Keys reset to defaults'); render(); return; }
    case 'app-detail': { const p = allProfiles().find(x => x.key === key); S.appDetail = key === 'default' ? { key: 'default', name: 'Default' } : Object.assign({ key }, p || { name: key }); S.menu = null; render(); return; }
    case 'add-app': prompt('Add application', [{ key: 'name', label: 'Application', placeholder: 'Firefox', list: (S.apps || []).map(a => ({ value: a.name })) }], v => addProfile(v.name, appClass(v.name)), 'Add'); return;
    case 'add-app-quick': await addProfile(b.dataset.name, b.dataset.cls); return;
    case 'rename-profile': prompt('Rename profile', [{ key: 'name', label: 'Name', value: (S.appDetail || {}).name }], async v => { for (const dd of S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[key]) { profs[key].name = v.name; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } } S.appDetail.name = v.name; render(); }, 'Rename'); return;
    case 'del-profile': { if (!confirm('Remove this profile on all devices?')) return; for (const dd of S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[key]) { delete profs[key]; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } } S.appDetail = null; render(); return; }
    case 'ov-reset': { const dd = S.devices.find(x => x.id === b.dataset.dev); const profs = JSON.parse(JSON.stringify(dd.config.profiles)); const sect = profs[b.dataset.profile][b.dataset.section]; if (sect) delete sect[b.dataset.cid]; merge(await call('set_profiles', { id: dd.id, profiles: profs })); render(); return; }
    case 'export': { const cfg = await call('export_config'); const p = await api.host.saveJson('logimx-settings.json', cfg); if (p) toast('Saved ' + p); S.menu = null; return; }
    case 'import': { const cfg = await api.host.openJson(); if (!cfg) return; await call('import_config', { config: cfg }); toast('Settings imported'); S.menu = null; refresh(); return; }
    case 'reset-all': { if (!confirm('Reset every device to default settings and assignments?')) return; for (const dd of S.devices) merge(await call('reset_device', { id: dd.id })); toast('Reset to defaults'); render(); return; }
    case 'show-config': api.host.openPath(S.status.config_path || '~/.config/logimx'); return;
    case 'sync-device': { const dd = S.devices.find(x => x.id === key); try { merge(await call('sync_from_device', { id: key })); toast(`${dd.name}: settings read from device`); } catch (x) { merge(await call('device', { id: key })); } render(); return; }
    case 'restore-backup': { if (!confirm('Restore this backup? Current settings are backed up first.')) return; await call('restore_backup', { file: key }); toast('Backup restored'); refresh(); return; }
    case 'create-backup': { await call('create_backup', { note: 'Manual' }); S.backups = await call('list_backups'); toast('Backup written'); render(); return; }
    case 'pair': S.pair = { step: 1, found: [] }; S.dlg = 'pair'; S.menu = null; render(); return;
    case 'pair-via': S.pair.via = key; render(); return;
    case 'bt-connect': { const b = S.pair && S.pair.bt; if (!b) return; const d = (b.list || []).find(x => x.address === key); b.busy = { address: key, name: d ? d.name : key, state: 'pairing' }; render(); api.host.btConnect(key); return; }
    case 'pair-next': {
      // Bluetooth: the dialog's own live search
      if (S.pair.step === 1 && S.pair.via === 'bt') { S.pair.step = 2; S.pair.bt = { list: [] }; render(); api.host.btOpen().catch(() => {}); return; }
      if (S.pair.step === 1 || (S.pair.step === 2 && S.pair.error)) { S.pair.step = 2; S.pair.error = null; S.pair.found = []; S.pair.passkey = null; render(); try { await call('pair_start'); } catch (x) { S.pair.error = x.message || 'Pairing is not available'; render(); } return; }
      if (S.pair.step === 3) { if (S.pair.bt) api.host.btClose(); S.dlg = null; render(); return; }
      return;
    }
    case 'pair-confirm': { try { await call('pair_confirm', { address: key }); S.pair.step = 3; S.pair.done = 'Pairing… the device joins when it confirms'; } catch (x) { S.pair.error = x.message; } render(); return; }
    case 'pair-cancel': call('pair_cancel').catch(() => {}); if (S.pair && S.pair.bt) api.host.btClose(); S.dlg = null; render(); return;
    case 'prompt-ok': { const p = S.prompt; const vals = {}; for (const f of p.fields) vals[f.key] = f.value || ''; S.dlg = p.back || null; await p.onOk(vals); return; }
    case 'report': { S.report = { what: '' }; S.dlg = 'report'; render(); const r = await api.host.diagReport(); S.report = Object.assign({ what: (S.report || {}).what || '' }, r); if (S.dlg === 'report') render(); return; }
    case 'wish': S.menu = null; S.wish = { what: '' }; S.dlg = 'wish'; render(); setTimeout(() => { const t = root.querySelector('textarea[data-field=wish]'); if (t) t.focus(); }, 50); return;
    case 'wish-open': {
      const w = S.wish, what = ((w && w.what) || '').trim(); if (!what) return;
      const title = 'Wish: ' + (what.split('\n')[0].length > 70 ? what.split('\n')[0].slice(0, 67) + '…' : what.split('\n')[0]);
      api.host.openExternal(`${ISSUE_URL}?labels=enhancement&title=${encodeURIComponent(title)}&body=${encodeURIComponent(wishBody(w))}`);
      S.dlg = null; toast('Wish received by the genie! Submit it on GitHub and the 24-hour clock starts'); render(); return;
    }
    case 'report-copy': api.host.copy(reportBody(S.report, true)); toast('Report copied'); return;
    case 'report-open': {
      const r = S.report; if (!r || !r.summary) return;
      // a link can only carry so much: past that the log travels on the clipboard instead
      let body = reportBody(r, true), full = true;
      if (encodeURIComponent(body).length > 6000) { body = reportBody(r, false); full = false; api.host.copy('```\n' + r.log + '\n```'); }
      api.host.openExternal(`${ISSUE_URL}?title=${encodeURIComponent(r.title)}&body=${encodeURIComponent(body)}`);
      S.dlg = null; toast(full ? 'Issue opened in your browser' : 'Issue opened; the log is on the clipboard to paste', false); render(); return;
    }
    case 'export-diag': { const diag = { status: S.status, devices: S.devices, config: await call('export_config'), logs: S.logs, ui: S.ui, when: new Date().toISOString() }; const p = await api.host.saveJson('logimx-diagnostics.json', diag); if (p) toast('Saved ' + p); return; }
    case 'copy-diag': api.host.copy(S.logs.map(l => l.t).join('\n') || JSON.stringify(S.status)); toast('Copied'); return;
    case 'refresh-logs': await loadLogs(); render(); return;
    case 'ax-open': api.host.accessibility(true); api.host.openAccessibility(); setTimeout(async () => { S.ax = await api.host.accessibility(false); render(); }, 4000); return;
    case 'install-udev': { const r = await api.host.installUdev(); toast(r && r.ok ? 'Rule installed, re-plug the receiver' : (r && r.error) || 'Failed', !(r && r.ok)); setTimeout(refresh, 2000); return; }
    case 'onboard': S.mode = 'onboard'; S.ob = { step: 1, preset: IS_WIN() ? 'win' : IS_MAC() ? 'mac' : 'gnome' }; render(); return;
    case 'ob-close': S.mode = 'app'; try { localStorage.setItem('onboarded', '1'); } catch (x) {} render(); return;
    case 'ob-step': S.ob.step = Number(key); render(); return;
    case 'ob-prev': S.ob.step = Math.max(1, S.ob.step - 1); render(); return;
    case 'ob-next': if (S.ob.step < 3) { S.ob.step++; render(); } else { await applyPreset(S.ob.preset); S.mode = 'app'; try { localStorage.setItem('onboarded', '1'); } catch (x) {} render(); } return;
    case 'ob-preset': S.ob.preset = key; render(); return;
  }
}

export const provide = { onAction };
