#!/usr/bin/env node
/**
 * importDangerZones.js — SafeTours IPD
 *
 * One-time (and safely re-runnable) import script that reads
 * crime_hotspots.csv produced by the DBSCAN preprocessing pipeline and
 * upserts every hotspot into the MongoDB `dangerzones` collection.
 *
 * Key behaviours
 * ──────────────
 *  • Idempotent  : Running the script multiple times will NOT create duplicates.
 *                  It uses updateOne + upsert:true keyed on `hotspotId`, so
 *                  re-runs simply overwrite existing documents with the latest
 *                  CSV values (useful when the CSV is regenerated).
 *  • Bulk write  : All rows are sent in a single bulkWrite call to minimise
 *                  round-trips to MongoDB.
 *  • Validation  : Each row is validated before the write; malformed rows are
 *                  skipped with a warning rather than aborting the entire run.
 *  • Logging     : Uses the shared logger utility to stay consistent with the
 *                  rest of the backend codebase.
 *
 * Usage
 * ─────
 *  1. Ensure your .env file exists at backend/.env (copy from .env.example).
 *  2. From the project root:
 *       node backend/src/scripts/importDangerZones.js
 *     Or from the backend directory:
 *       node src/scripts/importDangerZones.js
 *
 * Dependencies  : mongoose, csv-parse  (csv-parse ships with Node ≥18 via
 *                 the built-in readline; this script uses the sync parse
 *                 helper to keep things simple and synchronous).
 *
 * NOTE: This script calls process.exit() explicitly so it does not hang on
 * an open Mongoose connection after the work is done.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ─── Bootstrap environment variables ──────────────────────────────────────────
// Load .env from backend/ root (backend/src/scripts/ → backend/ = two levels up).
// Using an explicit path prevents the script from picking up an unrelated .env
// when invoked from a different working directory.
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  // Note: the path is resolved, no relative ambiguity
} else {
  // Fallback: let dotenv scan upward from cwd (e.g. when run from backend/)
  require('dotenv').config();
}

const mongoose  = require('mongoose');
const readline  = require('readline');
const logger    = require('../utils/logger');
const DangerZone = require('../models/DangerZone');

// ─── Configuration ─────────────────────────────────────────────────────────────

// Absolute path to the CSV produced by the DBSCAN preprocessing pipeline.
// Directory tree: backend/src/scripts/ → (3 up) → SafeTours_IPD_NodeJS/ → preprocessing/
// Adjust this path only if you move the preprocessing/ folder relative to the project root.
const CSV_PATH = path.resolve(
  __dirname,
  '../../..',           // scripts/ → src/ → backend/ → project root
  'preprocessing/crime_hotspots.csv'
);

// MongoDB connection URI — must be set in .env
const MONGO_URI = process.env.MONGO_URI;

// ─── CSV Row Validation ────────────────────────────────────────────────────────

/**
 * Validates and coerces a raw CSV row object (all values are strings from the
 * parser) into a clean document ready for the DangerZone schema.
 *
 * @param {Object} row    - Raw key/value pairs from the CSV parser.
 * @param {number} lineNo - 1-based line index in the CSV (for error messages).
 * @returns {{ doc: Object|null, error: string|null }}
 */
function parseAndValidateRow(row, lineNo) {
  const hotspotId           = parseInt(row['Hotspot_ID'],              10);
  const centerLat           = parseFloat(row['Center_Latitude']);
  const centerLon           = parseFloat(row['Center_Longitude']);
  const crimeCount          = parseInt(row['Crime_Count'],             10);
  const averageCrimeSeverity = parseFloat(row['Average_Crime_Severity']);
  const maximumCrimeSeverity = parseFloat(row['Maximum_Crime_Severity']);
  const crimeTypes          = (row['Crime_Types'] || '').trim();
  const crimeScore          = parseFloat(row['Crime_Score']);
  const riskLevel           = (row['Risk_Level']  || '').trim();

  // ── Numeric sanity checks ──────────────────────────────────────────────────
  if (isNaN(hotspotId))           return { doc: null, error: `Line ${lineNo}: invalid Hotspot_ID` };
  if (isNaN(centerLat))           return { doc: null, error: `Line ${lineNo}: invalid Center_Latitude` };
  if (isNaN(centerLon))           return { doc: null, error: `Line ${lineNo}: invalid Center_Longitude` };
  if (isNaN(crimeCount))          return { doc: null, error: `Line ${lineNo}: invalid Crime_Count` };
  if (isNaN(averageCrimeSeverity)) return { doc: null, error: `Line ${lineNo}: invalid Average_Crime_Severity` };
  if (isNaN(maximumCrimeSeverity)) return { doc: null, error: `Line ${lineNo}: invalid Maximum_Crime_Severity` };
  if (isNaN(crimeScore))          return { doc: null, error: `Line ${lineNo}: invalid Crime_Score` };

  // ── Coordinate bounds ──────────────────────────────────────────────────────
  if (centerLat < -90 || centerLat > 90)   return { doc: null, error: `Line ${lineNo}: latitude out of range` };
  if (centerLon < -180 || centerLon > 180) return { doc: null, error: `Line ${lineNo}: longitude out of range` };

  // ── Risk level whitelist ───────────────────────────────────────────────────
  const validRiskLevels = ['Safe', 'Low', 'Moderate', 'High', 'Extreme'];
  if (!validRiskLevels.includes(riskLevel)) {
    return { doc: null, error: `Line ${lineNo}: unknown Risk_Level "${riskLevel}"` };
  }

  // ── Assemble the document ──────────────────────────────────────────────────
  const doc = {
    hotspotId,
    location: {
      type: 'Point',
      // GeoJSON mandates [longitude, latitude] order — NOT [lat, lon]
      coordinates: [centerLon, centerLat],
    },
    crimeCount,
    averageCrimeSeverity,
    maximumCrimeSeverity,
    crimeTypes,
    crimeScore,
    riskLevel,
  };

  return { doc, error: null };
}

