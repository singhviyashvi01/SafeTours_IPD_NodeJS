import { cellToLatLng, cellToBoundary, latLngToCell } from 'h3-js';
import { apiClient } from './apiClient';
import { riskCellStore } from '../storage/riskCellStore';
import { getClientConfig } from './clientConfig';
import { cacheFreshness, bboxAround, tileBoxes } from '../offline/cacheLogic';
import { cellRiskAt } from '../offline/deviceGeofence';
import { timeModifier } from '../offline/deviceCore';
import { riskCache as cfg } from '../offline/offlineConfig';

/**
 * Risk-cell cache orchestration: downloading regions while online and reading them back while offline.
 *
 * A region download calls GET /api/risk/cells?compact=true&includeUnknown=true&minLevel=SAFE per tile, so the
 * cache knows each cell's real status including SAFE and UNKNOWN. A cell that is missing from the cache is
 * therefore genuinely "no data" for the device, never assumed safe.
 */
const LEVEL_ORDER = ['SAFE', 'LOW', 'MODERATE', 'HIGH', 'EXTREME'];

/**
 * Downloads and stores a region.
 * @param {{lat:number,lng:number,radiusM:number,kind:'current'|'destination'|'manual',id?:string,onProgress?:Function,signal?:AbortSignal}} p
 * @returns {Promise<{cells:number, tiles:number, truncated:boolean, bytesEstimate:number}>}
 */
export async function downloadRegion({ lat, lng, radiusM, kind, id, onProgress, signal }) {
  const bbox = bboxAround(lat, lng, radiusM);
  const tiles = tileBoxes(bbox, cfg.tileSizeDeg);
  const byCell = new Map();
  let truncated = false;

  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i];
    const res = await apiClient.get('/risk/cells', {
      params: { ...t, minLevel: 'SAFE', includeUnknown: true, compact: true, limit: 3000 },
      signal,
    });
    if (res.data?.meta?.truncated) truncated = true;
    for (const row of res.data?.data || []) {
      const [clat, clng] = cellToLatLng(row.h3Index);
      byCell.set(row.h3Index, { ...row, lat: clat, lng: clng });
    }
    onProgress && onProgress({ done: i + 1, total: tiles.length });
  }

  const cells = [...byCell.values()];
  const regionId = id || `${kind}:${latLngToCell(lat, lng, 7)}`;
  await riskCellStore.saveRegion({ id: regionId, kind, bbox, center: { lat, lng }, radiusM, cells, fetchedAt: Date.now() });
  return { cells: cells.length, tiles: tiles.length, truncated, bytesEstimate: cells.length * cfg.rowBytesEstimate };
}

/** Downloads the area around the user unless a fresh cached cell already covers their position. */
export async function ensureCurrentRegion(lat, lng, { force = false } = {}) {
  if (!force) {
    const hit = await riskCellStore.getCell(latLngToCell(lat, lng, 9));
    if (hit && cacheFreshness(hit.fetchedAt, Date.now(), cfg) === 'fresh') return { skipped: true };
  }
  return downloadRegion({ lat, lng, radiusM: cfg.currentRadiusM, kind: 'current' });
}

/** Downloads the area around a journey destination. */
export const ensureDestinationRegion = (lat, lng, journeyId) =>
  downloadRegion({ lat, lng, radiusM: cfg.destinationRadiusM, kind: 'destination', id: `destination:${journeyId || latLngToCell(lat, lng, 7)}` });

// ── offline reads ───────────────────────────────────────────────────────────

const confidenceLabel = (c, riskCfg) => (c >= riskCfg.confidence.high ? 'HIGH' : c >= riskCfg.confidence.medium ? 'MEDIUM' : 'LOW');

function viewOf(row, now) {
  const riskCfg = getClientConfig().risk;
  const r = cellRiskAt(row, now, riskCfg);
  const mod = timeModifier(new Date(now), riskCfg);
  return {
    h3Index: row.h3Index,
    riskLevel: r.riskLevel,
    totalRiskScore: r.totalRisk,
    dataConfidence: r.dataConfidence,
    confidenceLabel: r.dataConfidence == null ? null : confidenceLabel(r.dataConfidence, riskCfg),
    lowConfidence: r.lowConfidence,
    demo: r.demo,
    topFactor: row.topFactor,
    breakdown: row.components || {},
    componentDetails: {},
    missing: [],
    stale: [],
    modifiers: { time: mod.time, festival: mod.festival, combinedMultiplier: Math.round(mod.combinedMultiplier * 100) / 100 },
    source: 'device', // computed on the phone from cached data
    fetchedAt: row.fetchedAt,
    freshness: cacheFreshness(row.fetchedAt, now, cfg),
  };
}

/** Cached risk of the cell containing the point, or null when that cell is not cached. */
export async function cachedRiskAt(lat, lng, now = Date.now()) {
  const row = await riskCellStore.getCell(latLngToCell(lat, lng, 9), now);
  return row ? viewOf(row, now) : null;
}

/**
 * Cached cells in a box, shaped like the server's /risk/cells rows (polygon from the H3 index), at least
 * `minLevel`. UNKNOWN and below-threshold cells are left out, like the online map does.
 */
export async function cachedCellsInBox(bbox, minLevel = 'LOW', now = Date.now()) {
  const rows = await riskCellStore.getCellsInBox(bbox, now);
  const minRank = LEVEL_ORDER.indexOf(minLevel);
  const cells = [];
  let oldest = null;
  for (const row of rows) {
    const v = viewOf(row, now);
    if (v.riskLevel === 'UNKNOWN' || LEVEL_ORDER.indexOf(v.riskLevel) < minRank) continue;
    oldest = oldest === null ? row.fetchedAt : Math.min(oldest, row.fetchedAt);
    cells.push({
      _id: row.h3Index,
      h3Index: row.h3Index,
      location: { type: 'Point', coordinates: [row.lng, row.lat] },
      polygon: cellToBoundary(row.h3Index),
      radius: 200,
      riskLevel: v.riskLevel,
      totalRiskScore: v.totalRiskScore,
      dataConfidence: v.dataConfidence,
      lowConfidence: v.lowConfidence,
      demo: v.demo,
      topFactor: v.topFactor,
    });
  }
  cells.sort((a, b) => (b.totalRiskScore ?? -1) - (a.totalRiskScore ?? -1));
  return { cells, oldestFetchedAt: oldest };
}
