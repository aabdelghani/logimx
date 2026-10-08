// macOS, after packing and before electron-builder signs the bundle.
//
// With a certificate configured (CSC_LINK, CI: the Developer ID), there is nothing to do here:
// electron-builder signs the app, its frameworks, every Mach-O it finds inside the bundle (the
// agent files under Resources/agent too) and the disk image, with the hardened runtime, then
// notarizes. The identity is the same one for every release, so the permissions people grant
// (Accessibility, Input Monitoring) carry over updates.
//
// Without one (a fork, a local build) the whole bundle gets one ad-hoc signature instead: Apple
// Silicon refuses unsigned code, and packing broke the signature Electron ships with. Ad-hoc is
// a new identity every build, so permissions have to be granted again after each update.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'darwin' || process.env.CSC_LINK) return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
