import { getDb, withTransaction } from './db';
import { cacheFreshness, planEviction } from '../offline/cacheLogic';
import { riskCache as cfg } from '../offline/offlineConfig';

/**
 * SQLite store of cached risk cells (H3 res 9). A "region" is one downloaded bounding box:
 * kind = 'current' (around the user), 'destination' (journey end) or 'manual' ("Download this area").
 *
 * Cells are keyed by H3 index, so a lookup for the geofence check is one primary-key read. A cell that is
 * not here is NO DATA (never "safe"). Cells older than riskCache.usableMs are ignored; younger stale cells
 * are served with their age. The table is capped at riskCache.maxRows; the OLDEST regions are evicted first
 * (current and destination regions last).
 */
const toRow = (r) => ({
  h3Index: r.h3,
  level: r.level,
  score: r.score,
  baseRisk: r.base_risk,
  confidence: r.confidence,
  lowConfidence: Boolean(r.low_conf),
  demo: Boolean(r.demo),
  topFactor: r.top_factor,
  components: r.comps ? JSON.parse(r.comps) : null,
  lat: r.lat,
  lng: r.lng,
  fetchedAt: r.fetched_at,
});

export const riskCellStore = {
  /**
   * Stores (replaces) a region and its cells.
   * @param {{id:string, kind:string, bbox:Object, center?:{lat:number,lng:number}, radiusM?:number, cells:Array, fetchedAt?:number}} p
   *   cells: compact rows from GET /api/risk/cells?compact=true, each plus { lat, lng } (cell centre)
   */
  async saveRegion({ id, kind, bbox, center, radiusM, cells, fetchedAt = Date.now() }) {
    await withTransaction(async (db) => {
      await db.runAsync('DELETE FROM risk_cells WHERE region_id = ?', id);
      await db.runAsync(
        'INSERT OR REPLACE INTO risk_regions (id, kind, min_lat, max_lat, min_lng, max_lng, center_lat, center_lng, radius_m, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        id, kind, bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng, center ? center.lat : null, center ? center.lng : null, radiusM ?? null, fetchedAt
      );
      // Only the latest 'current' / 'destination' region stays protected from eviction; older ones become 'visited'.
      if (kind === 'current' || kind === 'destination') {
        await db.runAsync("UPDATE risk_regions SET kind = 'visited' WHERE kind = ? AND id != ?", kind, id);
      }
      for (const c of cells) {
        await db.runAsync(
          'INSERT OR REPLACE INTO risk_cells (h3, region_id, lat, lng, level, score, base_risk, confidence, low_conf, demo, top_factor, comps, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          c.h3Index, id, c.lat, c.lng, c.riskLevel, c.totalRiskScore ?? null, c.baseRisk ?? null, c.dataConfidence ?? null,
          c.lowConfidence ? 1 : 0, c.demo ? 1 : 0, c.topFactor ?? null, c.components ? JSON.stringify(c.components) : null, fetchedAt
        );
      }
    });
    return this.enforceCap();
  },

  /** One cell, or null when it is not cached or too old to use. */
  async getCell(h3Index, now = Date.now()) {
    try {
      const db = await getDb();
      const r = await db.getFirstAsync('SELECT * FROM risk_cells WHERE h3 = ?', h3Index);
      if (!r) return null;
      if (cacheFreshness(r.fetched_at, now, cfg) === 'expired') return null;
      return toRow(r);
    } catch (e) {
      return null;
    }
  },

  /** Cells whose centre lies inside the box (expired ones excluded). */
  async getCellsInBox(bbox, now = Date.now()) {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync(
        'SELECT * FROM risk_cells WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND fetched_at > ?',
        bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng, now - cfg.usableMs
      );
      return rows.map(toRow);
    } catch (e) {
      return [];
    }
  },

  /** Region rows with their ACTUAL current cell counts (cells can move to a newer overlapping region). */
  async listRegions() {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync(
        `SELECT r.id, r.kind, r.fetched_at, r.radius_m, r.center_lat, r.center_lng,
                (SELECT COUNT(*) FROM risk_cells c WHERE c.region_id = r.id) AS cell_count
         FROM risk_regions r ORDER BY r.fetched_at DESC`
      );
      return rows.map((r) => ({ id: r.id, kind: r.kind, fetchedAt: r.fetched_at, radiusM: r.radius_m, center: r.center_lat === null ? null : { lat: r.center_lat, lng: r.center_lng }, cellCount: r.cell_count }));
    } catch (e) {
      return [];
    }
  },

  /** Evicts the oldest regions while the table is over maxRows. Returns the evicted region ids. */
  async enforceCap() {
    const regions = await this.listRegions();
    const evict = planEviction({ regions, maxRows: cfg.maxRows, protectedKinds: cfg.protectedKinds });
    if (evict.length) {
      await withTransaction(async (db) => {
        for (const id of evict) {
          await db.runAsync('DELETE FROM risk_cells WHERE region_id = ?', id);
          await db.runAsync('DELETE FROM risk_regions WHERE id = ?', id);
        }
      });
    }
    return evict;
  },

  /** Deletes cells older than usableMs and regions left empty. */
  async purgeExpired(now = Date.now()) {
    try {
      const db = await getDb();
      const res = await db.runAsync('DELETE FROM risk_cells WHERE fetched_at <= ?', now - cfg.usableMs);
      await db.runAsync('DELETE FROM risk_regions WHERE id NOT IN (SELECT DISTINCT region_id FROM risk_cells)');
      return res.changes || 0;
    } catch (e) {
      return 0;
    }
  },

  /** { cells, regions, oldestFetchedAt, newestFetchedAt, bytes (stored data, estimated) } */
  async stats() {
    try {
      const db = await getDb();
      const a = await db.getFirstAsync('SELECT COUNT(*) AS n, MIN(fetched_at) AS oldest, MAX(fetched_at) AS newest FROM risk_cells');
      const b = await db.getFirstAsync('SELECT COUNT(*) AS n FROM risk_regions');
      const c = await db.getFirstAsync('SELECT COALESCE(SUM(LENGTH(h3) + LENGTH(level) + LENGTH(COALESCE(comps, \'\')) + LENGTH(COALESCE(top_factor, \'\')) + 56), 0) AS bytes FROM risk_cells');
      return { cells: a.n, regions: b.n, oldestFetchedAt: a.oldest, newestFetchedAt: a.newest, bytes: c.bytes };
    } catch (e) {
      return { cells: 0, regions: 0, oldestFetchedAt: null, newestFetchedAt: null, bytes: 0 };
    }
  },

  async clear() {
    try {
      const db = await getDb();
      await db.runAsync('DELETE FROM risk_cells');
      await db.runAsync('DELETE FROM risk_regions');
      return true;
    } catch (e) {
      return false;
    }
  },
};
