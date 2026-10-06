'use strict';

/**
 * Pure helpers of the offline caches: freshness (TTL), eviction planning, bounding boxes / tiles and size
 * estimates. No storage here; the SQLite stores call these.
 */

const EARTH_M_PER_DEG_LAT = 111320;
const RES9_AREA_KM2 = 0.1053; // average H3 res-9 hexagon area

/** 'fresh' < freshMs <= 'stale' < usableMs <= 'expired' */
function cacheFreshness(fetchedAt, now, cfg) {
  const age = now - new Date(fetchedAt).getTime();
  if (!(age >= 0)) return 'fresh'; // a future timestamp (clock skew) is treated as just fetched
  if (age < cfg.freshMs) return 'fresh';
  if (age < cfg.usableMs) return 'stale';
  return 'expired';
}

/**
 * Which regions to delete so the cache fits maxRows. Oldest first. Regions of a protected kind (current /
 * destination) are only evicted if everything unprotected is already gone and the cache is still too big.
 * @param {Array<{id:string, kind:string, fetchedAt:number|string|Date, cellCount:number}>} regions
 * @returns {string[]} region ids to evict
 */
function planEviction({ regions, maxRows, protectedKinds = [] }) {
  let total = regions.reduce((a, r) => a + r.cellCount, 0);
  if (total <= maxRows) return [];

  const byAge = (a, b) => new Date(a.fetchedAt).getTime() - new Date(b.fetchedAt).getTime();
  const order = [
    ...regions.filter((r) => !protectedKinds.includes(r.kind)).sort(byAge),
    ...regions.filter((r) => protectedKinds.includes(r.kind)).sort(byAge),
  ];

  const evict = [];
  for (const r of order) {
    if (total <= maxRows) break;
    evict.push(r.id);
    total -= r.cellCount;
  }
  return evict;
}

/** Bounding box (degrees) around a point for a radius in metres. */
function bboxAround(lat, lng, radiusM) {
  const dLat = radiusM / EARTH_M_PER_DEG_LAT;
  const dLng = radiusM / (EARTH_M_PER_DEG_LAT * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** Splits a box into tiles no larger than tileSizeDeg per side, covering it exactly with no gaps. */
function tileBoxes(bbox, tileSizeDeg) {
  const nLat = Math.max(1, Math.ceil((bbox.maxLat - bbox.minLat) / tileSizeDeg));
  const nLng = Math.max(1, Math.ceil((bbox.maxLng - bbox.minLng) / tileSizeDeg));
  const dLat = (bbox.maxLat - bbox.minLat) / nLat;
  const dLng = (bbox.maxLng - bbox.minLng) / nLng;
  const out = [];
  for (let i = 0; i < nLat; i += 1) {
    for (let j = 0; j < nLng; j += 1) {
      out.push({
        minLat: bbox.minLat + i * dLat,
        maxLat: i === nLat - 1 ? bbox.maxLat : bbox.minLat + (i + 1) * dLat,
        minLng: bbox.minLng + j * dLng,
        maxLng: j === nLng - 1 ? bbox.maxLng : bbox.minLng + (j + 1) * dLng,
      });
    }
  }
  return out;
}

function bboxAreaKm2(bbox) {
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const h = (bbox.maxLat - bbox.minLat) * 111.32;
  const w = (bbox.maxLng - bbox.minLng) * 111.32 * Math.cos((midLat * Math.PI) / 180);
  return h * w;
}

/** Rough number of res-9 cells in a box (an upper bound: parts of the box may be sea / outside coverage). */
const estimateCells = (bbox) => Math.round(bboxAreaKm2(bbox) / RES9_AREA_KM2);

/**
 * Centres for the nearby-places download: a square lattice with `spacingM` between points, keeping the
 * points whose own cell could reach the circle. Always includes the centre.
 */
function nearbyCenters(lat, lng, radiusM, spacingM) {
  const out = [{ lat, lng }];
  const steps = Math.ceil(radiusM / spacingM);
  const dLat = spacingM / EARTH_M_PER_DEG_LAT;
  const dLng = spacingM / (EARTH_M_PER_DEG_LAT * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  for (let i = -steps; i <= steps; i += 1) {
    for (let j = -steps; j <= steps; j += 1) {
      if (i === 0 && j === 0) continue;
      const dy = i * spacingM;
      const dx = j * spacingM;
      if (Math.hypot(dx, dy) <= radiusM + spacingM / 2) out.push({ lat: lat + i * dLat, lng: lng + j * dLng });
    }
  }
  return out;
}

module.exports = { cacheFreshness, planEviction, bboxAround, tileBoxes, bboxAreaKm2, estimateCells, nearbyCenters };
