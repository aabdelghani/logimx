// View: the general pages: notifications, backup, settings, Flow, About.
import { isMouse } from '../../shared/profiles.mjs';

// from the rest of the window, filled in by link()
let ALT, IS_LINUX, IS_MAC, IS_WIN, META, S, THEMES, VERSION, allProfiles, card, esc, flowRefresh, range, row, sec, sw;
export function link(ctx) { ({ ALT, IS_LINUX, IS_MAC, IS_WIN, META, S, THEMES, VERSION, allProfiles, card, esc, flowRefresh, range, row, sec, sw } = ctx); }

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
function pageSettings(generalTitle = 'General') {
  const u = S.ui || {};
  return sec('Startup', card(row(IS_LINUX() ? 'Start agent at login' : 'Start NotLogi at sign-in', IS_LINUX() ? 'systemd user service' : IS_WIN() ? 'Starts hidden in the notification area' : 'Login item, starts hidden in the menu bar', sw(!!u.autostart, 'data-act="ui" data-key="autostart"')) +
      row(IS_MAC() ? 'Show menu bar icon' : 'Show tray indicator', IS_WIN() ? 'Battery and Easy-Switch in the notification area' : IS_MAC() ? 'Battery and Easy-Switch in the menu bar' : 'Battery and Easy-Switch in the top bar', sw(u.tray !== false, 'data-act="ui" data-key="tray"')) +
      row('Keep running when window closes', 'Closing hides to the tray', sw(u.minimize !== false, 'data-act="ui" data-key="minimize"')) +
      row('Start hidden', 'Open in the tray only', sw(!!u.start_hidden, 'data-act="ui" data-key="start_hidden"')) +
      (IS_LINUX() ? row('Notice Bluetooth devices in pairing mode', 'Like Windows: a notification offers to connect an MX mouse or keyboard as soon as it is ready to pair', sw(u.bt_watch !== false, 'data-act="ui" data-key="bt_watch"')) : ''))) +
    sec(generalTitle, card(`<div class="row"><span class="grow lbl">Appearance</span><select class="sel" data-act="theme-select">${THEMES.map(([k, l]) => `<option value="${k}" ${S.theme === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` +
      row('Language', '', '<span class="val">System (English)</span>') +
      `<div class="row"><div class="grow"><div class="lbl">Check for updates</div><div class="sub">Looks at the GitHub release feed</div></div><button class="btn sm" data-act="check-updates">Check now</button>${sw(u.updates !== false, 'data-act="ui" data-key="updates"')}</div>`)) +
    sec('Privacy', card(row('Telemetry', 'Off. NotLogi never sends data anywhere.', '<span class="val">Not available</span>'))) +
    // the window's other pages, each a row that opens it
    sec('More', card(morePages().map(([p, i, l, sub]) => `<div class="row click" data-act="page" data-page="${p}"><i class="fa-solid ${i}" style="width:20px;text-align:center;color:var(--dim)"></i><div class="grow"><div class="lbl">${l}</div><div class="sub">${sub}</div></div><i class="fa-solid fa-chevron-right" style="color:var(--dim);font-size:12px"></i></div>`).join('')));
}
const morePages = () => [
  ['notif', 'fa-bell', 'Notifications', 'On-screen overlays, low battery, devices connecting'],
  ['backup', 'fa-cloud-arrow-down', 'Backup & sync', 'Back up, restore, export and import settings'],
  ['apps', 'fa-layer-group', 'Profiles', 'Settings for each application'],
].concat(S.devices.some(isMouse) ? [] : [['ring', 'fa-circle-notch', 'Action ring', 'Eight actions around the pointer']],
  [['about', 'fa-circle-info', 'About NotLogi', 'Version, links, diagnostics']]);

// Flow: share the mouse, keyboard and clipboard with other computers on the LAN. LogiMX
// drives Deskflow (the open-source software KVM) under the hood; this computer is the
// server and the others join as clients. S.flow holds the last flow-info from main.
const FLOW_POS = [['left', 'Left', 'fa-arrow-left'], ['right', 'Right', 'fa-arrow-right'], ['up', 'Above', 'fa-arrow-up'], ['down', 'Below', 'fa-arrow-down']];
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
      row('Flow needs its sharing engine', 'NotLogi shares the mouse, keyboard and clipboard between computers using Deskflow, an open-source tool. Install it once to turn Flow on.',
        inst ? `<span class="val">Installing…</span>` : `<button class="btn primary" data-act="flow-install"><i class="fa-solid fa-download"></i>Install Flow support</button>`) +
      (inst && S.flowDetail ? `<div class="row sub" style="color:var(--dim)">${esc(S.flowDetail)}</div>` : ''))) +
      sec('', `<div class="hint">Deskflow is the open-source Barrier / Synergy fork. NotLogi only sets it up and runs it; nothing is sent anywhere online. <a href="#" data-act="open" data-url="https://deskflow.org">deskflow.org</a></div>`);
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
  const links = [['fa-book', 'Documentation', 'https://github.com/aabdelghani/notlogi#readme'], ['fa-code-branch', 'Source code', 'https://github.com/aabdelghani/notlogi'], ['fa-bug', 'Report an issue', 'https://github.com/aabdelghani/notlogi/issues'], ['fa-heart', 'Contributors', 'https://github.com/aabdelghani/notlogi/graphs/contributors']];
  const logs = S.logs.length ? S.logs : [{ t: `${new Date().toLocaleTimeString()} INFO  agent ${S.connected ? 'connected' : 'not running'} · ${S.devices.length} device(s) · tracker ${S.status.tracker || 'n/a'}`, c: 'dim' }];
  return `<div class="card about-hero"><span class="mark logo"><img class="logo-light" src="../assets/icon.png" alt=""><img class="logo-dark" src="../assets/icon-dark.png" alt=""></span><div class="name">NotLogi</div><div class="tagline">Unofficial mouse &amp; keyboard tools for ${IS_WIN() ? 'Windows' : IS_MAC() ? 'macOS' : 'Linux'}</div><div class="tags"><span>v${S.status.version || VERSION}</span><span title="Free software under the GNU GPL, version 3 or later">GPL-3.0</span><span>${S.appInfo.packaged ? 'Packaged' : 'Source'}</span>${IS_LINUX() ? '' : '<span>Beta</span>'}</div></div>` +
    card(links.map(([i, l, u]) => `<div class="row click" data-act="open" data-url="${u}"><i class="fa-solid ${i}" style="width:20px;text-align:center;color:var(--dim)"></i><span class="grow lbl">${l}</span><i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--dim);font-size:11px"></i></div>`).join('')) +
    sec('Diagnostics', card(`<div class="logs">${logs.map(l => `<span class="${l.c || 'dim'}">${esc(l.t)}</span>`).join('')}</div>`) + `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn primary" data-act="report"><i class="fa-solid fa-bug"></i>Report a problem</button><button class="btn" data-act="export-diag"><i class="fa-solid fa-file-zipper"></i>Export diagnostics</button><button class="btn" data-act="copy-diag"><i class="fa-solid fa-copy"></i>Copy</button></div>`, `<button class="btn sm flat" data-act="refresh-logs">Refresh</button>`);
}

export const provide = { pageNotif, pageBackup, pageSettings, FLOW_POS, flowIntro, pageFlow, pageAbout };
