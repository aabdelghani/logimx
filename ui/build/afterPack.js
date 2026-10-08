// macOS, after packing and before electron-builder signs the bundle.
//
// With MAC_SIGN_IDENTITY set (CI: the Developer ID), the three agent files under Resources/agent
// are signed here with the hardened runtime and a timestamp: electron-builder signs the app, its
// frameworks and the disk image, but not loose executables under Resources, and notarization
// refuses a bundle with any unsigned Mach-O in it. The identity is the same one for every
// release, so the permissions people grant (Accessibility, Input Monitoring) carry over updates.
//
// Without it (a fork, a local build) the whole bundle gets one ad-hoc signature instead: Apple
// Silicon refuses unsigned code, and packing broke the signature Electron ships with. Ad-hoc is
// a new identity every build, so permissions have to be granted again after each update.
const { execFileSync } = require('child_process');
const path = require('path');

const AGENT_FILES = ['logimx-agent', 'logimxctl', 'input_monitoring.node'];

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  const identity = process.env.MAC_SIGN_IDENTITY;
  if (identity) {
    for (const f of AGENT_FILES) {
      execFileSync('codesign', ['--force', '--options', 'runtime', '--timestamp', '--sign', identity, path.join(app, 'Contents', 'Resources', 'agent', f)], { stdio: 'inherit' });
    }
    return;
  }
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
