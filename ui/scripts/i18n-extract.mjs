// Every English text the app shows, for translating: the literals given to t() in the window, the
// overlays and the main process, and the names that come from the agent's tables (preset actions,
// controls) which the window shows through t(). Writes shared/locales/en.json (English to English,
// the list a translation starts from) and, with --check, lists what each language still lacks.
//   node scripts/i18n-extract.mjs [--check]
import fs from 'fs';
import path from 'path';
import * as acorn from 'acorn';

const UI = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const LOC = path.join(UI, 'shared', 'locales');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' || e.name === 'test' || e.name === 'locales' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
export const sources = () => ['main.js', 'flow.js', ...['main', 'renderer', 'shared'].flatMap(d => walk(path.join(UI, d)))].map(f => path.resolve(UI, f)).filter(f => /\.(m?js)$/.test(f) && !/emoji-data\.js$/.test(f));

// the t('...') calls of one file: the texts, and the calls whose text is not a literal
export function calls(file) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: /\.mjs$|renderer\/(app|ring|tray)\.js$|renderer\/(view|vm|model)\//.test(file) ? 'module' : 'script', locations: true }); }
  catch (e) { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
  const texts = [], loose = [];
  (function visit(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && (n.callee.name === 't' || n.callee.name === 'en') && n.arguments.length) {
      const a = n.arguments[0];
      if (a.type === 'Literal' && typeof a.value === 'string') texts.push(a.value);
      else if (a.type === 'TemplateLiteral' && !a.expressions.length) texts.push(a.quasis[0].value.cooked);
      else if (!/i18n: data/.test(lines[n.loc.start.line - 1])) loose.push(`${path.relative(UI, file)}:${n.loc.start.line}`);
    }
    for (const [k, v] of Object.entries(n)) { if (k === 'loc') continue; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); }
  })(ast);
  // static text in the pages: data-i18n elements and titles
  return { texts, loose };
}
function htmlTexts() {
  const out = [];
  for (const f of fs.readdirSync(path.join(UI, 'renderer')).filter(f => f.endsWith('.html'))) {
    const s = fs.readFileSync(path.join(UI, 'renderer', f), 'utf8');
    for (const m of s.matchAll(/<[^>]*\bdata-i18n\b[^>]*>([^<]*)</g)) if (m[1].trim()) out.push(m[1].trim());
    for (const m of s.matchAll(/<[^>]*\bdata-i18n-title\b[^>]*>/g)) { const ti = /title="([^"]*)"/.exec(m[0]); if (ti) out.push(ti[1]); }
  }
  return out;
}
// names in the agent's tables that the window shows
function tableTexts() {
  const h = fs.readFileSync(path.join(UI, '..', 'agent', 'src', 'tables.gen.h'), 'utf8');
  const table = name => JSON.parse(new RegExp(`${name} = R"json\\((.*)\\)json"`).exec(h)[1]);
  const presets = Object.values(table('kPresetsJson').all).map(p => p.label);
  // gesture presets are also named without their 'Gestures: ' (the mouse page's preset pills)
  return [...presets, ...presets.filter(l => l.startsWith('Gestures: ')).map(l => l.slice(10)), ...Object.values(table('kControlLabelsJson'))];
}

export function catalogue() {
  const all = new Set(), loose = [];
  for (const f of sources()) { const c = calls(f); c.texts.forEach(x => all.add(x)); loose.push(...c.loose); }
  htmlTexts().forEach(x => all.add(x));
  tableTexts().forEach(x => all.add(x));
  return { texts: [...all].sort(), loose };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { texts, loose } = catalogue();
  if (loose.length) console.log('t() without a literal text (mark data with // i18n: data):\n  ' + loose.join('\n  '));
  fs.mkdirSync(LOC, { recursive: true });
  fs.writeFileSync(path.join(LOC, 'en.json'), JSON.stringify(Object.fromEntries(texts.map(x => [x, x])), null, 1) + '\n');
  console.log(`${texts.length} texts → shared/locales/en.json`);
  if (process.argv.includes('--check')) {
    for (const f of fs.readdirSync(LOC).filter(f => f.endsWith('.json') && f !== 'en.json')) {
      const d = JSON.parse(fs.readFileSync(path.join(LOC, f), 'utf8'));
      const miss = texts.filter(x => !d[x]);
      console.log(`${f}: ${texts.length - miss.length}/${texts.length}${miss.length ? ', missing ' + miss.length : ''}`);
    }
  }
}
