/**
 * syncDeviceCore.js: copies backend/src/shared/deviceCore.js to frontend/src/offline/deviceCore.js.
 *   npm run sync:device-core
 * The two files must stay byte-identical (the backend test suite fails otherwise).
 */
const fs = require('fs');
const path = require('path');

const from = path.resolve(__dirname, '../shared/deviceCore.js');
const to = path.resolve(__dirname, '../../../frontend/src/offline/deviceCore.js');
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
console.log(`Copied\n  ${from}\n→ ${to}`);
