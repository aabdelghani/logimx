import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetLabel, keyName, assignIcon, actionIcon, typedKeys, codeToKey, toolName } from '../shared/actions.mjs';
import { batIcon, batClass, batteryText, batteryColor, LOW, CRITICAL } from '../shared/battery.mjs';
import { profileOf, ownAssignment, assignment, overridden, isNative, isMouse } from '../shared/profiles.mjs';

const presets = { all: { copy: { label: 'Copy', type: 'keystroke' }, weird: { label: 'Odd one', type: 'command' } } };

test('presetLabel names presets and each kind of action', () => {
  assert.equal(presetLabel('native', presets), 'Default');
  assert.equal(presetLabel(undefined, presets), 'Default');
  assert.equal(presetLabel('copy', presets), 'Copy');
  assert.equal(presetLabel('unknown', presets), 'unknown');
  assert.equal(presetLabel({ type: 'keystroke', keys: ['KEY_LEFTCTRL', 'KEY_C'] }, presets, 'linux'), 'Ctrl + C');
  assert.equal(presetLabel({ type: 'keystroke', keys: ['KEY_LEFTMETA', 'KEY_TAB'] }, presets, 'darwin'), 'Cmd + Tab');
  assert.equal(presetLabel({ type: 'command', cmd: 'ls' }), 'Run: ls');
  assert.equal(presetLabel({ type: 'type_text', text: 'x'.repeat(40) }), 'Type: ' + 'x'.repeat(24));
  assert.equal(presetLabel({ type: 'button', button: 'BTN_MIDDLE' }), 'MIDDLE click');
  assert.equal(presetLabel({ type: 'nothing' }), 'Disabled');
  assert.equal(presetLabel({ type: 'folder', label: 'Media' }), 'Media');
});

test('keyName follows the OS for modifiers', () => {
  assert.equal(keyName('KEY_LEFTMETA', 'linux'), 'Super');
  assert.equal(keyName('KEY_RIGHTMETA', 'win32'), 'Win');
  assert.equal(keyName('KEY_LEFTALT', 'darwin'), 'Option');
  assert.equal(keyName('KEY_PAGEUP'), 'Pageup');
  assert.equal(keyName('KEY_A'), 'A');
});

test('icons: preset icon, else type icon, else the fallback', () => {
  assert.equal(assignIcon('native', 'fa-x', presets), 'fa-x');
  assert.equal(assignIcon('copy', 'fa-x', presets), 'fa-copy');
  assert.equal(assignIcon('weird', 'fa-x', presets), 'fa-terminal');
  assert.equal(assignIcon({ type: 'folder' }, 'fa-x'), 'fa-folder');
  assert.equal(actionIcon('nope', presets), 'fa-circle-dot');
  assert.equal(actionIcon({ type: 'launch' }), 'fa-rocket');
});

test('typed shortcuts and key codes', () => {
  assert.deepEqual(typedKeys('ctrl + shift + t'), ['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_T']);
  assert.deepEqual(typedKeys('Super+L'), ['KEY_LEFTMETA', 'KEY_L']);
  assert.equal(typedKeys('  '), null);
  assert.equal(codeToKey('KeyQ'), 'KEY_Q');
  assert.equal(codeToKey('Digit7'), 'KEY_7');
  assert.equal(codeToKey('F11'), 'KEY_F11');
  assert.equal(codeToKey('Numpad3'), 'KEY_KP3');
  assert.equal(codeToKey('ControlLeft'), 'KEY_LEFTCTRL');
  assert.equal(codeToKey('Nope'), null);
  assert.equal(toolName('solaar'), 'Solaar');
  assert.equal(toolName('other'), 'other');
});

test('battery icon, class, words and colour agree on low and critical', () => {
  assert.equal(LOW, 20); assert.equal(CRITICAL, 10);
  assert.equal(batIcon({ percent: 90 }), 'fa-battery-full');
  assert.equal(batIcon({ percent: 10 }), 'fa-battery-empty');
  assert.equal(batIcon(null), 'fa-battery-empty');
  assert.equal(batClass({ percent: 10 }), 'err');
  assert.equal(batClass({ percent: 20 }), 'warn');
  assert.equal(batClass({ percent: 5, charging: true }), 'ok');
  assert.equal(batteryText({ percent: 65 }), '65%');
  assert.equal(batteryText({ percent: 15 }), '15% · charge soon');
  assert.equal(batteryText({ percent: 15, charging: true }), '15% · charging');
  assert.equal(batteryText(null), 'battery n/a');
  assert.equal(batteryColor({ percent: 8 }), 'var(--err)');
  assert.equal(batteryColor(undefined), 'var(--dim)');
});

test('profiles: an app profile falls back to the global one', () => {
  const d = { kind: 'mouse', config: { profiles: { default: { buttons: { 83: 'back' }, thumbwheel: 'hscroll' }, writer: { buttons: { 83: 'undo' } } } } };
  assert.deepEqual(profileOf(d, 'missing'), {});
  assert.equal(ownAssignment(d, 'buttons', 83, 'writer'), 'undo');
  assert.equal(ownAssignment(d, 'thumbwheel', null, 'default'), 'hscroll');
  assert.equal(assignment(d, 'buttons', 86, 'writer'), undefined);
  assert.equal(assignment(d, 'thumbwheel', null, 'writer'), 'hscroll');
  assert.equal(overridden(d, 'buttons', 83, 'writer'), true);
  assert.equal(overridden(d, 'buttons', 83, 'default'), false);
  assert.equal(isNative('native'), true); assert.equal(isNative('copy'), false);
  assert.equal(isMouse(d), true); assert.equal(isMouse({ kind: 'keyboard' }), false);
});

test('a battery that does not say its level is never low, and charging says so', async () => {
  const { known, isLow, pctText, batteryText, batIcon, batClass } = await import('../shared/battery.mjs');
  const charging = { percent: null, charging: true }, unknown = { percent: null, charging: false };
  assert.equal(known(charging), false);
  assert.equal(isLow(charging), false);
  assert.equal(isLow(unknown), false);
  assert.equal(isLow({ percent: 8, charging: false }), true);
  assert.equal(isLow({ percent: 8, charging: true }), false);
  assert.equal(pctText(charging), '');
  assert.equal(batteryText(charging), 'charging');
  assert.equal(batteryText({ percent: null, external_power: true }), 'plugged in');
  assert.equal(batIcon(charging), 'fa-plug');
  assert.equal(batClass(unknown), '');
});
