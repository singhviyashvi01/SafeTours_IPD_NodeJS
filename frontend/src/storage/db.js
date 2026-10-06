import * as SQLite from 'expo-sqlite';
import { OUTBOX_SCHEMA } from '../offline/outboxStoreCore';
import { uuidv4 } from '../offline/uuid';

/**
 * One shared SQLite database (expo-sqlite SDK 54, async API) for everything the app keeps offline.
 * Schema versions use PRAGMA user_version; add a migration step below when a table changes.
 *
 *   kv_cache          generic key-value cache with TTL (nearby places, client config, settings)
 *   risk_regions      one row per downloaded bounding box (current / destination / manual)
 *   risk_cells        cached risk cells (H3 res 9) used for offline map layers and the offline geofence check
 *   outbox            (v2) everything waiting to reach the server: SOS, journey updates, community reports, offline
 *                     location points and geofence events. See offline/outboxStoreCore.js.
 *   offline_readings / offline_events: version 1 only. Migration 2 moves their un-uploaded rows into the outbox
 *                     and drops them.
 *   device_state      small JSON blobs (e.g. the on-device geofence state machine)
 */
const DB_NAME = 'safetours.db';
const SCHEMA_VERSION = 2;

let dbPromise = null;

async function migrate(db) {
  const row = await db.getFirstAsync('PRAGMA user_version');
  const current = row ? row.user_version : 0;
  if (current >= SCHEMA_VERSION) return;

  if (current < 1) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS kv_cache (
      key        TEXT PRIMARY KEY NOT NULL,
      value      TEXT NOT NULL,
      stored_at  INTEGER NOT NULL,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_kv_cache_expires ON kv_cache (expires_at);

    CREATE TABLE IF NOT EXISTS risk_regions (
      id          TEXT PRIMARY KEY NOT NULL,
      kind        TEXT NOT NULL,
      min_lat     REAL NOT NULL,
      max_lat     REAL NOT NULL,
      min_lng     REAL NOT NULL,
      max_lng     REAL NOT NULL,
      center_lat  REAL,
      center_lng  REAL,
      radius_m    INTEGER,
      fetched_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS risk_cells (
      h3          TEXT PRIMARY KEY NOT NULL,
      region_id   TEXT NOT NULL,
      lat         REAL NOT NULL,
      lng         REAL NOT NULL,
      level       TEXT NOT NULL,
      score       REAL,
      base_risk   REAL,
      confidence  REAL,
      low_conf    INTEGER NOT NULL DEFAULT 0,
      demo        INTEGER NOT NULL DEFAULT 0,
      top_factor  TEXT,
      comps       TEXT,
      fetched_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_risk_cells_region ON risk_cells (region_id);
    CREATE INDEX IF NOT EXISTS idx_risk_cells_pos ON risk_cells (lat, lng);

    CREATE TABLE IF NOT EXISTS offline_readings (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ts       INTEGER NOT NULL,
      lat      REAL NOT NULL,
      lng      REAL NOT NULL,
      accuracy REAL,
      h3       TEXT,
      uploaded INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_offline_readings_ts ON offline_readings (ts);

    CREATE TABLE IF NOT EXISTS offline_events (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ts       INTEGER NOT NULL,
      event    TEXT NOT NULL,
      h3       TEXT,
      level    TEXT,
      score    REAL,
      message  TEXT,
      source   TEXT NOT NULL DEFAULT 'device',
      uploaded INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS device_state (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  }

  if (current < 2) {
    await db.execAsync(OUTBOX_SCHEMA);
    // Carry over what version 1 recorded but never uploaded, each with its own idempotency key.
    const readings = await db.getAllAsync('SELECT * FROM offline_readings WHERE uploaded = 0 ORDER BY ts');
    for (const r of readings) {
      await db.runAsync(
        "INSERT INTO outbox (type, payload, idempotency_key, created_at, status) VALUES ('location_point', ?, ?, ?, 'pending')",
        JSON.stringify({ channel: 'geofence', latitude: r.lat, longitude: r.lng, accuracy: r.accuracy, timestamp: new Date(r.ts).toISOString(), h3Index: r.h3 }),
        uuidv4(),
        r.ts
      );
    }
    const events = await db.getAllAsync('SELECT * FROM offline_events WHERE uploaded = 0 ORDER BY ts');
    for (const e of events) {
      await db.runAsync(
        "INSERT INTO outbox (type, payload, idempotency_key, created_at, status) VALUES ('geofence_event', ?, ?, ?, 'pending')",
        JSON.stringify({ event: e.event, h3Index: e.h3, riskLevel: e.level, totalRisk: e.score, timestamp: new Date(e.ts).toISOString(), message: e.message }),
        uuidv4(),
        e.ts
      );
    }
    await db.execAsync('DROP TABLE IF EXISTS offline_readings; DROP TABLE IF EXISTS offline_events;');
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** The shared database handle (opened and migrated once). Rejects if SQLite is unavailable. */
export function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await migrate(db);
      return db;
    });
    dbPromise.catch(() => {
      dbPromise = null; // allow a retry on the next call
    });
  }
  return dbPromise;
}

/** Size of the database file in bytes (page_count x page_size); null if it cannot be read. */
export async function databaseBytes() {
  try {
    const db = await getDb();
    const pages = await db.getFirstAsync('PRAGMA page_count');
    const size = await db.getFirstAsync('PRAGMA page_size');
    return pages.page_count * size.page_size;
  } catch (e) {
    return null;
  }
}

export async function withTransaction(fn) {
  const db = await getDb();
  await db.withTransactionAsync(() => fn(db));
}
