// View model: application profiles and the ready-made gesture presets.
import { isMouse } from '../../shared/profiles.mjs';

// from the rest of the window, filled in by link()
let S, api, call, dev, gestureControl, merge, render, setAssign, toast;
export function link(ctx) { ({ S, api, call, dev, gestureControl, merge, render, setAssign, toast } = ctx); }

async function addProfile(name, cls, here) {
  name = (name || '').trim(); cls = (cls || '').trim();
  if (!name || !cls) return toast('Pick an application', true);
  if (/logimx|notlogi/i.test(cls)) return toast('NotLogi itself cannot have a profile', true);
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  for (const dd of here ? [dev()] : S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (!profs[key]) { profs[key] = { name, match: [cls] }; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } }
  if (here === 'quiet') return;   // the add panel: in the bar, set up when clicked (it says so once for all)
  if (here) { S.editProfile = key; S.dlg = null; render(); return; }   // from a device's profile bar: that device only, editing it
  S.appDetail = { key, name, match: [cls] }; render();
}
// A starting point everyone gets once: LibreOffice Writer, with its thumb wheel zooming and the
// side buttons undoing and redoing. Seeded the first time a mouse is seen; removing it is final.
let seeding = false;
async function seedProfiles() {
  if (seeding || !S.ui || S.ui.seeded_profiles || !S.devices.some(isMouse)) return;
  seeding = true;
  try {
    const has = S.devices.some(dd => Object.values((dd.config || {}).profiles || {}).some(p => (p.match || []).includes('libreoffice-writer')));
    if (!has) for (const dd of S.devices.filter(isMouse)) {
      const profs = JSON.parse(JSON.stringify(dd.config.profiles));
      profs['libreoffice-writer'] = { name: 'LibreOffice Writer', match: ['libreoffice-writer'], buttons: { 83: 'undo', 86: 'redo', 196: 'smartshift_toggle' }, thumbwheel: 'zoom_wheel' };
      merge(await call('set_profiles', { id: dd.id, profiles: profs }));
    }
    S.ui = await api.host.uiSettings({ seeded_profiles: true }) || S.ui;
    render();
  } catch (e) { } finally { seeding = false; }
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

export const provide = { addProfile, seedProfiles, applyPreset };
