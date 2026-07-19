const axios = require('axios');

/**
 * Purpose of this file:
 * Centralize all communication with the Geoapify Places API.
 * This keeps the backend route/controller layer focused on request handling
 * while the service layer is responsible for external HTTP calls and parsing.
 */

/**
 * Helper function to calculate the straight-line distance (in meters) between
 * two geographic coordinates using the Haversine formula.
 *
 * Input:
 * lat1, lon1 (number) - Start coordinates
 * lat2, lon2 (number) - End coordinates
 * Output:
 * distance (number) - Distance in meters rounded to the nearest integer
 */
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
};

/**
 * Purpose of this function:
 * Fetch nearby places for a given latitude and longitude within a specified radius from Geoapify.
 * Why it is needed:
 * The service isolates the external Geoapify Places API integration, formats the response,
 * and extracts normalized place structures for scoring.
 * Input:
 * lat (number), lng (number), radius (number, optional)
 * Output:
 * A list of normalized place objects containing name, coordinates, categories, and distance.
 */
const fetchNearbyPlaces = async (lat, lng, radius = 1000) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  const searchRadius = Number(radius);

  // Validate coordinates and radius range early
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const error = new Error('Latitude and longitude must be valid numbers.');
    error.statusCode = 400;
    throw error;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    const error = new Error('Latitude must be between -90 and 90, and longitude must be between -180 and 180.');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(searchRadius) || searchRadius <= 0) {
    const error = new Error('Radius must be a positive number.');
    error.statusCode = 400;
    throw error;
  }

  // Retrieve the Geoapify API key from environment variables
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    const error = new Error('Geoapify API key is not configured.');
    error.statusCode = 500;
    throw error;
  }

  // List of categories to search for nearby (aligned with weights)
  const categoriesList = [
    'airport',
    'public_transport.train',
    'public_transport.subway',
    'public_transport.bus',
    'commercial.shopping_mall',
    'commercial.marketplace',
    'sport.stadium',
    'tourism.attraction',
    'beach',
    'catering.restaurant',
    'catering.cafe',
    'entertainment.cinema',
    'leisure.park',
    'entertainment.museum',
    'education.university',
    'healthcare.hospital',
    'religion.place_of_worship.hinduism',
    'religion.place_of_worship.christianity',
    'religion.place_of_worship.islam'
  ].join(',');

  try {
    // Geoapify Places API v2 uses longitude first for circle: circle:lon,lat,radius
    // We also apply a proximity bias to sort places by closest distance.
    const response = await axios.get('https://api.geoapify.com/v2/places', {
      params: {
        categories: categoriesList,
        filter: `circle:${longitude},${latitude},${searchRadius}`,
        bias: `proximity:${longitude},${latitude}`,
        limit: 100,
        apiKey: apiKey
      },
      timeout: 10000
    });

    const features = response?.data?.features || [];

    // Normalize each place returned by Geoapify
    return features.map((feature) => {
      const props = feature.properties || {};
      const geom = feature.geometry || {};
      const coords = geom.coordinates || [];
      const placeLat = props.lat ?? coords[1] ?? null;
      const placeLon = props.lon ?? coords[0] ?? null;

      // Distance calculation (fallback to Haversine if API doesn't return distance)
      const distance = props.distance !== undefined
        ? Math.round(props.distance)
        : (placeLat !== null && placeLon !== null)
          ? calculateHaversineDistance(latitude, longitude, placeLat, placeLon)
          : null;

      return {
        name: props.name || props.formatted || 'Unnamed Place',
        categories: props.categories || [],
        lat: placeLat,
        lon: placeLon,
        distance
      };
    });

  } catch (error) {
    // Convert Geoapify failures into meaningful HTTP-friendly errors
    if (error.response?.status === 401) {
      const authError = new Error('Geoapify API key is invalid or unauthorized.');
      authError.statusCode = 401;
      throw authError;
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      const timeoutError = new Error('Geoapify API request timed out.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    if (error.response?.status >= 500) {
      const serverError = new Error('Geoapify server failed to respond.');
      serverError.statusCode = 502;
      throw serverError;
    }

    const fallbackError = new Error(error.message || 'Unable to fetch nearby places.');
    fallbackError.statusCode = error.response?.status || 500;
    throw fallbackError;
  }
};

module.exports = {
  fetchNearbyPlaces,
};
