// The app's icon on the Linux desktop: the dock and the app grid show NotLogi's logo only when the
// window's class, the class every launcher entry names (StartupWMClass) and the class the app is
// started with all agree, and the icon the entries name is the logo itself. A mismatch shows a cog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), ROOT = path.join(UI, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const WM_CLASS = read('ui/main/env.js').match(/const WM_CLASS = '([^']+)'/)[1];

test('the window class is the app name', () => {
  assert.equal(read('ui/main.js').match(/app\.setName\('([^']+)'\)/)[1], WM_CLASS);
});

test('every way of starting the app gives the window that class', () => {
  const env = read('ui/main/env.js');
  assert.match(env, /--class=\$\{WM_CLASS\}/, 'launchCmd starts the app with --class=WM_CLASS');
  assert.doesNotMatch(env, /--class=(?!\$\{WM_CLASS\})/, 'no other --class in launchCmd');
  for (const f of ['run-ui.sh']) for (const m of read(f).matchAll(/--class=(\S+)/g)) assert.equal(m[1], WM_CLASS, `${f} starts the app with --class=${m[1]}`);
  for (const [name, cmd] of Object.entries(JSON.parse(read('ui/package.json')).scripts)) for (const m of cmd.matchAll(/--class=(\S+)/g)) assert.equal(m[1], WM_CLASS, `npm run ${name} starts the app with --class=${m[1]}`);
});

test('every launcher entry names that class', () => {
  // the AppImage's entry (electron-builder), flat or under `entry` as electron-builder 26 wants it
  const linux = JSON.parse(read('ui/package.json')).build.linux, desk = (linux.desktop && (linux.desktop.entry || linux.desktop)) || {};
  assert.equal(desk.StartupWMClass, WM_CLASS, 'package.json build.linux.desktop');
  // the .deb's entry
  assert.equal(read('packaging/deb/build.sh').match(/^StartupWMClass=(.+)$/m)[1], WM_CLASS, 'packaging/deb/build.sh');
  // the entries the app writes itself (from source or the AppImage, and for starting at login)
  const auto = read('ui/main/autostart.js'), written = [...auto.matchAll(/StartupWMClass=\$\{([A-Z_]+)\}|StartupWMClass=([^\\`]+)/g)];
  assert.ok(written.length >= 1, 'autostart.js writes StartupWMClass');
  for (const m of written) assert.ok(m[1] === 'WM_CLASS' || m[2] === WM_CLASS, `autostart.js writes StartupWMClass=${m[1] || m[2]}`);
});

test('the icon the entries name is the logo, installed where the desktop looks', () => {
  const icon = path.join(UI, 'assets', 'icon.png'), png = fs.readFileSync(icon);
  assert.equal(png.subarray(1, 4).toString(), 'PNG', 'assets/icon.png is a PNG');
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  assert.ok(w >= 256 && h >= 256, `assets/icon.png is ${w}x${h}, the 256x256 icon slot needs at least that`);
  // the .deb names Icon=logimx and installs the logo under that name
  const deb = read('packaging/deb/build.sh'), name = deb.match(/^Icon=(.+)$/m)[1];
  assert.match(deb, new RegExp(`ui/assets/icon\\.png" "[^"]*hicolor/256x256/apps/${name}\\.png"`), `the .deb installs assets/icon.png as ${name}.png`);
  // the app's own entry names the copy of the logo it puts in the icon theme
  assert.match(read('ui/main/autostart.js'), /Icon=\$\{icon\}/);
  assert.match(read('ui/main/autostart.js'), /fs\.copyFileSync\(iconSrc, iconDst\)/);
  // the AppImage's entry uses the build icon
  assert.ok(fs.existsSync(path.join(UI, JSON.parse(read('ui/package.json')).build.linux.icon)), 'build.linux.icon exists');
});
