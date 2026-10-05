// The window's layers stay apart (Model, view models, views), and the parts that are linked at
// start (the window's modules, the main process's parts) find every name they use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import * as acorn from 'acorn';

const UI = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const R = path.join(UI, 'renderer');
const files = dir => fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f));
const read = f => fs.readFileSync(f, 'utf8');
const rel = f => path.relative(UI, f);
// code without comments and strings' contents, so rules see only code
const code = f => read(f).replace(/\/\/[^\n]*/g, '').replace(/`(?:\\.|[^`])*`|'(?:\\.|[^'\n])*'|"(?:\\.|[^"\n])*"/g, '""');

test('view models never touch the page', () => {
  for (const f of files(path.join(R, 'vm'))) {
    const s = code(f);
    for (const bad of ['document.', 'root.', 'querySelector', 'classList', 'innerHTML', 'window.agent']) assert.ok(!s.includes(bad), `${rel(f)} uses ${bad}`);
  }
});

test('views never call the Model or change state', () => {
  for (const f of files(path.join(R, 'view'))) {
    const s = code(f);
    for (const bad of [/\bapi\./, /\bstore\./, /\bcall\(/, /window\.agent\./]) assert.ok(!bad.test(s), `${rel(f)} uses ${bad}`);
    assert.ok(!/\bS\.\w+(\.\w+|\[[^\]]*\])*\s*(=[^=]|\+\+|--)/.test(s), `${rel(f)} writes state`);
  }
});

test('the Model knows nothing about screens', () => {
  for (const f of files(path.join(R, 'model'))) {
    const s = code(f);
    for (const bad of ['document.', 'root.', /\bS\./]) assert.ok(typeof bad === 'string' ? !s.includes(bad) : !bad.test(s), `${rel(f)} uses ${bad}`);
  }
});

// ------------------------------------------------------------ names
const GLOBALS = new Set(('window document setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame JSON Math Object Array ' +
  'Promise String Number Boolean console localStorage navigator Set Map WeakMap Date RegExp Error encodeURIComponent decodeURIComponent CSS Event ' +
  'KeyboardEvent MouseEvent MutationObserver confirm alert isNaN parseInt parseFloat Infinity NaN undefined Symbol Proxy Reflect getComputedStyle ' +
  'location performance URL Intl structuredClone queueMicrotask Image arguments globalThis process require module exports __dirname __filename Buffer').split(' '));
const declare = (p, into) => {
  if (!p) return;
  if (p.type === 'Identifier') into.add(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(q => declare(q.type === 'RestElement' ? q.argument : q.value, into));
  else if (p.type === 'ArrayPattern') p.elements.forEach(e => declare(e, into));
  else if (p.type === 'AssignmentPattern') declare(p.left, into);
  else if (p.type === 'RestElement') declare(p.argument, into);
};
const scopeOf = body => {
  const s = new Set();
  for (const n0 of body) {
    const n = n0.type === 'ExportNamedDeclaration' ? n0.declaration : n0;
    if (!n) continue;
    if (n.type === 'ImportDeclaration') n.specifiers.forEach(x => s.add(x.local.name));
    if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') s.add(n.id.name);
    if (n.type === 'VariableDeclaration') n.declarations.forEach(x => declare(x.id, s));
  }
  return s;
};
// identifiers used but declared nowhere in reach
function undefinedNames(file, sourceType) {
  const ast = acorn.parse(read(file), { ecmaVersion: 'latest', sourceType, locations: true });
  const out = new Set();
  (function visit(n, scopes) {
    if (!n || typeof n.type !== 'string') return;
    let sc = scopes;
    if (/Function/.test(n.type)) { const s = new Set(); n.params.forEach(p => declare(p, s)); if (n.id && n.type === 'FunctionExpression') s.add(n.id.name); if (n.body.type === 'BlockStatement') scopeOf(n.body.body).forEach(x => s.add(x)); sc = [s, ...scopes]; }
    else if (n.type === 'BlockStatement' || n.type === 'Program') sc = [scopeOf(n.body), ...scopes];
    else if (n.type === 'SwitchCase') sc = [scopeOf(n.consequent), ...scopes];
    else if (/^For/.test(n.type) && n.init && n.init.type === 'VariableDeclaration') { const s = new Set(); n.init.declarations.forEach(x => declare(x.id, s)); sc = [s, ...scopes]; }
    else if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'VariableDeclaration') { const s = new Set(); n.left.declarations.forEach(x => declare(x.id, s)); sc = [s, ...scopes]; }
    else if (n.type === 'CatchClause') { const s = new Set(); declare(n.param, s); sc = [s, ...scopes]; }
    for (const [k, v] of Object.entries(n)) {
      if (k === 'type' || k === 'loc' || k === 'start' || k === 'end') continue;
      if (n.type === 'MemberExpression' && k === 'property' && !n.computed) continue;
      if ((n.type === 'Property' || n.type === 'MethodDefinition') && k === 'key' && !n.computed) continue;
      if (/Specifier$/.test(n.type) || ((n.type === 'BreakStatement' || n.type === 'ContinueStatement' || n.type === 'LabeledStatement') && k === 'label')) continue;
      const each = x => {
        if (!x || typeof x.type !== 'string') return;
        if (x.type === 'Identifier' && !(/Declarator$/.test(n.type) && k === 'id') && !(/Function/.test(n.type) && (k === 'id' || k === 'params'))) {
          if (!GLOBALS.has(x.name) && !sc.some(s => s.has(x.name))) out.add(`${x.name} (line ${x.loc.start.line})`);
        } else visit(x, sc);
      };
      Array.isArray(v) ? v.forEach(each) : each(v);
    }
  })(ast, []);
  return [...out];
}

const windowFiles = () => [path.join(R, 'app.js'), path.join(R, 'ring.js'), path.join(R, 'ring-geometry.js'), ...['vm', 'view', 'model'].flatMap(d => files(path.join(R, d)))];
const mainFiles = () => [path.join(UI, 'main.js'), ...files(path.join(UI, 'main'))];

test('every name used is declared, imported or linked', () => {
  for (const f of windowFiles()) assert.deepEqual(undefinedNames(f, 'module'), [], rel(f));
  for (const f of mainFiles()) assert.deepEqual(undefinedNames(f, 'script'), [], rel(f));
});

// what a module takes in link() must be offered by some other part
const linkedOf = s => { const m = /filled in by link\(\)\nlet ([^;]*);/.exec(s); return m ? m[1].split(',').map(x => x.trim()) : []; };
const providedOf = s => { const m = /(?:export const provide|exports\.provide) = \{([\s\S]*?)\};\n/.exec(s); return m ? m[1].split(',').map(x => x.trim().split(':')[0].trim()).filter(Boolean) : []; };

test("the window's modules find every linked name", () => {
  const mods = ['vm', 'view'].flatMap(d => files(path.join(R, d)));
  const app = read(path.join(R, 'app.js'));
  const offered = new Set(mods.flatMap(f => providedOf(read(f))).concat(/const ctx = Object\.assign\(\{ ([^}]*) \}/.exec(app)[1].split(',').map(x => x.trim())));
  // fx's own view functions come through linkViews
  for (const f of mods) for (const n of linkedOf(read(f))) assert.ok(offered.has(n), `${rel(f)} links ${n}, which nothing offers`);
  for (const n of /const \{ ([^}]*) \} = ctx;/.exec(app)[1].split(',').map(x => x.trim())) assert.ok(offered.has(n), `app.js takes ${n}, which nothing offers`);
});

test("the main process's parts find every linked name", () => {
  const parts = files(path.join(UI, 'main'));
  const offered = new Set(parts.flatMap(f => providedOf(read(f))));
  const linked = f => { const m = /filled in by link\(\)\nlet ([^;]*);/.exec(read(f)); return m ? m[1].split(',').map(x => x.trim()) : []; };
  for (const f of parts) for (const n of linked(f)) assert.ok(offered.has(n), `${rel(f)} links ${n}, which nothing offers`);
  for (const n of /const \{ ([^}]*) \} = ctx;/.exec(read(path.join(UI, 'main.js')))[1].split(',').map(x => x.trim())) assert.ok(offered.has(n), `main.js takes ${n}, which nothing offers`);
});
