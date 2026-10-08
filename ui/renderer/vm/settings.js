// View model: the window's settings, notifications, updates, backups and the config file.
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, VERSION, api, call, changed, merge, refresh, setGeneral, toast;
export function link(ctx) { ({ S, VERSION, api, call, changed, merge, refresh, setGeneral, toast } = ctx); }

// the screen state this view model owns: a newer release found at startup (shown on Home until dismissed)
export const state = { update: null };

// a.b.c later than x.y.z
function newer(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; }
  return false;
}
// At startup, unless Check for updates is switched off: a newer release on GitHub puts a banner on
// Home, and the desktop says so once for each new version
async function updateCheckAtStart() {
  if ((S.ui || {}).updates === false) return;
  let r; try { r = await api.host.checkUpdates(); } catch (e) { return; }
  if (!r || !r.ok || !r.latest || !newer(r.latest, VERSION)) return;
  S.update = { latest: r.latest, url: r.url };
  changed();
  if ((S.ui || {}).update_notified === r.latest) return;
  try {
    const n = new window.Notification('NotLogi', { body: t('Version {v} is available', { v: r.latest }) });
    n.onclick = () => api.host.openExternal(r.url);
  } catch (e) {}
  S.ui = await api.host.uiSettings({ update_notified: r.latest }) || S.ui;
}

// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'update-open': async (it, e, d, key) => { if (S.update && S.update.url) api.host.openExternal(S.update.url); return; },
  'update-later': async (it, e, d, key) => { S.update = null; changed(); return; },
  'general': async (it, e, d, key) => { await setGeneral({ [key]: !it.on }); changed(); return; },
  'general-val': async (it, e, d, key) => { await setGeneral({ [key]: it.data.val }); changed(); return; },
  'general-range': async (it, e, d, key) => { await setGeneral({ [key]: Number(it.value) }); return; },
  'osd-event': async (it, e, d, key) => { const ev = Object.assign({ mic: true, smartshift: true, backlight: true, host: true, dpi: false }, S.general.osd_events || {}); ev[key] = !it.on; await setGeneral({ osd_events: ev }); changed(); return; },
  'ui': async (it, e, d, key) => { const v = !it.on; S.ui = await api.host.uiSettings({ [key]: v }) || Object.assign(S.ui, { [key]: v }); changed(); return; },
  // the window's size: 'auto' or a fixed factor
  'ui-scale': async (it, e, d, key) => { const v = it.data.val === 'auto' ? 'auto' : Number(it.data.val); S.ui = await api.host.uiSettings({ scale: v }) || Object.assign(S.ui, { scale: v }); changed(); return; },
  'fwupd': async (it, e, d, key) => { toast(t('Are you serious now ?')); setTimeout(() => toast(t('You must be a Windows user !')), 2200); return; },
  'check-updates': async (it, e, d, key) => { const r = await api.host.checkUpdates(); if (!r.ok) return toast(t('Update check failed: {error}', { error: r.error }), true); const cur = VERSION; const has = r.latest && newer(r.latest, cur); toast(has ? t('Version {v} is available', { v: r.latest }) : t('You are on the latest version ({v})', { v: cur })); if (has && r.url) api.host.openExternal(r.url); return; },
  'export': async (it, e, d, key) => { const cfg = await call('export_config'); const p = await api.host.saveJson('logimx-settings.json', cfg); if (p) toast(t('Saved {path}', { path: p })); S.menu = null; return; },
  'import': async (it, e, d, key) => { const cfg = await api.host.openJson(); if (!cfg) return; await call('import_config', { config: cfg }); toast(t('Settings imported')); S.menu = null; refresh(); return; },
  'reset-all': async (it, e, d, key) => { if (!confirm(t('Reset every device to default settings and assignments?'))) return; for (const dd of S.devices) merge(await call('reset_device', { id: dd.id })); toast(t('Reset to defaults')); changed(); return; },
  'show-config': async (it, e, d, key) => { api.host.openPath(S.status.config_path || '~/.config/logimx'); return; },
  'restore-backup': async (it, e, d, key) => { if (!confirm(t('Restore this backup? Current settings are backed up first.'))) return; await call('restore_backup', { file: key }); toast(t('Backup restored')); refresh(); return; },
  'create-backup': async (it, e, d, key) => { await call('create_backup', { note: 'Manual' }); S.backups = await call('list_backups'); toast(t('Backup written')); changed(); return; },
};

export const provide = { updateCheckAtStart };
