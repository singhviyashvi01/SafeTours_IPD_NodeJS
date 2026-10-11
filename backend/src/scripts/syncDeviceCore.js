/**
 * syncDeviceCore.js: copies the pure modules shared with the phone from backend/src/shared to
 * frontend/src/offline.
 *   npm run sync:device-core
 *
 *   deviceCore.js      geofence state machine + time-of-day rules (offline geofence check)
 *   assistantRules.js  rule-based assistant answers + Home tips (offline assistant)
 *
 * Each pair must stay byte-identical (the backend test suite fails otherwise).
 */
const fs = require('fs');
const path = require('path');

const FILES = ['deviceCore.js', 'assistantRules.js'];
const toDir = path.resolve(__dirname, '../../../frontend/src/offline');
fs.mkdirSync(toDir, { recursive: true });

for (const name of FILES) {
  const from = path.resolve(__dirname, '../shared', name);
  const to = path.join(toDir, name);
  fs.copyFileSync(from, to);
  console.log(`Copied ${from}\n    -> ${to}`);
}
