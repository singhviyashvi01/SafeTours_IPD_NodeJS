/**
 * buildCrime.js: builds the crime component of the risk grid from a CSV of incidents.
 *
 *   npm run crime:build -- path/to/crimes.csv            # build and write to MongoDB
 *   npm run crime:build -- path/to/crimes.csv --dry-run  # report only, no database writes
 *   (--force writes even when there are fewer than minIncidentsToWrite usable incidents)
 *
 * CSV columns (header row, case-insensitive): lat, lng, crime_type, date  (optional: severity).
 * See config/crime.config.js for aliases and every tunable.
 *
 * Pipeline: parse -> keep only rows inside the Mumbai box with a valid date -> DBSCAN (haversine) ->
 * severity x recency weights -> spread to neighbouring cells -> log/percentile normalisation ->
 * GridCell.components.crime. Writing real data replaces any demo scores automatically.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const mongoose = require('mongoose');
const GridCell = require('../models/GridCell');
const crimeCfg = require('../config/crime.config');
const { runPipeline } = require('../services/crime/crimePipeline');
const { setComponentScores } = require('../services/risk/cellRisk.service');
const feedStatus = require('../services/risk/feedStatus.service');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('Usage: npm run crime:build -- path/to/crimes.csv [--dry-run]');
  console.error('Columns: lat, lng, crime_type, date  (optional: severity)');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

(async () => {
  mongoose.set('autoIndex', false);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const cells = await GridCell.find({}).select('h3Index').lean();
  if (cells.length === 0) throw new Error('GridCell collection is empty: generate the grid first.');

  const text = fs.readFileSync(file, 'utf8');
  const result = runPipeline(text, cells.map((c) => c.h3Index));
  const { stats } = result;

  console.log(`\nInput: ${path.basename(file)} (${stats.rowsRead} rows)`);
  console.log('Dropped:', JSON.stringify(stats.dropped));
  if (Object.keys(stats.unknownTypes).length) {
    console.log('Crime types missing from severityByType in config/crime.config.js (default or explicit severity used):');
    console.log('  ', JSON.stringify(stats.unknownTypes));
  }
  console.log(`Usable incidents: ${stats.incidents}`);
  console.log(`DBSCAN eps=${crimeCfg.dbscan.epsMeters} m, min_samples=${crimeCfg.dbscan.minSamples}: ${stats.clusters} clusters, ${stats.noisePoints} noise points`);
  console.log(`Cells with crime: ${stats.cellsWithCrime} of ${cells.length} (p${crimeCfg.normalization.percentile} reference ${stats.referenceRaw})`);

  if (result.lowConfidence) {
    console.warn(`\nWARNING: only ${stats.incidents} usable incidents (< ${crimeCfg.minIncidentsForConfidence}). ` +
      'Crime will be flagged lowConfidence. Rows outside the Mumbai box are never used.');
  }
  if (stats.incidents === 0) {
    console.error('\nNo usable incidents: nothing written (existing crime data, if any, is left as it is).');
    await mongoose.disconnect();
    process.exit(2);
  }
  if (stats.incidents < crimeCfg.minIncidentsToWrite && !force) {
    console.error(`\nRefusing to write: ${stats.incidents} usable incidents is below the minimum of ${crimeCfg.minIncidentsToWrite}. ` +
      'Writing it would make almost every cell look crime-free. Fix the file, or pass --force.');
    await mongoose.disconnect();
    process.exit(2);
  }
  if (dryRun) {
    console.log('\nDRY RUN: nothing written.');
    await mongoose.disconnect();
    return;
  }

  const meta = {
    source: 'csv',
    demo: false,
    file: path.basename(file),
    builtAt: new Date().toISOString(),
    incidents: stats.incidents,
    clusters: stats.clusters,
    lowConfidence: result.lowConfidence,
    ...(result.lowConfidence ? { note: 'Too few incidents to trust' } : {}),
  };
  const res = await setComponentScores('crime', result.scores, { meta });
  await feedStatus.markSuccess('crime', { source: 'csv', file: meta.file, incidents: stats.incidents, clusters: stats.clusters });
  console.log(`\nWrote crime component to ${res.modified} cells (${res.matched} matched). Demo data, if any, is replaced.`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error('crime:build failed:', e.message);
  process.exit(1);
});
