const cfg = require('../../config/nearby.config');
const core = require('./nearbyCore');
const providers = require('./providers');
const logger = require('../../utils/logger');

/**
 * Nearby emergency services.
 *
 * Flow for one request
 *   1. cells = H3 res-8 cells covering the search circle
 *   2. load their cache; entries younger than 24 h are fresh, the others are "missing"
 *   3. fetch ONE bounding box covering only the missing cells: Geoapify first, then Overpass. A provider
 *      that is unavailable (no key), times out or errors is skipped. Results are stored per cell
 *      (an empty cell is a valid cache entry).
 *   4. if every provider failed: stale cache (up to 30 days, flagged stale), then SEED data (flagged
 *      source "seed"), and only then nothing.
 *   5. merge, filter by radius and types, sort by distance.
 * Fake places are never returned; with no data at all the result is an empty list with status "unavailable".
 *
 * Dependencies are injectable so the fallback order and the cache merge are unit-tested without a database.
 */

const ALL_TYPES = Object.keys(cfg.types);

function defaultDeps() {
  // required lazily so tests that inject their own deps never load Mongoose models
  const NearbyCellCache = require('../../models/NearbyCellCache');
  const NearbyPlace = require('../../models/NearbyPlace');
  return {
    providers: [providers.geoapify, providers.overpass],
    cache: {
      async load(cells) {
        const docs = await NearbyCellCache.find({ cell: { $in: cells } }).lean();
        return new Map(docs.map((d) => [d.cell, d]));
      },
      async save(entries) {
        if (!entries.length) return;
        await NearbyCellCache.bulkWrite(
          entries.map((e) => ({ updateOne: { filter: { cell: e.cell }, update: { $set: e }, upsert: true } })),
          { ordered: false }
        );
      },
    },
    seed: {
      async find(cells) {
        const rows = await NearbyPlace.find({ h3Index: { $in: cells } }).lean();
        return rows.map((r) => ({ id: `seed:${r.type}:${r.lat.toFixed(5)}:${r.lng.toFixed(5)}`, type: r.type, name: r.name, lat: r.lat, lng: r.lng, phone: null, address: null, openingHours: null, h3Index: r.h3Index }));
      },
    },
  };
}

const inflight = new Map(); // identical concurrent cold fetches share one provider call

async function fetchMissing(missing, center, deps, attempts) {
  const bbox = core.bboxOfCells(missing);
  for (const provider of deps.providers) {
    if (!provider.available()) {
      attempts.push({ provider: provider.name, outcome: 'skipped: not available (no key)' });
      continue;
    }
    try {
      const result = await provider.fetch({ bbox, center });
      attempts.push({ provider: provider.name, outcome: 'ok', places: result.places.length, credits: result.credits });
      return { provider: provider.name, ...result };
    } catch (error) {
      logger.warn(`[nearby] ${provider.name} failed: ${error.message}`);
      attempts.push({ provider: provider.name, outcome: `failed: ${error.message}` });
    }
  }
  return null;
}

/**
 * @param {{lat:number,lng:number,radius?:number,types?:string[],limit?:number,now?:Date}} params
 * @param {Object} [deps] injected for tests
 */
