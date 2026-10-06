// macOS: give the app one consistent ad-hoc signature after packing. Apple Silicon refuses to
// run code without a valid signature, and packing renames and edits the bundle, which breaks
// the one Electron ships with. Ad-hoc is not a Developer ID: the first launch still needs a
// right-click > Open (or System Settings > Privacy & Security > Open Anyway).
const { execFileSync } = require('child_process');
const path = require('path');

// MAC_SIGN_IDENTITY (a certificate's name or hash in the keychain) signs with a real certificate
// instead. macOS ties the permissions people grant (Accessibility, Input Monitoring) to the
// signature: ad-hoc, every update is a new app and they have to be granted again; with a
// certificate they carry over.
exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', process.env.MAC_SIGN_IDENTITY || '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
