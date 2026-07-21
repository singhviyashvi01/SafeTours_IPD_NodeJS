const weatherService = require('../services/weather/weather.service');
const { getLatestNews } = require('../services/news/news.service');
const { buildNewsRisk } = require('../services/news/newsRisk.service');
const { buildWeatherRisk, buildFloodRisk } = require('../services/weather/floodRisk.service');
const { buildEnvironmentalScore } = require('../utils/environmentalScore');
const h3GridService = require('../services/h3GridService');
const dangerZoneService = require('../services/dangerZoneService');
const riskEngine = require('../services/riskEngine');
const ApiError = require('../utils/apiError');

/**
 * Purpose of this controller:
 * Validate incoming requests for the environmental module, calculate environmental risk scores,
 * convert coordinates to H3 index cells using Phase 1 H3 Engine, update DangerZone documents
 * in MongoDB using $set, and return front-end ready JSON payloads.
 *
 * Why this exists:
 * Keeps HTTP layer thin while orchestrating Weather, Flood, News API calls, H3 cell conversion,
 * environmental scoring, and atomic DangerZone database updates.
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

/**
 * Purpose of this function:
 * Calculate environmental risk score, convert coordinates to H3 index, and update DangerZone MongoDB document.
 *
 * What the code is doing:
 * Resolves request coordinates, converts lat/lng to H3 index using Phase 1 H3 Engine,
 * fetches weather, flood, and news risks using existing services, computes environmental score,
 * and updates ONLY weatherScore, environmentalScore, and lastWeatherUpdate inside DangerZone via $set.
 * If weather affects multiple nearby locations (affectedRadius > 0), converts affected coordinates into H3 cells.
 * Why it is required:
 * Implements Phase 4 Environmental H3 Module requirements.
 * Which existing Phase 1 or Phase 2 implementation is being reused:
 * Reuses Phase 1 H3 Engine (h3GridService.latLngToH3 / getAffectedH3Cells) and Phase 2 DangerZone model (dangerZoneService.updateEnvironmentalScore).
 */
const getEnvironmentalScore = async (req, res, next) => {
  try {
    const { lat, lng, location, affectedRadius } = req.query;
    if (lat === undefined || lat === '') throw new ApiError(400, 'Latitude is required.');
    if (lng === undefined || lng === '') throw new ApiError(400, 'Longitude is required.');

    const { latitude, longitude } = validateCoordinates({ lat, lng });
    const locationName = location ? String(location).trim() : 'Mumbai';
    const radiusInKm = affectedRadius ? Number(affectedRadius) : 0;

    // What the code is doing: Convert coordinates to H3 index and optional affected H3 cells.
    // Why it is required: Provides H3 spatial indexing for environmental risk.
    // Reuses: Phase 1 h3GridService H3 utilities.
    const h3Index = h3GridService.latLngToH3(latitude, longitude);
    const affectedH3Cells = radiusInKm > 0
      ? h3GridService.getAffectedH3Cells(latitude, longitude, radiusInKm)
      : [h3Index];

    // Reuse existing Weather, Flood, News API, and Environmental Score calculations
    const weatherData = await weatherService.getCurrentWeather(latitude, longitude);
    const weatherRisk = buildWeatherRisk(weatherData);
    const floodRisk = buildFloodRisk(weatherData);
    const articles = await getLatestNews(locationName);
    const newsRisk = buildNewsRisk({ articles, location: locationName });
    const score = buildEnvironmentalScore({ weatherRisk, floodRisk, newsRisk });

    const weatherScore = weatherRisk.score;
    const environmentalScoreVal = score.environmentalScore;

    // What the code is doing: Update ONLY weatherScore, environmentalScore, and lastWeatherUpdate inside DangerZone via $set.
    // Why it is required: Merge safety; does not modify crowd, crime, or infra scores.
    // Reuses: Phase 2 DangerZone collection & dangerZoneService
    const updatedDangerZones = await dangerZoneService.updateEnvironmentalScore(
      latitude,
      longitude,
      weatherScore,
      environmentalScoreVal,
      h3Index,
      affectedH3Cells
    );

    await riskEngine.updateGridCellScores(
      { $or: [{ h3Index: { $in: affectedH3Cells } }, { h3CellId: { $in: affectedH3Cells } }] },
      { weatherScore }
    );

    return res.status(200).json({
      success: true,
      message: 'Environmental risk score calculated and DangerZone updated successfully.',
      data: {
        h3Index,
        weatherScore,
        environmentalScore: environmentalScoreVal,
        lastWeatherUpdate: new Date(),
        location: locationName,
        weather: weatherData,
        weatherRisk,
        floodRisk,
        newsRisk,
        environmentalScoreDetails: score,
        updatedDangerZones,
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
