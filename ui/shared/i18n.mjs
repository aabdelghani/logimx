// The app's languages, the ones Options+ offers. The English text is the key: t('Scroll speed')
// gives that text in the language in use, or the English when it has no translation yet. A name in
// braces is filled in from vars: t('{n} devices', { n }).
export const LANGS = [
  ['en', 'English'], ['da', 'Dansk'], ['de', 'Deutsch'], ['el', 'Ελληνικά'], ['es', 'Español'], ['fi', 'Suomi'],
  ['fr', 'Français'], ['it', 'Italiano'], ['ja', '日本語'], ['ko', '한국어'], ['nb', 'Norsk bokmål'], ['nl', 'Nederlands'],
  ['pl', 'Polski'], ['pt-BR', 'Português (Brasil)'], ['pt-PT', 'Português (Portugal)'], ['ru', 'Русский'], ['sv', 'Svenska'],
  ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'],
];
let dict = {}, lang = 'en';
// a window gets its language from the main process as it loads (its preload offers window.i18n)
try { const r = globalThis.i18n && globalThis.i18n.load(); if (r) { dict = r.dict || {}; lang = r.lang || 'en'; } } catch (e) {}

export function setLanguage(code, d) { lang = code || 'en'; dict = d || {}; }
export const language = () => lang;
export function t(s, vars) {
  const out = dict[s] || s;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : out;
}
// English text kept as data (saved in the settings, or a table's names) and translated only where it
// is shown with t(label): en() marks it so it is translated too, and gives it back unchanged
export const en = s => s;
// what fn makes, in English: labels about to be saved stay English whatever the language shown
export function inEnglish(fn) { const d = dict; dict = {}; try { return fn(); } finally { dict = d; } }
// static text in a page's HTML: elements marked data-i18n (their text) or data-i18n-title (their tooltip)
export function translatePage(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.textContent.trim());   // i18n: data
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.title);   // i18n: data
}
// which of the languages a system locale ('de-AT', 'pt', 'zh-HK') falls under; English when none
export function pick(locale) {
  const l = String(locale || '').replace('_', '-'), codes = LANGS.map(x => x[0]);
  if (codes.includes(l)) return l;
  const [base, region = ''] = l.split('-');
  if (base === 'zh') return /TW|HK|MO|Hant/i.test(l) ? 'zh-TW' : 'zh-CN';
  if (base === 'pt') return region.toUpperCase() === 'PT' ? 'pt-PT' : 'pt-BR';
  if (base === 'no' || base === 'nn') return 'nb';
  return codes.includes(base) ? base : 'en';
}
