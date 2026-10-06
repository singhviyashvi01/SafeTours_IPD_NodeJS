/**
 * nearby.config.js: tunables of GET /api/nearby (services/nearby).
 *
 * Caching: results are cached per H3 resolution-8 cell (edge ~461 m, centre-to-centre ~800 m, ~0.74 km²),
 * 24 hours. Resolution 8 was chosen over 9 (the risk-grid resolution) because places are sparse: a
 * res-9 cell is too small to hold a useful number of them and a 3 km search would need ~250 cells, while
 * res 8 needs ~50. A request covering several cells merges their cached results and fetches ONE
 * bounding box covering only the missing cells (not one request per cell).
 *
 * Every type is always fetched and cached together, whatever types the client asked for, so a later
 * request for a different type is a cache hit. The response is filtered to the requested types.
 */
module.exports = {
  resolution: 8,
  cellCenterSpacingMeters: 799, // res-8 centre-to-centre
  cellCircumradiusMeters: 470, // res-8 edge ~461 m

  ttlMs: 24 * 3600 * 1000,
  // Expired cache is still shown (flagged stale) when every provider fails, up to this age.
  staleMaxMs: 30 * 24 * 3600 * 1000,

  radius: { default: 3000, min: 100, max: 10000 },
  limit: { default: 50, max: 200 },

  /**
   * label        shown in the UI
   * geoapify     Geoapify Places category
   * osm          Overpass amenity value
   * fetchLimit   max places requested per type per Geoapify call (the call bills per 20 places returned)
   */
  types: {
    hospital: { label: 'Hospital', geoapify: 'healthcare.hospital', osm: 'hospital', fetchLimit: 150 },
    police: { label: 'Police station', geoapify: 'service.police', osm: 'police', fetchLimit: 100 },
    pharmacy: { label: 'Pharmacy', geoapify: 'healthcare.pharmacy', osm: 'pharmacy', fetchLimit: 200 },
    fire_station: { label: 'Fire station', geoapify: 'service.fire_station', osm: 'fire_station', fetchLimit: 50 },
  },

  geoapify: { url: 'https://api.geoapify.com/v2/places', timeoutMs: 10000 },

  overpass: {
    // Tried in order. Override with env OVERPASS_URLS (comma separated).
    urls: [
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
      'https://overpass-api.de/api/interpreter',
    ],
    timeoutMs: 15000,
    userAgent: 'SafeTours/1.0 (academic project; nearby emergency services)',
  },
};
