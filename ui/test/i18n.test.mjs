// Translations: every t() names its English text plainly (so it can be found and translated), and
// each language keeps a text's {placeholders} and markup, so nothing is lost or broken in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { catalogue } from '../scripts/i18n-extract.mjs';
import { t, setLanguage, pick, LANGS } from '../shared/i18n.mjs';

const LOC = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'shared', 'locales');

test('t() fills placeholders and falls back to English', () => {
  setLanguage('de', { 'Scroll speed': 'Scrollgeschwindigkeit', '{n} devices': '{n} Geräte' });
  assert.equal(t('Scroll speed'), 'Scrollgeschwindigkeit');
  assert.equal(t('{n} devices', { n: 3 }), '3 Geräte');
  assert.equal(t('Not translated'), 'Not translated');
  setLanguage('en', {});
});

test('system locales fall under the languages offered', () => {
  assert.equal(pick('de-AT'), 'de');
  assert.equal(pick('pt'), 'pt-BR');
  assert.equal(pick('pt-PT'), 'pt-PT');
  assert.equal(pick('zh-HK'), 'zh-TW');
  assert.equal(pick('zh'), 'zh-CN');
  assert.equal(pick('nn-NO'), 'nb');
  assert.equal(pick('ar-EG'), 'en');
  assert.equal(LANGS.length, 19);
});

test('every t() gives its English text as a literal', () => {
  assert.deepEqual(catalogue().loose, []);
});

const marks = s => [...(s.match(/\{\w+\}/g) || []), ...(s.match(/<\/?[a-z]+[^>]*>/gi) || [])].sort();
test('translations keep placeholders and markup', () => {
  for (const f of fs.existsSync(LOC) ? fs.readdirSync(LOC).filter(f => f.endsWith('.json') && f !== 'en.json') : []) {
    const d = JSON.parse(fs.readFileSync(path.join(LOC, f), 'utf8'));
    for (const [en, tr] of Object.entries(d)) assert.deepEqual(marks(tr), marks(en), `${f}: "${en}" → "${tr}"`);
  }
});
