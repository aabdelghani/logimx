// View: Home, the devices side by side, and the window with no device yet.
import { isMouse } from '../../shared/profiles.mjs';
import { batIcon, known, isLow } from '../../shared/battery.mjs';

// from the rest of the window, filled in by link()
let S, agentNeedsBuild, batteryState, esc, homeDevices, homePhotoSrc, isOffline, root, themeMenu;
export function link(ctx) { ({ S, agentNeedsBuild, batteryState, esc, homeDevices, homePhotoSrc, isOffline, root, themeMenu } = ctx); }

function greeting() { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
function pageHome() {
  const devs = S.devices;
  const charging = devs.filter(d => d.battery && d.battery.charging).length;
  const low = devs.filter(d => isLow(d.battery));
  const summary = [`${devs.length} device${devs.length === 1 ? '' : 's'} connected`]
    .concat(charging ? [`${charging} charging`] : [], low.length ? [`${low.map(d => d.name).join(' and ')} ${low.length === 1 ? 'needs' : 'need'} charging`] : [], !charging && !low.length && devs.length ? ['batteries fine'] : []).join(' · ');
  const cards = homeDevices().map(d => {
    const off = isOffline(d);
    const b = d.battery, st = batteryState(b), src = homePhotoSrc(d);
    const hosts = (d.state || {}).hosts, host = hosts && typeof hosts.current === 'number' ? `host ${hosts.current + 1}` : '';
    const link = (d.transport === 'bolt' ? 'Bolt receiver' : d.transport === 'bluetooth' ? 'Bluetooth' : d.transport || 'Connected') + (host ? ` · ${host}` : '');
    const profName = d.profile && d.profile !== 'default' ? (((d.config || {}).profiles || {})[d.profile] || {}).name || d.profile : 'All applications';
    // photo, battery and state only: the name is in the tooltip, the link is an icon
    const linkIcon = d.transport === 'bluetooth' ? '<i class="fa-brands fa-bluetooth-b"></i>' : '<i class="fa-solid fa-wifi"></i>';
    return `<div class="dev-card ${isMouse(d) ? 'mouse' : 'kbd'} ${off ? 'off' : ''}" data-act="home-open" data-key="${esc(d.id)}" title="${esc(d.name)} · ${off ? 'Not connected' : esc(link)}">
      <div class="dev-photo">${src ? `<img src="${esc(src)}" alt="${esc(d.name)}">` : `<i class="fa-solid ${isMouse(d) ? 'fa-computer-mouse' : 'fa-keyboard'}"></i>`}</div>
      <div class="dev-body centered">
        ${off ? `<div class="dev-inactive"><span class="inactive-tag" title="Not connected">Inactive</span><button class="inactive-del" data-act="dev-hide" data-key="${esc(d.id)}" title="Remove from NotLogi"><i class="fa-solid fa-trash-can"></i></button></div>` : ''}<div class="dev-state ${st.cls}" ${off ? 'hidden' : ''}>${known(b) ? `<span class="dev-pct">${b.percent}%</span>` : ''}<i class="fa-solid ${b ? batIcon(b) : 'fa-battery-empty'}"></i>${b && b.charging ? '<i class="fa-solid fa-bolt dev-bolt"></i>' : ''}${st.label !== 'On battery' ? `<span class="dev-label">${esc(st.label)}</span>` : ''}${d.transport === 'bluetooth' ? `<span class="dev-link bt" title="${esc(link)}">${linkIcon}</span>` : ''}</div>
      </div></div>`;
  }).join('');
  // every device in one row, sharing the width; when they cannot all fit the row scrolls sideways
  // with the arrows (and the arrow keys), which only show then (homeFit, after drawing)
  const arrow = (dir, icon, title) => `<button class="home-arrow ${dir < 0 ? 'prev' : 'next'}" data-act="home-step" data-key="${dir}" title="${title}"><i class="fa-solid ${icon}"></i></button>`;
  return `<div class="home-pager">${arrow(-1, 'fa-arrow-left', 'Previous devices')}<div class="home-strip">${cards}</div>${arrow(1, 'fa-arrow-right', 'More devices')}</div>`;
}

// Once drawn: whether the row of devices fits (no arrows) or scrolls, and which arrows can move it.
function homeFit() {
  const pager = root.querySelector('.home-pager'), strip = pager && pager.querySelector('.home-strip');
  if (!strip) return;
  const update = () => {
    const over = strip.scrollWidth > strip.clientWidth + 2;
    pager.classList.toggle('fits', !over);
    const [prev, next] = pager.querySelectorAll('.home-arrow');
    prev.disabled = !over || strip.scrollLeft <= 2;
    next.disabled = !over || strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
  };
  strip.onscroll = update;
  update();
}
// ----------------------------------------------------------- states
function renderEmpty() {
  const c = S.conflicts[0], needsBuild = agentNeedsBuild();
  const booting = !S.ready || (S.connected && !S.loaded);
  return `<div class="window"><main class="main empty-wrap">
    <header class="hb"><span class="title">NotLogi</span><div class="right"><div style="position:relative"><button class="hbtn icon" data-act="menu-theme"><i class="fa-solid fa-circle-half-stroke"></i></button>${S.menu === 'theme' ? themeMenu() : ''}</div><button class="hbtn close" data-act="win-close"><i class="fa-solid fa-xmark"></i></button></div></header>
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

export const provide = { greeting, pageHome, renderEmpty, homeFit };