// ─── CSV Parser (uses Node built-in readline — no extra dependency) ───────────

/**
 * Reads the CSV file line by line and returns an array of parsed raw row objects.
 *
 * @param {string} filePath - Absolute path to the CSV file.
 * @returns {Promise<Object[]>} Array of raw row objects.
 */
function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`CSV file not found: ${filePath}`));
    }

    const rows    = [];
    let   headers = null;

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (rawLine) => {
      const line = rawLine.trim();
      if (!line) return; // skip blank lines

      // Simple CSV split that handles quoted fields (e.g. "Burglary, Fraud")
      const fields = splitCsvLine(line);

      if (!headers) {
        headers = fields; // first non-blank line is the header row
        return;
      }

      // Zip headers with values into a plain object
      const row = {};
      headers.forEach((h, i) => {
        row[h] = fields[i] !== undefined ? fields[i] : '';
      });
      rows.push(row);
    });

    rl.on('close', () => resolve(rows));
    rl.on('error', reject);
  });
}

/**
 * Splits a single CSV line into fields, correctly handling double-quoted fields
 * that may contain commas (e.g. `"Burglary, Fraud"`).
 *
 * @param {string} line
 * @returns {string[]}
 */
function splitCsvLine(line) {
  const fields = [];
  let   current = '';
  let   inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Escaped double-quote inside a quoted field: ""
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current.trim()); // last field
  return fields;
}

// ─── Main Import Logic ─────────────────────────────────────────────────────────

async function main() {
  // ── Pre-flight checks ────────────────────────────────────────────────────────
  if (!MONGO_URI) {
    logger.error('MONGO_URI is not defined. Set it in backend/.env and retry.');
    process.exit(1);
  }

  logger.info('=== DangerZone Import Script — SafeTours IPD ===');
  logger.info(`CSV source : ${CSV_PATH}`);
  logger.info(`MongoDB    : ${MONGO_URI}`);

  // ── Connect to MongoDB ───────────────────────────────────────────────────────
  logger.info('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  logger.info(`Connected to: ${mongoose.connection.host}`);

  // ── Read and parse the CSV ───────────────────────────────────────────────────
  logger.info('Reading crime_hotspots.csv...');
  const rawRows = await readCsv(CSV_PATH);
  logger.info(`Total rows read from CSV: ${rawRows.length}`);

  // ── Validate rows ────────────────────────────────────────────────────────────
  const bulkOps    = []; // valid upsert operations
  let   skipped    = 0;  // rows that failed validation

  rawRows.forEach((row, idx) => {
    const lineNo = idx + 2; // +1 for 0-index, +1 for header line
    const { doc, error } = parseAndValidateRow(row, lineNo);

    if (error) {
      logger.warn(`Skipping malformed row — ${error}`);
      skipped++;
      return;
    }

    /**
     * updateOne with upsert:true is the idempotency mechanism:
     *   - If a document with this hotspotId already exists → overwrite it.
     *   - If it does not exist → insert it as a new document.
     * Result: running the script 100 times produces exactly the same DB state.
     */
    bulkOps.push({
      updateOne: {
        filter: { hotspotId: doc.hotspotId },
        update: { $set: doc },
        upsert: true,
      },
    });
  });

  logger.info(`Rows validated — ${bulkOps.length} queued for upsert, ${skipped} skipped.`);

  if (bulkOps.length === 0) {
    logger.warn('No valid rows to insert. Exiting without writing to MongoDB.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── Execute bulk upsert ──────────────────────────────────────────────────────
  logger.info('Executing bulk upsert into MongoDB...');
  const result = await DangerZone.bulkWrite(bulkOps, { ordered: false });

  // ── Verification summary ─────────────────────────────────────────────────────
  const inserted = result.upsertedCount;
  const updated  = result.modifiedCount;
  const matched  = result.matchedCount;

  logger.info('─────────────────────────────────────────');
  logger.info('  IMPORT COMPLETE — Verification Summary  ');
  logger.info('─────────────────────────────────────────');
  logger.info(`  CSV rows read      : ${rawRows.length}`);
  logger.info(`  Rows skipped       : ${skipped}  (validation failures)`);
  logger.info(`  New docs inserted  : ${inserted}`);
  logger.info(`  Existing docs updated (re-run): ${updated} matched / ${matched} checked`);

  // Live count directly from the collection for ground-truth verification
  const totalInDb = await DangerZone.countDocuments();
  logger.info(`  Total DangerZones in MongoDB : ${totalInDb}`);
  logger.info('─────────────────────────────────────────');

  // ── Disconnect cleanly ───────────────────────────────────────────────────────
  await mongoose.disconnect();
  logger.info('MongoDB connection closed. Import script finished.');
  process.exit(0);
}

// ─── Run ───────────────────────────────────────────────────────────────────────
main().catch((err) => {
  logger.error('Fatal error during import', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
