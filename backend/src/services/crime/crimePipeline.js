const h3 = require('h3-js');
const crimeCfg = require('../../config/crime.config');
const { region, inRegion, haversineMeters } = require('../../config/region.config');

/**
 * Crime pipeline (pure functions, no database):
 *   parseCsv -> normalizeRows (filter to the region, validate, weight)
 *            -> dbscan (haversine) -> scoreCells (cluster factor, recency, spread, normalisation)
 * scripts/buildCrime.js wires it to the CSV file and to the GridCell collection.
 */

const H3_RES = 9;
const DAY_MS = 86400000;

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** Minimal RFC-4180 parser (quoted fields, escaped quotes, CRLF). Returns an array of objects. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj;
  });
}

const pick = (row, names) => {
  for (const n of names) if (row[n] !== undefined && row[n] !== '') return row[n];
  return undefined;
};

const normalizeType = (t) => String(t || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

// ─── Normalise + filter ──────────────────────────────────────────────────────

/**
 * Validates every row, keeps only incidents inside the region and within the age window, and attaches
 * severity and recency-decayed weight. Returns the usable incidents plus a precise account of what
 * was dropped (the build script prints it).
 */
function normalizeRows(rows, { now = new Date(), cfg = crimeCfg } = {}) {
  const dropped = { invalidCoordinates: 0, outsideRegion: 0, invalidDate: 0, tooOld: 0, inFuture: 0 };
  const unknownTypes = new Map();
  const incidents = [];

  for (const row of rows) {
    const lat = Number(pick(row, ['lat', 'latitude']));
    const lng = Number(pick(row, ['lng', 'lon', 'long', 'longitude']));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      dropped.invalidCoordinates += 1;
      continue;
    }
    if (!inRegion(lat, lng)) {
      dropped.outsideRegion += 1;
      continue;
    }

    const rawDate = pick(row, ['date', 'datetime', 'incident_date', 'timestamp']);
    const time = rawDate ? Date.parse(rawDate) : NaN;
    if (Number.isNaN(time)) {
      dropped.invalidDate += 1;
      continue;
    }
    const ageDays = (now.getTime() - time) / DAY_MS;
    if (ageDays < -cfg.maxFutureDays) {
      dropped.inFuture += 1;
      continue;
    }
    if (ageDays > cfg.recency.maxAgeDays) {
      dropped.tooOld += 1;
      continue;
    }

    const typeRaw = pick(row, ['crime_type', 'type', 'category', 'offence', 'offense']) || '';
    const type = normalizeType(typeRaw);
    let severity = cfg.severityByType[type];
    if (severity === undefined) {
      const explicit = Number(pick(row, ['severity', 'crime_severity']));
      severity = Number.isFinite(explicit) && explicit >= 1 && explicit <= 10 ? explicit : cfg.defaultSeverity;
      unknownTypes.set(type || '(blank)', (unknownTypes.get(type || '(blank)') || 0) + 1);
    }

    const recency = Math.pow(0.5, Math.max(0, ageDays) / cfg.recency.halfLifeDays);
    incidents.push({ lat, lng, type, severity, time, weight: severity * recency });
  }

  return { incidents, dropped, unknownTypes: Object.fromEntries(unknownTypes) };
}

// ─── DBSCAN (haversine) ──────────────────────────────────────────────────────

/**
 * Density clustering on lat/lng with a haversine metric. A spatial hash (bucket size = eps) keeps
 * neighbour search near-linear, so large files stay fast.
 * @returns {Int32Array} cluster label per point, -1 = noise
 */
