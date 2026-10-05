// View: the dialogs: pairing, wishes and problem reports, prompts and confirmations, first run.
import { toolName } from '../../shared/actions.mjs';
import { isMouse } from '../../shared/profiles.mjs';

// from the rest of the window, filled in by link()
let IS_LINUX, IS_MAC, IS_WIN, S, VERSION, agentNeedsBuild, card, esc, row;
export function link(ctx) { ({ IS_LINUX, IS_MAC, IS_WIN, S, VERSION, agentNeedsBuild, card, esc, row } = ctx); }

// Bluetooth, the way Windows does it: put the device in pairing mode and it shows up here within
// seconds; Connect pairs, trusts and connects it, showing a keyboard's passkey to type
function btPairBody(p) {
  const b = p.bt || { list: [] };
  const busy = b.busy, list = b.list || [];
  const rows = list.map(d => {
    const mine = busy && busy.address === d.address;
    const right = !mine ? `<button class="btn primary sm" data-act="bt-connect" data-key="${esc(d.address)}" ${busy && busy.state !== 'failed' ? 'disabled' : ''}>Connect</button>`
      : busy.state === 'failed' ? `<button class="btn sm" data-act="bt-connect" data-key="${esc(d.address)}">Try again</button>`
      : `<span class="bt-wait"><i class="fa-solid fa-spinner fa-spin"></i>Connecting…</span>`;
    const sub = mine && busy.state === 'failed' ? `<span class="bt-err">${esc(busy.why || 'Could not connect')}</span>` : d.kind === 'keyboard' ? 'Keyboard' : 'Mouse';
    return `<div class="bt-dev"><span class="ic"><i class="fa-solid ${d.kind === 'keyboard' ? 'fa-keyboard' : 'fa-computer-mouse'}"></i></span><div class="grow"><div class="nm">${esc(d.name)}</div><div class="sub">${sub}</div></div>${right}</div>`;
  }).join('');
  const passkey = busy && busy.state === 'passkey' ? `<div class="bt-passkey"><div>Type this on <b>${esc(busy.name)}</b>, then press Enter</div><div class="digits">${esc(busy.passkey)}</div></div>` : '';
  return `<div class="center bt-search"><span class="ring bt-pulse"><i class="fa-brands fa-bluetooth-b"></i></span>
      <div style="font-size:16px;font-weight:600">${list.length ? 'Ready to connect' : 'Put your device in pairing mode'}</div>
      <div class="hint">Hold its Easy-Switch button for 3 seconds until the light blinks fast. It shows up here within a few seconds.</div></div>
    ${passkey}<div class="bt-list">${rows || '<div class="bt-empty"><i class="fa-solid fa-satellite-dish"></i>Searching for devices in pairing mode…</div>'}</div>
    <div class="hint" style="text-align:center"><a href="#" data-act="open-bt">Use the system Bluetooth settings instead</a></div>`;
}
function renderPair() {
  const p = S.pair;
  const steps = [[1, 'Connection'], [2, 'Discover'], [3, 'Done']].map(([n, l]) => `<button class="${n < p.step ? 'done' : n === p.step ? 'cur' : ''}"><span class="bar"></span><span class="t">${l}</span></button>`).join('');
  let body = '';
  if (p.step === 1) body = `<button class="choice ${p.via !== 'bt' ? 'on' : ''}" data-act="pair-via" data-key="bolt"><span class="ic"><i class="fa-brands fa-usb"></i></span><div class="grow"><div>Bolt receiver</div><div class="sub">${S.status.receivers ? esc(S.status.receivers) : 'Plugged in'}</div></div></button>
    <button class="choice ${p.via === 'bt' ? 'on' : ''}" data-act="${IS_LINUX() ? 'pair-via' : 'open-bt'}" data-key="bt"><span class="ic"><i class="fa-brands fa-bluetooth-b"></i></span><div class="grow"><div>Bluetooth</div><div class="sub">${IS_LINUX() ? 'Found and connected right here' : 'Via the system Bluetooth settings'}</div></div></button><div class="hint">Unifying receivers are supported for existing pairings only.</div>`;
  else if (p.step === 2 && p.via === 'bt') body = btPairBody(p);
  else if (p.step === 2) {
    const f = p.found[0];
    let title = 'Searching…', hint = 'Turn the device off and on, or hold its Easy-Switch key for 3 seconds until the LED blinks fast.';
    if (p.error) { title = 'Pairing failed'; hint = p.error; }
    else if (p.passkey && f) { title = `Confirm on ${f.name}`; hint = (f.authentication & 1) ? `Type these digits on the keyboard you are pairing, then press Enter.` : `Click ${[...p.passkey].map(c => c === '1' ? 'right' : 'left').join(', ')} on the mouse, then press both buttons together.`; }
    else if (f) { title = `Pairing ${f.name}`; hint = 'Waiting for the device to confirm.'; }
    body = `<div class="center"><span class="ring"><i class="fa-solid ${p.error ? 'fa-triangle-exclamation' : 'fa-satellite-dish'}"></i></span><div style="font-size:16px;font-weight:600">${esc(title)}</div><div class="hint">${esc(hint)}</div>${p.error ? '' : '<div class="progress"><i></i></div>'}${p.passkey && f && (f.authentication & 1) ? `<div class="keys">${[...p.passkey].map(c => `<span>${c}</span>`).join('')}</div>` : ''}${f ? `<div class="choice on" style="max-width:360px"><span class="ic"><i class="fa-solid ${f.kind === 'keyboard' ? 'fa-keyboard' : 'fa-computer-mouse'}"></i></span><div class="grow"><div>${esc(f.name)}</div><div class="sub">${esc(f.kind)}</div></div></div>` : ''}</div>`;
  }
  else body = `<div class="center"><span class="ring ok"><i class="fa-solid fa-check"></i></span><div style="font-size:16px;font-weight:600">${esc(p.done || 'Device paired')}</div><div class="hint">It will appear in the sidebar in a moment.</div></div>`;
  return `<div class="scrim" data-act="close-dlg"><div class="dlg" data-stop>
    <div class="dlg-head">Pair a device<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body"><div class="steps">${steps}</div>${body}</div>
    <div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="pair-cancel">Cancel</button>${p.step === 2 && p.via === 'bt' ? '' : `<button class="btn primary" data-act="pair-next" ${p.step === 2 && !p.error ? 'disabled' : ''}>${p.step === 3 ? 'Finish' : p.step === 2 ? 'Retry' : 'Continue'}</button>`}</div></div></div></div>`;
}
// The report goes into a public issue, so it is shown in full before anything leaves the machine
// and it is the person who submits it, signed in to their own account in the browser.
const ISSUE_URL = 'https://github.com/aabdelghani/notlogi/issues/new';
function reportBody(r, withLog) {
  return `### What happened\n\n${(r.what || '').trim() || '<!-- What did you do, what did you expect, what happened instead? -->'}\n\n### Diagnostics\n\n${r.summary}\n` +
    (withLog && r.log ? `\n<details><summary>Agent log, last lines</summary>\n\n\`\`\`\n${r.log}\n\`\`\`\n\n</details>\n` : withLog ? '' : '\n_The agent log was too long for the link: it is on the clipboard, paste it here._\n');
}
// A wish: a feature request in its own words, with only the version, system and devices beside it
function wishBody(w) {
  const devs = S.devices.map(d => d.name).join(', ') || 'none connected';
  return `### My wish\n\n${(w.what || '').trim()}\n\n### Setup\n\nNotLogi ${S.status.version || VERSION} on ${IS_WIN() ? 'Windows' : IS_MAC() ? 'macOS' : 'Linux'} · devices: ${devs}\n`;
}
function renderWish() {
  const w = S.wish || {};
  return `<div class="scrim" data-act="close-dlg"><div class="dlg" style="width:560px" data-stop>
    <div class="dlg-head">Make a wish<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body">
      <div class="wish-hero"><i class="fa-solid fa-wand-magic-sparkles"></i><div>Tell me what NotLogi should do for you. A button, a gesture, a device, anything: I read every wish.<div class="wish-pledge">My promise: your wish lands within 24 hours. Rub the lamp, I'm already coding.</div></div></div>
      <label class="hint">Your wish<textarea class="text" data-field="wish" rows="5" style="display:block;width:100%;margin-top:4px;resize:vertical;font:inherit" placeholder="I wish NotLogi could…">${esc(w.what || '')}</textarea></label>
      <div class="hint"><i class="fa-solid fa-circle-info"></i> Nothing is sent by NotLogi. Your browser opens a new issue on GitHub with your wish, the NotLogi version, the system and the device names; it becomes public when you press Submit there.</div>
    </div>
    <div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" data-act="wish-open" ${(w.what || '').trim() ? '' : 'disabled'}><i class="fa-solid fa-arrow-up-right-from-square"></i>Send my wish on GitHub</button></div></div></div></div>`;
}
function renderReport() {
  const r = S.report || {};
  return `<div class="scrim" data-act="close-dlg"><div class="dlg" style="width:640px" data-stop>
    <div class="dlg-head">Report a problem<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body">
      <label class="hint">What happened?<textarea class="text" data-field="what" rows="3" style="display:block;width:100%;margin-top:4px;resize:vertical;font:inherit" placeholder="What did you do, what did you expect, what happened instead?">${esc(r.what || '')}</textarea></label>
      <div class="hint">This is what will be in the issue. Serial numbers, host names and your user name are removed, and custom commands are reduced to their kind.</div>
      <pre class="report-pre">${esc(r.summary || 'Gathering…')}${r.log ? '\n\n--- agent log, last lines ---\n' + esc(r.log) : ''}</pre>
      <div class="hint"><i class="fa-solid fa-circle-info"></i> Nothing is sent by NotLogi. Your browser opens a new issue on GitHub with this text filled in; it becomes public when you press Submit there.</div>
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
// a yes/no question; the safe answer (Cancel) is the highlighted one
function renderConfirm() {
  const p = S.confirm;
  return `<div class="scrim" data-act="close-dlg"><div class="dlg" style="width:440px" data-stop>
    <div class="dlg-head">${esc(p.title)}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body"><div class="hint" style="font-size:14px">${esc(p.text)}</div></div>
    <div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="confirm-ok">${esc(p.ok)}</button><button class="btn primary" data-act="close-dlg" autofocus>Cancel</button></div></div></div></div>`;
}
// Windows needs nothing granted; macOS needs Accessibility so LogiMX can press keys and buttons
function onboardPermissions() {
  const agentOk = S.connected, conf = S.conflicts.length, ax = S.ax || { trusted: true };
  const mark = (ok, n) => ok ? '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>' : `<span class="mark-n">${n}</span>`;
  return `<div><h1>${IS_MAC() ? 'Permissions' : 'Getting ready'}</h1><div class="lead">${IS_MAC() ? 'NotLogi talks to your devices directly. To press keys and buttons for you, macOS asks you to allow it once.' : 'NotLogi talks to your devices directly. Nothing else needs to be installed.'}</div></div>
    ${card(`<div class="row">${mark(agentOk, 1)}<div class="grow"><div class="lbl">Background agent</div><div class="sub">${agentOk ? 'Running' : S.agentBusy ? 'Starting…' : esc(S.agentErr || 'Not running yet')}</div></div>${agentOk || S.agentBusy ? '' : '<button class="btn sm" data-act="start-agent">Start</button>'}</div>
      ${IS_MAC() ? `<div class="row">${mark(ax.trusted, 2)}<div class="grow"><div class="lbl">Accessibility</div><div class="sub">${ax.trusted ? 'Allowed' : 'System Settings > Privacy & Security > Accessibility: switch on NotLogi'}</div></div>${ax.trusted ? '' : '<button class="btn sm" data-act="ax-open">Open settings</button>'}</div>` : ''}
      <div class="row">${mark(!conf, IS_MAC() ? 3 : 2)}<div class="grow"><div class="lbl">Quit Logi Options+ while NotLogi runs</div>${conf ? `<div class="sub">${esc(S.conflicts.map(c => toolName(c.name)).join(', '))} is running</div>` : ''}</div>${conf ? `<button class="btn sm" data-act="stop-tool" data-tool="${esc(S.conflicts[0].name)}">Stop</button>` : ''}</div>`)}`;
}
function renderOnboard() {
  const o = S.ob;
  const steps = [[1, 'Permissions', IS_LINUX() ? 'udev rule and uinput' : IS_MAC() ? 'Accessibility' : 'Background agent'], [2, 'Devices', 'Choose what to manage'], [3, 'Preset', IS_LINUX() ? 'GNOME, macOS or Windows-like' : 'Gestures and the thumb wheel']].map(([n, t, s]) => `<button class="ob-step ${n === o.step ? 'cur' : n < o.step ? 'done' : ''}" data-act="ob-step" data-key="${n}"><span class="n">${n < o.step ? '✓' : n}</span><div><div class="t">${t}</div><div class="s">${s}</div></div></button>`).join('');
  let body = '';
  if (o.step === 1 && !IS_LINUX()) body = onboardPermissions();
  else if (o.step === 1) {
    const agentOk = S.connected, devOk = S.devices.length > 0;
    const conf = S.conflicts.length;
    body = `<div><h1>Permissions</h1><div class="lead">NotLogi talks to devices over HID and emits keys through uinput. Both need a one-time udev rule.</div></div>
      ${card(`<div class="row">${agentOk ? '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>' : '<span class="mark-n">1</span>'}<div class="grow"><div class="lbl">Background agent</div><div class="sub">${agentOk ? 'Running' : S.agentBusy ? 'Starting…' : esc(S.agentErr || 'Not running yet')}</div></div>${agentOk || S.agentBusy ? '' : `<button class="btn sm" data-act="start-agent">${agentNeedsBuild() ? 'Build and start' : 'Start now'}</button>`}</div>
        <div class="row">${devOk ? '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>' : '<span class="mark-n">2</span>'}<div class="grow"><div class="lbl">Access to /dev/hidraw* and /dev/uinput</div>${devOk ? '' : '<code class="cmd">sudo cp udev/60-logimx.rules /etc/udev/rules.d/ && sudo udevadm control --reload && sudo udevadm trigger</code>'}</div></div>
        <div class="row">${conf ? '<span class="mark-n">3</span>' : '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>'}<div class="grow"><div class="lbl">Stop Solaar or logid while NotLogi runs</div>${conf ? `<div class="sub">${esc(S.conflicts.map(c => c.name).join(', '))} is running</div>` : ''}</div>${conf ? `<button class="btn sm" data-act="stop-tool" data-tool="${esc(S.conflicts[0].name)}">Stop</button>` : ''}</div>`)}
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
  return `<div class="window"><main class="main"><header class="hb"><span class="title">Welcome to NotLogi</span><div class="right"><button class="hbtn close" data-act="ob-close"><i class="fa-solid fa-xmark"></i></button></div></header>
    <div class="onboard"><div class="steps-col">${steps}<div class="hint" style="margin-top:auto">Step ${o.step} of 3</div></div>
    <div class="ob-body">${body}<div class="ob-foot"><button class="btn" data-act="ob-prev" ${o.step === 1 ? 'disabled' : ''}>Back</button><button class="btn primary" data-act="ob-next">${o.step === 3 ? 'Finish' : 'Continue'}</button></div></div></div></main></div>`;
}

export const provide = { btPairBody, renderPair, ISSUE_URL, reportBody, wishBody, renderWish, renderReport, renderPrompt, renderConfirm, onboardPermissions, renderOnboard };
