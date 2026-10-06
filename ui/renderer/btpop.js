// A device in pairing mode: a small window that takes the keyboard, because the mouse being paired
// may be the only mouse there is. Tab moves between the buttons, Enter chooses, Esc closes.
(() => {
  // the language the main process chose (preload: window.i18n)
  const I18N = (window.i18n && window.i18n.load()) || { dict: {} };
  const t = (s, v) => { const o = I18N.dict[s] || s; return v ? o.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : o; };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let dev = null;
  document.getElementById('keys').innerHTML = t('<kbd>Tab</kbd> to move &nbsp; <kbd>Enter</kbd> to choose &nbsp; <kbd>Esc</kbd> to close');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.textContent.trim());   // i18n: data
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.title);   // i18n: data
  function buttons(list, focus) {
    $('row').innerHTML = list.map(([act, label, cls]) => `<button class="${cls || ''}" data-act="${act}">${label}</button>`).join('');
    $('row').querySelectorAll('button').forEach(b => b.onclick = () => run(b.dataset.act));
    const f = $('row').querySelector(`[data-act="${focus}"]`) || $('row').querySelector('button');
    if (f) setTimeout(() => f.focus(), 30);
  }
  function show(title, text, list, focus, keys = true) {
    $('title').textContent = title; $('text').innerHTML = text;
    buttons(list, focus); $('keys').style.display = keys && list.length ? '' : 'none';
  }
  function ready() {
    show(t('{name} is ready to connect', { name: dev.name }), t('It is in pairing mode. Connect it to this computer?'),
      [['connect', t('Connect'), 'primary'], ['dismiss', t('Not now')], ['off', t('Don\'t show again'), 'link']], 'connect');
  }
  function run(act) {
    if (act === 'connect' || act === 'retry') { window.btpop.act('connect', dev.address); connecting(); return; }
    window.btpop.act(act === 'off' ? 'off' : 'dismiss', dev && dev.address);
  }
  function connecting() {
    show(t('Connecting {name}…', { name: dev.name }), '<i class="fa-solid fa-spinner spin"></i>&nbsp; ' + t('Keep it in pairing mode for a few seconds.'), [['dismiss', t('Hide')]], 'dismiss');
  }
  window.btpop.onShow(msg => {
    dev = msg.device;
    const look = msg.look || {}, root = document.documentElement;
    root.dataset.theme = look.dark ? 'dark' : 'light';
    if (look.accent) { root.style.setProperty('--acc', look.accent); root.style.setProperty('--acc-fg', look.accentFg || '#fff'); }
    if (look.font) document.body.style.fontFamily = `"${look.font}", system-ui, sans-serif`;
    $('photo').innerHTML = msg.photo ? `<img src="${esc(msg.photo)}" alt="">` : `<i class="fa-solid ${dev.kind === 'keyboard' ? 'fa-keyboard' : 'fa-computer-mouse'}"></i>`;
    const card = document.querySelector('.card'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    ready();
  });
  window.btpop.onState(m => {
    if (m.type !== 'pair' || !dev || m.address !== dev.address) return;
    if (m.state === 'pairing') connecting();
    else if (m.state === 'passkey') show(t('Type this on {name}', { name: dev.name }), `<div class="digits">${esc(m.passkey)}</div>${t('Then press Enter on it.')}`, [['dismiss', t('Hide')]], 'dismiss');
    else if (m.state === 'connected') {
      show(t('{name} is connected', { name: dev.name }), '<i class="fa-solid fa-circle-check" style="color:var(--acc)"></i>&nbsp; ' + t('It is ready to use. NotLogi picks it up in a moment.'), [], null, false);
      const done = dev.address; setTimeout(() => { if (dev && dev.address === done) window.btpop.act('dismiss', done); }, 2600);   // nothing left to choose: it goes away
    }
    else if (m.state === 'failed') show(t('Could not connect {name}', { name: dev.name }), `<span class="err">${esc(m.why || t('Put it back in pairing mode and try again.'))}</span>`, [['retry', t('Try again'), 'primary'], ['dismiss', t('Close')]], 'retry');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); run('dismiss'); }
    // Tab stays inside the pop-up
    if (e.key === 'Tab') {
      const bs = [...document.querySelectorAll('button')]; if (!bs.length) return;
      const i = bs.indexOf(document.activeElement);
      e.preventDefault();
      bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
    }
  });
})();
