/**
 * seedNearby.js: loads the last-resort seed for /api/nearby into the NearbyPlace collection.
 *
 *   npm run seed:nearby                              # dry run: counts only
 *   npm run seed:nearby -- --apply                   # write (idempotent upsert, safe to re-run)
 *   npm run seed:nearby -- --apply --file other.json
 *
 * Source: preprocessing/infra/infra_locations.json  {"police": [[lat,lng],...], "hospital": [[lat,lng],...]}
 * (OpenStreetMap locations only: no names, phones or hours). The API serves them with source "seed",
 * and only when every live provider failed and there is no cache for the area.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const h3 = require('h3-js');
const mongoose = require('mongoose');
const NearbyPlace = require('../models/NearbyPlace');
const cfg = require('../config/nearby.config');
const { inRegion } = require('../config/region.config');

const apply = process.argv.includes('--apply');
const fileArg = process.argv.indexOf('--file');
const file = fileArg > -1 ? process.argv[fileArg + 1] : path.resolve(__dirname, '../../../preprocessing/infra/infra_locations.json');

(async () => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const docs = [];
  const skipped = { badRow: 0, outsideRegion: 0, unknownType: 0 };

  for (const [type, rows] of Object.entries(data)) {
    if (!cfg.types[type]) {
      skipped.unknownType += rows.length;
      continue;
    }
    for (const row of rows) {
      const [lat, lng] = row;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { skipped.badRow += 1; continue; }
      if (!inRegion(lat, lng)) { skipped.outsideRegion += 1; continue; }
      docs.push({ type, name: null, lat, lng, h3Index: h3.latLngToCell(lat, lng, cfg.resolution), source: 'seed' });
    }
  }

  const counts = docs.reduce((a, d) => ({ ...a, [d.type]: (a[d.type] || 0) + 1 }), {});
  console.log(apply ? 'MODE: APPLY' : 'MODE: DRY RUN (add --apply to write)');
  console.log(`File: ${file}`);
  console.log('Usable places:', JSON.stringify(counts), 'skipped:', JSON.stringify(skipped));
  if (!apply) return;

  mongoose.set('autoIndex', false);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await NearbyPlace.createIndexes();
  const res = await NearbyPlace.bulkWrite(
    docs.map((d) => ({ updateOne: { filter: { type: d.type, lat: d.lat, lng: d.lng }, update: { $set: d }, upsert: true } })),
    { ordered: false }
  );
  console.log(`Upserted ${res.upsertedCount}, updated ${res.modifiedCount}, matched ${res.matchedCount}.`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error('seed:nearby failed:', e.message);
  process.exit(1);
});