async function getNearby(params, deps = defaultDeps()) {
  const now = params.now || new Date();
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const radius = Math.min(Math.max(Number(params.radius) || cfg.radius.default, cfg.radius.min), cfg.radius.max);
  const types = params.types && params.types.length ? params.types : ALL_TYPES;
  const limit = Math.min(Number(params.limit) || cfg.limit.default, cfg.limit.max);

  const cells = core.cellsForRadius(lat, lng, radius);
  const cached = await deps.cache.load(cells);
  const ageOf = (doc) => now.getTime() - new Date(doc.fetchedAt).getTime();

  const fresh = new Map(); // cell -> { places, source, fetchedAt }
  const missing = [];
  for (const cell of cells) {
    const doc = cached.get(cell);
    if (doc && ageOf(doc) < cfg.ttlMs) fresh.set(cell, doc);
    else missing.push(cell);
  }

  const attempts = [];
  const live = new Map(); // cells completed by a provider call in this request
  let providersFailed = false;

  if (missing.length) {
    const key = `${missing.slice().sort().join(',')}`;
    if (!inflight.has(key)) {
      const p = fetchMissing(missing, { lat, lng }, deps, attempts).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    const result = await inflight.get(key);

    if (result) {
      const complete = core.completeCells(missing, { lat, lng }, result.coverageRadiusMeters);
      const grouped = core.groupByCell(result.places, complete);
      const entries = complete.map((cell) => ({ cell, source: result.provider, fetchedAt: now, places: grouped.get(cell) }));
      await deps.cache.save(entries).catch((e) => logger.error('[nearby] cache save failed', e));
      for (const e of entries) live.set(e.cell, e);
    } else {
      providersFailed = true;
    }
  }

  // Cells still without data: stale cache first, then seed (only when providers failed), else unresolved.
  const stale = new Map();
  const unresolved = [];
  for (const cell of missing) {
    if (live.has(cell)) continue;
    const doc = cached.get(cell);
    if (doc && ageOf(doc) <= cfg.staleMaxMs) stale.set(cell, doc);
    else unresolved.push(cell);
  }

  let seedPlaces = [];
  if (providersFailed && unresolved.length) {
    try {
      seedPlaces = await deps.seed.find(unresolved);
    } catch (e) {
      logger.error('[nearby] seed lookup failed', e);
    }
  }
  const seedCells = new Set(seedPlaces.map((p) => p.h3Index));

  // Assemble.
  const items = [];
  const addDoc = (doc, source) => {
    for (const p of doc.places) items.push({ place: p, source, fetchedAt: doc.fetchedAt });
  };
  for (const doc of fresh.values()) addDoc(doc, doc.source);
  for (const doc of live.values()) addDoc(doc, doc.source);
  for (const doc of stale.values()) addDoc(doc, doc.source);
  for (const p of seedPlaces) items.push({ place: p, source: 'seed', fetchedAt: null });

  const rows = core.shapePlaces(items, { lat, lng, radius, types, limit, now });

  const sources = new Set(rows.map((r) => r.source));
  const used = [...fresh.values(), ...live.values(), ...stale.values()];
  const cachedAt = used.length ? new Date(Math.min(...used.map((d) => new Date(d.fetchedAt).getTime()))).toISOString() : null;
  const resolvedCells = fresh.size + live.size + stale.size + seedCells.size;
  const usingStale = stale.size > 0;
  const usingSeed = seedCells.size > 0;

  let status;
  if (resolvedCells === 0) status = 'unavailable';
  else if (!usingStale && !usingSeed && resolvedCells === cells.length) status = 'ok';
  else if (used.length === 0 && usingSeed) status = 'seed';
  else status = 'partial';

  return {
    status,
    stale: usingStale || usingSeed,
    source: sources.size === 0 ? (used.length ? [...new Set(used.map((d) => d.source))].join('+') : null) : sources.size === 1 ? [...sources][0] : 'mixed',
    cachedAt,
    count: rows.length,
    radius,
    center: { lat, lng },
    types,
    cells: { total: cells.length, cached: fresh.size, fetched: live.size, stale: stale.size, seed: seedCells.size, unavailable: cells.length - resolvedCells },
    attempts, // which providers were tried and how they ended (useful in the admin/debug view)
    data: rows,
  };
}

/**
 * Compact summary for the AI assistant (Task 4): the nearest place of each type plus a short list.
 * Never throws: on failure it reports status "unavailable" with no places.
 */
async function getNearbyForContext(lat, lng, { radius = cfg.radius.default, types, perType = 1, deps } = {}) {
  try {
    const r = await getNearby({ lat, lng, radius, types, limit: 100 }, deps);
    const nearest = {};
    for (const row of r.data) {
      nearest[row.type] = nearest[row.type] || [];
      if (nearest[row.type].length < perType) {
        nearest[row.type].push({ name: row.name, distance: row.distance, phone: row.phone, openNow: row.openNow, address: row.address });
      }
    }
    return { status: r.status, stale: r.stale, source: r.source, cachedAt: r.cachedAt, radius: r.radius, nearest };
  } catch (error) {
    logger.error('[nearby] getNearbyForContext failed', error);
    return { status: 'unavailable', stale: true, source: null, cachedAt: null, radius, nearest: {} };
  }
}

module.exports = { getNearby, getNearbyForContext, ALL_TYPES };
