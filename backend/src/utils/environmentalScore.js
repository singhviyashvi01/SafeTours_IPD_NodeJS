const { defaultWeights } = require('../config/newsKeywords');

/**
 * Purpose of this utility:
 * Combine weather, flood, and news risk into a single environmental score.
 *
 * Why this exists:
 * The environmental module should expose one reusable score for later risk-engine
 * consumption without embedding weight logic in controllers or routes.
 */
const buildEnvironmentalScore = ({ weatherRisk = {}, floodRisk = {}, newsRisk = {}, weights = defaultWeights }) => {
  const weatherScore = Number(weatherRisk.score || 0);
  const floodScore = Number(floodRisk.score || 0);
  const newsScore = Number(newsRisk.score || 0);

  const effectiveWeatherWeight = Number(weights.weather || defaultWeights.weather || 0.4);
  const effectiveFloodWeight = Number(weights.flood || defaultWeights.flood || 0.2);
  const effectiveNewsWeight = Number(weights.news || defaultWeights.news || 0.4);

  const compositeScore = Math.min(
    100,
    Math.round((weatherScore * effectiveWeatherWeight) + (floodScore * effectiveFloodWeight) + (newsScore * effectiveNewsWeight))
  );

  let riskLevel = 'LOW';
  if (compositeScore >= 75) riskLevel = 'CRITICAL';
  else if (compositeScore >= 55) riskLevel = 'HIGH';
  else if (compositeScore >= 30) riskLevel = 'MEDIUM';

  const reasons = [
    weatherRisk.reason || 'Weather conditions appear stable.',
    floodRisk.reason || 'No flood indicators detected.',
    newsRisk.summary || 'No pressing incidents detected.',
  ].filter(Boolean);

  const contributingFactors = [
    ...(weatherRisk.contributingFactors || []),
    ...(floodRisk.contributingFactors || []),
    ...(newsRisk.matchedKeywords || []),
  ].filter(Boolean);

  return {
    environmentalScore: compositeScore,
    riskLevel,
    reasons,
    contributingFactors,
  };
};

module.exports = {
  buildEnvironmentalScore,
};
