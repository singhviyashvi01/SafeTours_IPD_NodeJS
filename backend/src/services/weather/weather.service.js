const axios = require('axios');

/**
 * Purpose of this file:
 * Centralize all communication with the OpenWeather Current Weather API.
 * This keeps the backend route/controller layer focused on request handling
 * while the service layer is responsible for external HTTP calls.
 */

/**
 * Purpose of this function:
 * Fetch the current weather for a given latitude and longitude from OpenWeather.
 * Why it is needed:
 * The controller should not perform HTTP requests directly; this service isolates
 * the external API integration and formats the response into a small, clean object.
 * Input:
 * lat (string|number) and lon (string|number) from the request query.
 * Output:
 * A cleaned weather payload object with only the requested fields.
 */
const getCurrentWeather = async (lat, lon) => {
  // Parse the incoming coordinates so both strings and numbers are accepted safely.
  const latitude = Number(lat);
  const longitude = Number(lon);

  // Validate the numeric range early so invalid input never reaches the API.
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

  // Read the API key from the environment so it is never hardcoded in the source.
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    const error = new Error('OpenWeather API key is not configured.');
    error.statusCode = 500;
    throw error;
  }

  try {
    // Purpose of this API call:
    // Request the current weather from OpenWeather for the supplied coordinates.
    const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: {
        lat: latitude,
        lon: longitude,
        appid: apiKey,
        units: 'metric',
      },
      timeout: 10000,
    });

    const weatherData = response?.data || {};
    const rainfall = weatherData.rain?.['1h'] ?? weatherData.rain?.['3h'] ?? null;
    const cloudiness = weatherData.clouds?.all ?? null;

    // Purpose of this response formatting:
    // Return only the fields required by the backend contract and avoid exposing
    // unrelated OpenWeather payload content while also carrying the extra values
    // needed by the environmental flood-risk module.
    return {
      temperature: weatherData.main?.temp ?? null,
      feelsLike: weatherData.main?.feels_like ?? null,
      humidity: weatherData.main?.humidity ?? null,
      windSpeed: weatherData.wind?.speed ?? null,
      visibility: weatherData.visibility ?? null,
      weather: weatherData.weather?.[0]?.main ?? null,
      weatherDescription: weatherData.weather?.[0]?.description ?? null,
      rainfall,
      cloudiness,
    };
  } catch (error) {
    // Purpose of this error handling:
    // Convert OpenWeather failures into meaningful HTTP-friendly errors.
    if (error.response?.status === 401) {
      const openWeatherError = new Error('OpenWeather API key is invalid or unauthorized.');
      openWeatherError.statusCode = 401;
      throw openWeatherError;
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      const timeoutError = new Error('OpenWeather request timed out.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    if (error.response?.status >= 500) {
      const serverError = new Error('OpenWeather server failed to respond.');
      serverError.statusCode = 502;
      throw serverError;
    }

    if (error.response?.status === 400) {
      const badRequestError = new Error('OpenWeather could not process the supplied coordinates.');
      badRequestError.statusCode = 400;
      throw badRequestError;
    }

    const fallbackError = new Error(error.message || 'Unable to fetch weather data.');
    fallbackError.statusCode = error.response?.status || 500;
    throw fallbackError;
  }
};

module.exports = {
  getCurrentWeather,
};
