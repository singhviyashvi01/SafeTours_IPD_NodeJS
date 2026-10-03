/**
 * migrateGridCells.js — one-off migration to the component-based GridCell schema.
 *
 * Run it yourself; nothing in the app runs it. It is a DRY RUN unless you pass --apply.
 *
 *   node src/scripts/migrateGridCells.js                         # show what would change
 *   node src/scripts/migrateGridCells.js --apply                 # apply
 *   node src/scripts/migrateGridCells.js --apply --drop-dangerzones   # also drop the legacy collection
 *
 * What it does
 *  1. $unset the legacy flat fields on every GridCell (crimeScore, crowdScore, weatherScore, newsScore,
 *     communityScore, ewsScore, totalRisk, totalRiskScore, level, h3CellId). Those values came from the
 *     old Python engine / placeholder data and must not be treated as measurements; the new engine reads
 *     only `components.*`, so cells start as UNKNOWN until the producers write real data.
 *  2. Drops the legacy unique index h3CellId_1 if it exists.
 *  3. Creates the indexes declared in the models (GridCell, FeedStatus).
 *  4. (--drop-dangerzones) drops the legacy `dangerzones` collection (289 hotspots, 288 of them outside
 *     Mumbai, 10 with an invalid 'YELLOW' level). Crime data is rebuilt from CSV by the crime pipeline.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const mongoose = require('mongoose');
const GridCell = require('../models/GridCell');
const FeedStatus = require('../models/FeedStatus');

const apply = process.argv.includes('--apply');
const dropDangerZones = process.argv.includes('--drop-dangerzones');

const LEGACY_FIELDS = [
  'crimeScore', 'crowdScore', 'weatherScore', 'newsScore', 'communityScore',
  'ewsScore', 'totalRisk', 'totalRiskScore', 'level', 'h3CellId',
];

(async () => {
  mongoose.set('autoIndex', false);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log(apply ? 'MODE: APPLY' : 'MODE: DRY RUN (add --apply to write)');

  const total = await GridCell.collection.countDocuments();
  const legacyFilter = { $or: LEGACY_FIELDS.map((f) => ({ [f]: { $exists: true } })) };
  const withLegacy = await GridCell.collection.countDocuments(legacyFilter);
  console.log(`GridCell documents: ${total}, with legacy fields: ${withLegacy}`);

  if (apply && withLegacy > 0) {
    const unset = Object.fromEntries(LEGACY_FIELDS.map((f) => [f, '']));
    const res = await GridCell.collection.updateMany(legacyFilter, { $unset: unset });
    console.log(`  unset legacy fields on ${res.modifiedCount} documents`);
  }

  const indexes = await GridCell.collection.indexes();
  if (indexes.some((i) => i.name === 'h3CellId_1')) {
    console.log('Legacy index h3CellId_1 found.');
    if (apply) {
      await GridCell.collection.dropIndex('h3CellId_1');
      console.log('  dropped h3CellId_1');
    }
  }

  if (apply) {
    await GridCell.createIndexes();
    await FeedStatus.createIndexes();
    console.log('Indexes created (GridCell, FeedStatus).');
  } else {
    console.log('Would create indexes declared in GridCell and FeedStatus models.');
  }

  const hasDz = (await db.listCollections({ name: 'dangerzones' }).toArray()).length > 0;
  if (hasDz) {
    const n = await db.collection('dangerzones').estimatedDocumentCount();
    console.log(`Legacy collection dangerzones: ${n} documents.`);
    if (dropDangerZones && apply) {
      await db.collection('dangerzones').drop();
      console.log('  dropped dangerzones');
    } else if (dropDangerZones) {
      console.log('  would drop dangerzones (needs --apply)');
    }
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
