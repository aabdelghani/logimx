// Emoji picker overlay: search, categories, recents; Enter inserts the highlighted emoji, Esc closes.
(() => {
  // the language the main process chose (preload: window.i18n)
  const I18N = (window.i18n && window.i18n.load()) || { dict: {} };
  const t = (s, v) => { const o = I18N.dict[s] || s; return v ? o.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : o; };
  const $ = s => document.querySelector(s);
  const TITLES = { recent: t('Recently used'), smileys: t('Smileys & people'), animals: t('Animals & nature'), food: t('Food & drink'), activity: t('Activities'), travel: t('Travel & places'), objects: t('Objects'), symbols: t('Symbols'), flags: t('Flags') };
  const cats = [{ key: 'recent', icon: 'fa-clock-rotate-left', items: [] }].concat(window.EMOJI);
  let recent = [], sel = 0, visible = [], cat = 'all';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderCats() {
    $('#cats').innerHTML = cats.map(c => `<button data-cat="${c.key}" class="${cat === c.key ? 'on' : ''}" title="${TITLES[c.key]}"><i class="fa-solid ${c.icon}"></i></button>`).join('');
  }
  function section(title, items, offset) {
    if (!items.length) return '';
    return `<div class="h">${title}</div><div class="grid">${items.map((e, i) => `<button data-i="${offset + i}" title="${esc(e[1])}">${e[0]}</button>`).join('')}</div>`;
  }
  function renderBody() {
    const q = $('#q').value.trim().toLowerCase();
    visible = []; let html = '';
    if (q) {
      const terms = q.split(/\s+/);
      for (const c of cats.slice(1)) for (const e of c.items) if (terms.every(t => e[1].includes(t))) visible.push(e);
      html = visible.length ? section(t('Results'), visible, 0) : `<div class="empty">${t('No emoji match')}</div>`;
    } else {
      const list = cat === 'all' ? [{ key: 'recent', items: recent }].concat(cats.slice(1)) : cat === 'recent' ? [{ key: 'recent', items: recent }] : cats.filter(c => c.key === cat);
      for (const c of list) { html += section(TITLES[c.key], c.items, visible.length); visible = visible.concat(c.items); }
    }
    $('#body').innerHTML = html;
    sel = Math.min(sel, Math.max(0, visible.length - 1));
    highlight(false);
  }
  function highlight(scroll = true) {
    document.querySelectorAll('.grid button.sel').forEach(b => b.classList.remove('sel'));
    const b = document.querySelector(`.grid button[data-i="${sel}"]`);
    if (b) { b.classList.add('sel'); if (scroll) b.scrollIntoView({ block: 'nearest' }); }
    const e = visible[sel];
    $('#curch').textContent = e ? e[0] : ''; $('#curname').textContent = e ? e[1] : '';
  }
  function pick(i) { const e = visible[i]; if (!e) return; window.emoji.pick(e[0], e[1]); }

  $('#cats').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; cat = b.dataset.cat; sel = 0; $('#q').value = ''; renderCats(); renderBody(); $('#q').focus(); });
  $('#body').addEventListener('click', ev => { const b = ev.target.closest('button[data-i]'); if (b) pick(Number(b.dataset.i)); });
  $('#body').addEventListener('mousemove', ev => { const b = ev.target.closest('button[data-i]'); if (b && Number(b.dataset.i) !== sel) { sel = Number(b.dataset.i); highlight(false); } });
  $('#q').addEventListener('input', () => { sel = 0; renderBody(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); window.emoji.close(); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); pick(sel); return; }
    const cols = 8;
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[ev.key];
    if (move !== undefined) { ev.preventDefault(); sel = Math.max(0, Math.min(visible.length - 1, sel + move)); highlight(); return; }
    if (ev.key === 'Tab') { ev.preventDefault(); const keys = cats.map(c => c.key); let i = keys.indexOf(cat); i = (i + (ev.shiftKey ? -1 : 1) + keys.length) % keys.length; cat = keys[i]; sel = 0; renderCats(); renderBody(); }
  });
  window.emoji.onShow(msg => {
    document.documentElement.setAttribute('data-theme', msg.theme || 'light');
    recent = (msg.recent || []).map(ch => { for (const c of cats.slice(1)) for (const e of c.items) if (e[0] === ch) return e; return [ch, t('emoji')]; });
    cats[0].items = recent;
    $('#src').textContent = msg.source || t('Emoji key');
    cat = 'all'; sel = 0; $('#q').value = '';
    renderCats(); renderBody();
    setTimeout(() => $('#q').focus(), 30);
  });
  $('#q').placeholder = t('Search emoji');
  $('#src').textContent = t('Emoji key');
  renderCats(); renderBody();
})();
