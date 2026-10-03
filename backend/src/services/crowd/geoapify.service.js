const axios = require('axios');
const crowdCfg = require('../../config/crowd.config');
const { region } = require('../../config/region.config');

/**
 * Geoapify Places client for the crowd producer. One request series per category over the whole
 * covered area (rect filter), paginated; results are cached in the PoiCache collection by the
 * scheduler, so the API is hit about once a day, never per user request.
 */
async function fetchPlacesForCategory(category) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    const error = new Error('GEOAPIFY_API_KEY is not set');
    error.code = 'NO_KEY';
    throw error;
  }

  const { perPage, maxPages, requestTimeoutMs } = crowdCfg.places;
  const rect = `rect:${region.minLng},${region.minLat},${region.maxLng},${region.maxLat}`;
  const out = [];

  for (let page = 0; page < maxPages; page += 1) {
    const response = await axios.get('https://api.geoapify.com/v2/places', {
      params: { categories: category.geoapify, filter: rect, limit: perPage, offset: page * perPage, apiKey },
      timeout: requestTimeoutMs,
    });
    const features = response?.data?.features || [];
    for (const f of features) {
      const props = f.properties || {};
      const coords = f.geometry?.coordinates || [];
      const lat = props.lat ?? coords[1];
      const lon = props.lon ?? coords[0];
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        out.push({ name: props.name || props.address_line1 || '', lat, lon });
      }
    }
    if (features.length < perPage) break;
  }
  return out;
}

module.exports = { fetchPlacesForCategory };
