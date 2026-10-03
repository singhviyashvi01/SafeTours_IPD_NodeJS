const GridCell = require('../models/GridCell');
const PoiCache = require('../models/PoiCache');
const crowdCfg = require('../config/crowd.config');
const { fetchPlacesForCategory } = require('../services/crowd/geoapify.service');
const { buildPotentials, crowdScore } = require('../services/crowd/crowdModel');
const { setComponentScores } = require('../services/risk/cellRisk.service');
const feedStatus = require('../services/risk/feedStatus.service');
const logger = require('../utils/logger');

/**
 * Crowd producer.
 *  refreshPois(): at most once a day per category, fetch crowd-magnet places from Geoapify and cache
 *                 them (PoiCache). A failed or timed-out category keeps its previous cache.
 *  recomputeCrowd(): every hour, rebuild each cell's crowd score from the cached places using the IST
 *                 time profile, weekday/weekend and festival rules. No API call.
 *
 * Failure behaviour: with no key / no connectivity the last cached places keep being used, and once
 * they are older than places.maxAgeMs the component is stamped with the places' age so the risk
 * engine flags it stale and eventually drops it. With no cache at all nothing is written (the crowd
 * component stays "missing"); a score of 0 is never used as a placeholder.
 */

async function refreshPois() {
  if (!process.env.GEOAPIFY_API_KEY) {
    logger.warn('[crowdScheduler] GEOAPIFY_API_KEY is not set: places are not refreshed.');
    return { skipped: 'no-key' };
  }

  const existing = new Map((await PoiCache.find({}).select('category fetchedAt').lean()).map((d) => [d.category, d]));
  let refreshed = 0;
  let failed = 0;

  for (const cat of crowdCfg.categories) {
    const cached = existing.get(cat.key);
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < crowdCfg.places.refreshMs) continue;
    try {
      const places = await fetchPlacesForCategory(cat);
      await PoiCache.updateOne(
        { category: cat.key },
        { $set: { places, count: places.length, fetchedAt: new Date() } },
        { upsert: true }
      );
      refreshed += 1;
    } catch (err) {
      failed += 1;
      logger.warn(`[crowdScheduler] places for ${cat.key} not refreshed: ${err.message}`);
    }
  }
  return { refreshed, failed };
}

async function recomputeCrowd() {
  try {
    const caches = await PoiCache.find({}).lean();
    if (caches.length === 0) {
      throw new Error('No crowd places cached yet (GEOAPIFY_API_KEY missing or Geoapify unreachable)');
    }

    const places = [];
    for (const c of caches) for (const p of c.places) places.push({ ...p, key: c.category });
    const potentials = buildPotentials(places);

    const cells = await GridCell.find({}).select('h3Index').lean();
    const now = new Date();
    const scores = {};
    for (const { h3Index } of cells) {
      const pot = potentials.get(h3Index);
      scores[h3Index] = pot ? crowdScore(pot.byProfile, { now }).score : 0;
    }

    const oldestFetch = Math.min(...caches.map((c) => new Date(c.fetchedAt).getTime()));
    const coverage = caches.length / crowdCfg.categories.length;
    const stalePlaces = Date.now() - oldestFetch > crowdCfg.places.maxAgeMs;
    const lowConfidence = coverage < crowdCfg.places.minCategoryCoverage;
    const stampedAt = stalePlaces ? new Date(oldestFetch) : now;

    const baseMeta = {
      source: 'geoapify',
      lowConfidence,
      categoryCoverage: Math.round(coverage * 100) / 100,
      placesFetchedAt: new Date(oldestFetch).toISOString(),
      placesStale: stalePlaces,
    };
    const { modified } = await setComponentScores('crowd', scores, {
      now: stampedAt,
      meta: (h3Index) => {
        const pot = potentials.get(h3Index);
        return pot && pot.poiCount > 0 ? { ...baseMeta, poiCount: pot.poiCount, topPlaces: pot.topPlaces } : baseMeta;
      },
    });

    await feedStatus.markSuccess('crowd', {
      places: places.length,
      categories: caches.length,
      cellsWithPotential: potentials.size,
      placesStale: stalePlaces,
    });
    logger.info(`[crowdScheduler] ${places.length} places, ${potentials.size} cells with potential, ${modified} cells written${stalePlaces ? ' (places STALE)' : ''}.`);
  } catch (error) {
    await feedStatus.markFailure('crowd', error);
  }
}

async function tick() {
  try {
    await refreshPois();
  } catch (err) {
    logger.error('[crowdScheduler] places refresh crashed', err);
  }
  await recomputeCrowd();
}

function startCrowdScheduler(intervalMs = Number(process.env.CROWD_REFRESH_MS) || crowdCfg.recomputeIntervalMs) {
  logger.info(`[crowdScheduler] Starting (recompute every ${intervalMs / 1000}s, places refreshed daily)...`);
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = { refreshPois, recomputeCrowd, startCrowdScheduler };
