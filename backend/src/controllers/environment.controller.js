const weatherService = require('../services/weather/weather.service');
const { getLatestNews } = require('../services/news/news.service');
const { buildNewsRisk } = require('../services/news/newsRisk.service');
const { buildWeatherRisk, buildFloodRisk } = require('../services/weather/floodRisk.service');
const { buildEnvironmentalScore } = require('../utils/environmentalScore');
const ApiError = require('../utils/apiError');

/**
 * Purpose of this controller:
 * Validate incoming requests for the environmental module and return front-end ready
 * JSON payloads for news, flood risk, and full environmental scoring.
 *
 * Why this exists:
 * The route layer stays lightweight while the controller remains the single place where
 * request validation and response shaping happen for this module.
 */
const validateCoordinates = ({ lat, lng }) => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude)) {
    throw new ApiError(400, 'Latitude must be a valid number.');
  }

  if (!Number.isFinite(longitude)) {
    throw new ApiError(400, 'Longitude must be a valid number.');
  }

  if (latitude < -90 || latitude > 90) {
    throw new ApiError(400, 'Latitude must be between -90 and 90.');
  }

  if (longitude < -180 || longitude > 180) {
    throw new ApiError(400, 'Longitude must be between -180 and 180.');
  }

  return { latitude, longitude };
};

const getEnvironmentNews = async (req, res, next) => {
  try {
    const location = String(req.query.location || req.query.loc || 'Mumbai').trim();
    if (!location) {
      throw new ApiError(400, 'Location is required.');
    }

    const articles = await getLatestNews(location);
    const newsRisk = buildNewsRisk({ articles, location });

    return res.status(200).json({
      success: true,
      message: 'Latest environmental news retrieved successfully.',
      data: {
        location,
        articles,
        newsRisk,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getFloodRisk = async (req, res, next) => {
  try {
    const { lat, lng } = req.query;
    if (lat === undefined || lat === '') throw new ApiError(400, 'Latitude is required.');
    if (lng === undefined || lng === '') throw new ApiError(400, 'Longitude is required.');

    const { latitude, longitude } = validateCoordinates({ lat, lng });
    const weatherData = await weatherService.getCurrentWeather(latitude, longitude);
    const weatherRisk = buildWeatherRisk(weatherData);
    const floodRisk = buildFloodRisk(weatherData);

    return res.status(200).json({
      success: true,
      message: 'Flood risk retrieved successfully.',
      data: {
        weather: weatherData,
        weatherRisk,
        floodRisk,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getEnvironmentalScore = async (req, res, next) => {
  try {
    const { lat, lng, location } = req.query;
    if (lat === undefined || lat === '') throw new ApiError(400, 'Latitude is required.');
    if (lng === undefined || lng === '') throw new ApiError(400, 'Longitude is required.');
    if (location === undefined || location === '') throw new ApiError(400, 'Location is required.');

    const { latitude, longitude } = validateCoordinates({ lat, lng });
    const locationName = String(location).trim();
    const weatherData = await weatherService.getCurrentWeather(latitude, longitude);
    const weatherRisk = buildWeatherRisk(weatherData);
    const floodRisk = buildFloodRisk(weatherData);
    const articles = await getLatestNews(locationName);
    const newsRisk = buildNewsRisk({ articles, location: locationName });
    const score = buildEnvironmentalScore({ weatherRisk, floodRisk, newsRisk });

    return res.status(200).json({
      success: true,
      message: 'Environmental risk score retrieved successfully.',
      data: {
        location: locationName,
        weather: weatherData,
        weatherRisk,
        floodRisk,
        newsRisk,
        environmentalScore: score,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEnvironmentNews,
  getFloodRisk,
  getEnvironmentalScore,
};
