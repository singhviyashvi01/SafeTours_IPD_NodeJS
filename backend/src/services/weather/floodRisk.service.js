const { getCurrentWeather } = require('./weather.service');

/**
 * Purpose of this service:
 * Derive weather risk and flood risk from the weather payload returned by the shared
 * weather integration.
 *
 * Why this exists:
 * The environmental module needs an intermediate signal for weather conditions and
 * flood-like conditions without interfering with the existing weather endpoint.
 */
const buildWeatherRisk = (weatherData = {}) => {
  const weatherCondition = String(weatherData.weather || '').toLowerCase();
  const humidity = Number(weatherData.humidity || 0);
  const visibility = Number(weatherData.visibility || 0);
  const windSpeed = Number(weatherData.windSpeed || 0);
  const cloudiness = Number(weatherData.cloudiness || 0);
  const rainfall = Number(weatherData.rainfall || 0);

  let score = 0;
  const reasons = [];

  if (weatherCondition.includes('rain') || weatherCondition.includes('storm') || weatherCondition.includes('drizzle')) {
    score += 25;
    reasons.push('Heavy rain or storm-like weather detected.');
  }

  if (humidity >= 85) {
    score += 20; 
    reasons.push('Humidity is very high.');
  }

  if (visibility > 0 && visibility < 5000) {
    score += 15;
    reasons.push('Visibility is reduced.');
  }

  if (windSpeed >= 12) {
    score += 10;
    reasons.push('Wind speed is elevated.');
  }

  if (cloudiness >= 80) {
    score += 10;
    reasons.push('Cloud cover is very high.');
  }

  if (rainfall > 0) {
    score += 10;
    reasons.push('Rainfall is present.');
  }

  score = Math.min(100, score);
  let level = 'LOW';
  if (score >= 70) level = 'HIGH';
  else if (score >= 35) level = 'MEDIUM';

  return {
    score,
    level,
    reason: reasons.length > 0 ? reasons.join(' ') : 'Weather conditions appear stable.',
    contributingFactors: reasons,
  };
};

const buildFloodRisk = (weatherData = {}) => {
  const rainfall = Number(weatherData.rainfall || 0);
  const humidity = Number(weatherData.humidity || 0);
  const visibility = Number(weatherData.visibility || 0);
  const windSpeed = Number(weatherData.windSpeed || 0);
  const cloudiness = Number(weatherData.cloudiness || 0);
  const weatherCondition = String(weatherData.weather || '').toLowerCase();

  let score = 0;
  const reasons = [];

  if (rainfall >= 5) {
    score += 35;
    reasons.push('Rainfall is high.');
  }

  if (humidity >= 80) {
    score += 20;
    reasons.push('Humidity is high.');
  }

  if (visibility > 0 && visibility < 4000) {
    score += 15;
    reasons.push('Visibility is low.');
  }

  if (windSpeed >= 10) {
    score += 10;
    reasons.push('Wind speed is elevated.');
  }

  if (cloudiness >= 75) {
    score += 10;
    reasons.push('Cloud cover is dense.');
  }

  if (weatherCondition.includes('rain') || weatherCondition.includes('storm')) {
    score += 10;
    reasons.push('Weather condition suggests rain-driven flooding risk.');
  }

  score = Math.min(100, score);
  let level = 'LOW';
  if (score >= 70) level = 'HIGH';
  else if (score >= 35) level = 'MEDIUM';

  return {
    score,
    level,
    reason: reasons.length > 0 ? reasons.join(' ') : 'No immediate flood indicators detected.',
    contributingFactors: reasons,
  };
};

const getFloodRisk = async ({ latitude, longitude }) => {
  const weatherData = await getCurrentWeather(latitude, longitude);
  const weatherRisk = buildWeatherRisk(weatherData);
  const floodRisk = buildFloodRisk(weatherData);
  return {
    weatherRisk,
    floodRisk,
    weather: weatherData,
  };
};

module.exports = {
  buildWeatherRisk,
  buildFloodRisk,
  getFloodRisk,
};
