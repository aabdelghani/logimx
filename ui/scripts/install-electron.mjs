// Electron 38 and later no longer fetch their binary on install; this does it after `npm install` or
// `npm ci`, so the app runs from source (run-ui.sh). ELECTRON_SKIP_BINARY_DOWNLOAD=1 skips it, as the
// tests need no Electron (the packages are built by electron-builder, which fetches its own).
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

if (!process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve('electron/install.js')], { stdio: 'inherit' });
}