function dbscan(points, epsMeters, minSamples) {
  const n = points.length;
  const labels = new Int32Array(n).fill(-2); // -2 unvisited, -1 noise
  if (n === 0) return labels;

  const meanLat = points.reduce((a, p) => a + p.lat, 0) / n;
  const dLat = epsMeters / 111320;
  const dLng = epsMeters / (111320 * Math.max(0.1, Math.cos((meanLat * Math.PI) / 180)));
  const buckets = new Map();
  const key = (i, j) => `${i}:${j}`;
  const coords = points.map((p) => [Math.floor(p.lat / dLat), Math.floor(p.lng / dLng)]);
  coords.forEach(([i, j], idx) => {
    const k = key(i, j);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(idx);
  });

  const neighbours = (idx) => {
    const [ci, cj] = coords[idx];
    const out = [];
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        const bucket = buckets.get(key(ci + di, cj + dj));
        if (!bucket) continue;
        for (const other of bucket) {
          if (haversineMeters(points[idx].lat, points[idx].lng, points[other].lat, points[other].lng) <= epsMeters) {
            out.push(other);
          }
        }
      }
    }
    return out; // includes idx itself
  };

  let cluster = 0;
  for (let i = 0; i < n; i += 1) {
    if (labels[i] !== -2) continue;
    const seeds = neighbours(i);
    if (seeds.length < minSamples) {
      labels[i] = -1;
      continue;
    }
    labels[i] = cluster;
    const queue = seeds.filter((s) => s !== i);
    while (queue.length) {
      const q = queue.pop();
      if (labels[q] === -1) labels[q] = cluster; // border point previously marked noise
      if (labels[q] !== -2) continue;
      labels[q] = cluster;
      const qn = neighbours(q);
      if (qn.length >= minSamples) queue.push(...qn);
    }
    cluster += 1;
  }
  return labels;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

/**
 * Turns clustered incidents into a 0..100 crime score for every grid cell.
 *   own(cell)    = sum over incidents in the cell of weight x (clustered ? 1 : noiseFactor)
 *   spread(cell) = own(cell) + sum over ring k (1..maxRing) of own(neighbour) x decayPerRing^k
 *   score        = 100 x min(1, ln(1+spread) / ln(1+p95))     (0 where spread is 0)
 * @param {Array} incidents      from normalizeRows
 * @param {Int32Array} labels    from dbscan (same order)
 * @param {string[]} gridCells   H3 indexes of the cells to score (scores are produced for all of them)
 */
function scoreCells(incidents, labels, gridCells, { cfg = crimeCfg } = {}) {
  const grid = new Set(gridCells);
  const own = new Map();
  incidents.forEach((inc, i) => {
    const cell = h3.latLngToCell(inc.lat, inc.lng, H3_RES);
    const factor = labels[i] >= 0 ? 1 : cfg.dbscan.noiseFactor;
    own.set(cell, (own.get(cell) || 0) + inc.weight * factor);
  });

  const spread = new Map();
  for (const [cell, value] of own) {
    const rings = h3.gridDiskDistances(cell, cfg.spread.maxRing);
    rings.forEach((ringCells, k) => {
      const factor = Math.pow(cfg.spread.decayPerRing, k);
      for (const c of ringCells) {
        if (!grid.has(c)) continue;
        spread.set(c, (spread.get(c) || 0) + value * factor);
      }
    });
  }

  const positives = [...spread.values()].sort((a, b) => a - b);
  const pRef = percentile(positives, cfg.normalization.percentile);
  const denom = Math.log1p(pRef);

  const scores = {};
  for (const cell of gridCells) {
    const raw = spread.get(cell) || 0;
    scores[cell] = raw > 0 && denom > 0 ? Math.round(100 * Math.min(1, Math.log1p(raw) / denom) * 10) / 10 : 0;
  }

  const clusterIds = new Set([...labels].filter((l) => l >= 0));
  return {
    scores,
    stats: {
      incidents: incidents.length,
      clusters: clusterIds.size,
      noisePoints: [...labels].filter((l) => l < 0).length,
      cellsWithCrime: positives.length,
      referenceRaw: Math.round(pRef * 100) / 100,
    },
  };
}

/** Whole pipeline on CSV text. */
function runPipeline(csvText, gridCells, { now = new Date(), cfg = crimeCfg } = {}) {
  const rows = parseCsv(csvText);
  const { incidents, dropped, unknownTypes } = normalizeRows(rows, { now, cfg });
  const labels = dbscan(incidents, cfg.dbscan.epsMeters, cfg.dbscan.minSamples);
  const { scores, stats } = scoreCells(incidents, labels, gridCells, { cfg });
  return {
    scores,
    stats: { ...stats, rowsRead: rows.length, dropped, unknownTypes },
    lowConfidence: incidents.length < cfg.minIncidentsForConfidence,
    region: region.name,
  };
}

module.exports = { parseCsv, normalizeRows, dbscan, scoreCells, runPipeline, percentile };
