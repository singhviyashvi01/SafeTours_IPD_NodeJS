const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Geocodes a text location name into latitude and longitude coordinates
 * using the Geoapify Search Geocoding API.
 *
 * @param {string} locationName - The name of the neighborhood/location (e.g. "Sion")
 * @returns {Promise<{latitude: number, longitude: number}|null>} Geocoded coordinates, or null if failed/not found.
 */
async function geocodeLocation(locationName) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    logger.error('[geocodingService] GEOAPIFY_API_KEY is not configured in environment variables.');
    return null;
  }

  try {
    // Append city and country to ensure search results are localized to Mumbai
    const queryText = `${locationName}, Mumbai, India`;

    const response = await axios.get('https://api.geoapify.com/v1/geocode/search', {
      params: {
        text: queryText,
        apiKey: apiKey,
        limit: 1,
      },
      timeout: 10000, // 10 second timeout
    });

    const features = response?.data?.features || [];
    if (features.length === 0) {
      logger.warn(`[geocodingService] No coordinates found for location: "${locationName}"`);
      return null;
    }

    // Geoapify geometry coordinates format: [longitude, latitude]
    const coords = features[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      logger.warn(`[geocodingService] Malformed geometry features for: "${locationName}"`);
      return null;
    }

    const longitude = Number(coords[0]);
    const latitude = Number(coords[1]);

    logger.info(`[geocodingService] Geocoded "${locationName}" to coordinates: [${latitude}, ${longitude}]`);
    return { latitude, longitude };
  } catch (error) {
    logger.error(`[geocodingService] Geocoding API call failed for "${locationName}": ${error.message}`);
    return null;
  }
}

module.exports = {
  geocodeLocation,
};
