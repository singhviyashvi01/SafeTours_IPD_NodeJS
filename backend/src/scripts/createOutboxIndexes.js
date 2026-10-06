/**
 * createOutboxIndexes.js: creates the indexes phase 6B needs. Run it yourself; nothing is written without --apply.
 *
 *   npm run create:indexes             # dry run: lists the indexes it would create and what already exists
 *   npm run create:indexes -- --apply  # creates them (idempotent, safe to re-run)
 *
 * Indexes
 *   idempotencyrecords  { user, scope, key } unique     one stored answer per (user, endpoint, key)
 *   idempotencyrecords  { createdAt } TTL 7 days        old records disappear on their own
 *   locations           { userId, idempotencyKey } unique, PARTIAL (only documents that have a key)
 *   soshistories        no new index (new fields are not queried)
 *
 * All of them are additive and partial/new-collection, so existing documents are unaffected and no data
 * migration is needed. NOTE: unless you disabled Mongoose autoIndex, the server also builds these indexes by
 * itself the first time it starts with this code.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const mongoose = require('mongoose');
const IdempotencyRecord = require('../models/IdempotencyRecord');
const Location = require('../models/Location');

const apply = process.argv.includes('--apply');

(async () => {
  mongoose.set('autoIndex', false);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(apply ? 'MODE: APPLY' : 'MODE: DRY RUN (add --apply to create)');

  for (const model of [IdempotencyRecord, Location]) {
    const wanted = model.schema.indexes().map(([fields, opts]) => `${JSON.stringify(fields)} ${JSON.stringify(opts || {})}`);
    let existing = [];
    try {
      existing = (await model.collection.indexes()).map((i) => i.name);
    } catch (e) {
      existing = ['(collection does not exist yet)'];
    }
    console.log(`\n${model.collection.name}\n  existing: ${existing.join(', ')}\n  schema declares:\n    ${wanted.join('\n    ')}`);
    if (apply) {
      await model.createIndexes();
      console.log('  created / verified.');
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error('create:indexes failed:', e.message);
  process.exit(1);
});
