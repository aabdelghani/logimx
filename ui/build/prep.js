// Copies the repository's LICENSE to where the installers read it: the Windows wizard's
// License page (license.txt) and the macOS disk image's agreement (license_en.txt).
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'LICENSE');
for (const name of ['license.txt', 'license_en.txt']) fs.copyFileSync(src, path.join(__dirname, name));
