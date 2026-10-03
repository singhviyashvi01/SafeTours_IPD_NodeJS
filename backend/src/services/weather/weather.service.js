const axios = require('axios');
const wcfg = require('../../config/weather.config');

/**
 * OpenWeather current-weather client.
 *  - timeout on every call (weather.config requestTimeoutMs)
 *  - in-memory cache per ~1 km location: fresh for 10 minutes
 *  - if the API fails or the key is missing, the last cached value (up to 3 hours old) is returned
 *    with stale: true; beyond that the call fails. A made-up value is never returned.
 */

const cache = new Map(); // "lat,lon" (2 decimals) -> { at: ms, data }

const keyFor = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

function httpError(message, statusCode) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function shape(raw) {
  const rain1h = raw.rain?.['1h'];
  const rain3h = raw.rain?.['3h'];
  // OpenWeather omits `rain` when it is not raining: for a successful response that means 0 mm/h.
  const rainMmPerHour = rain1h ?? (rain3h !== undefined ? rain3h / 3 : 0);
  return {
    temperature: raw.main?.temp ?? null,
    feelsLike: raw.main?.feels_like ?? null,
    humidity: raw.main?.humidity ?? null,
    windSpeed: raw.wind?.speed ?? null,
    windGust: raw.wind?.gust ?? null,
    visibility: raw.visibility ?? null,
    weather: raw.weather?.[0]?.main ?? null,
    weatherDescription: raw.weather?.[0]?.description ?? null,
    weatherId: raw.weather?.[0]?.id ?? null,
    rainfall: rain1h ?? rain3h ?? null, // kept for existing clients
    rainMmPerHour,
    cloudiness: raw.clouds?.all ?? null,
    observedAt: raw.dt ? new Date(raw.dt * 1000).toISOString() : null,
    stale: false,
  };
}

function staleOrThrow(cached, error) {
  if (cached && Date.now() - cached.at <= wcfg.cache.maxStaleMs) {
    return { ...cached.data, stale: true, cachedAt: new Date(cached.at).toISOString() };
  }
  throw error;
}

const getCurrentWeather = async (lat, lon) => {
  const latitude = Number(lat);
  const longitude = Number(lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw httpError('Latitude and longitude must be valid numbers.', 400);
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw httpError('Latitude must be between -90 and 90, and longitude must be between -180 and 180.', 400);
  }

  const key = keyFor(latitude, longitude);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < wcfg.cache.freshMs) return cached.data;

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return staleOrThrow(cached, httpError('OpenWeather API key is not configured.', 503));

  try {
    const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: { lat: latitude, lon: longitude, appid: apiKey, units: 'metric' },
      timeout: wcfg.requestTimeoutMs,
    });
    const data = shape(response?.data || {});
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (error) {
    let mapped;
    if (error.response?.status === 401) mapped = httpError('OpenWeather API key is invalid or unauthorized.', 503);
    else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') mapped = httpError('OpenWeather request timed out.', 504);
    else if (error.response?.status >= 500) mapped = httpError('OpenWeather server failed to respond.', 502);
    else if (error.response?.status === 400) mapped = httpError('OpenWeather could not process the supplied coordinates.', 400);
    else mapped = httpError(error.message || 'Unable to fetch weather data.', error.response?.status || 502);
    return staleOrThrow(cached, mapped);
  }
};

module.exports = { getCurrentWeather };
