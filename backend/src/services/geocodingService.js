const axios = require('axios');
const GeocodeCache = require('../models/GeocodeCache');
const newsCfg = require('../config/news.config');
const { region, inRegion } = require('../config/region.config');
const logger = require('../utils/logger');

const FOUND_TTL_MS = 90 * 24 * 3600 * 1000;
const NOT_FOUND_TTL_MS = 7 * 24 * 3600 * 1000;
let warnedNoKey = false;

/**
 * Geocodes a Mumbai place name with Geoapify, with a persistent cache.
 *  - the search is restricted to the covered area; a result outside it, or below the confidence
 *    threshold, is treated as "not found"
 *  - found and not-found results are cached (90 / 7 days); network errors and a missing key are NOT
 *    cached, so the lookup is retried later
 * @returns {Promise<{latitude:number, longitude:number, confidence:number}|null>}
 */
async function geocodePlace(name) {
  const query = String(name || '').trim().toLowerCase();
  if (!query) return null;

  const cached = await GeocodeCache.findOne({ query }).lean();
  if (cached) {
    const ttl = cached.found ? FOUND_TTL_MS : NOT_FOUND_TTL_MS;
    if (Date.now() - new Date(cached.fetchedAt).getTime() < ttl) {
      return cached.found ? { latitude: cached.lat, longitude: cached.lng, confidence: cached.confidence } : null;
    }
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    if (!warnedNoKey) {
      logger.warn('[geocoding] GEOAPIFY_API_KEY is not set: places outside the gazetteer cannot be located.');
      warnedNoKey = true;
    }
    return null;
  }

  try {
    const response = await axios.get('https://api.geoapify.com/v1/geocode/search', {
      params: {
        text: `${name}, ${region.name}, India`,
        filter: `rect:${region.minLng},${region.minLat},${region.maxLng},${region.maxLat}`,
        bias: `proximity:${(region.minLng + region.maxLng) / 2},${(region.minLat + region.maxLat) / 2}`,
        limit: 1,
        apiKey,
      },
      timeout: 8000,
    });

    const feature = response?.data?.features?.[0];
    const lat = feature?.properties?.lat ?? feature?.geometry?.coordinates?.[1];
    const lng = feature?.properties?.lon ?? feature?.geometry?.coordinates?.[0];
    const confidence = feature?.properties?.rank?.confidence ?? null;
    const ok = Number.isFinite(lat) && Number.isFinite(lng) && inRegion(lat, lng) &&
      (confidence === null || confidence >= newsCfg.geocode.minConfidence);

    await GeocodeCache.updateOne(
      { query },
      { $set: { found: ok, lat: ok ? lat : null, lng: ok ? lng : null, confidence, fetchedAt: new Date() } },
      { upsert: true }
    );
    return ok ? { latitude: lat, longitude: lng, confidence } : null;
  } catch (error) {
    logger.warn(`[geocoding] lookup of "${name}" failed: ${error.message}`);
    return null;
  }
}

module.exports = { geocodePlace };
