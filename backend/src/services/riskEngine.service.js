const { RISK_WEIGHTS, RISK_LEVELS, RISK_THRESHOLDS } = require('../config/riskWeights.config');
const logger = require('../utils/logger');

/**
 * RiskEngineService — SafeTours IPD
 *
 * Purpose of this service:
 * Serves as the single centralized Risk Score Engine across the entire backend.
 * Calculates composite normalized risk scores (0–100) and maps them to standard
 * risk levels (SAFE, LOW, MODERATE, HIGH, EXTREME) using configurable domain weights.
 */
class RiskEngineService {
  /**
   * Helper method to map a numeric score (0-100) to a standard risk level.
   *
   * @param {number} score - Normalized risk score (0-100)
   * @returns {string} Standard risk level ('SAFE'|'LOW'|'MODERATE'|'HIGH'|'EXTREME')
   */
  getRiskLevel(score) {
    const numericScore = Number(score) || 0;
    const clampedScore = Math.min(100, Math.max(0, numericScore));

    const matched = RISK_THRESHOLDS.find(
      (threshold) => clampedScore >= threshold.min && clampedScore <= threshold.max
    );

    return matched ? matched.level : RISK_LEVELS.EXTREME;
  }

  /**
   * Clamps a score value to range [0, 100] and converts invalid inputs to 0.
   *
   * @param {any} val - Input score
   * @returns {number} Clamped number between 0 and 100
   */
  clampScore(val) {
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0) return 0;
    if (num > 100) return 100;
    return num;
  }

  /**
   * Main calculation function for the Risk Score Engine.
   * Collects all component scores, applies configurable domain weights,
   * normalizes the total to a 0–100 scale, and assigns a standardized risk level.
   *
   * @param {Object} scores
   * @param {number} [scores.crimeScore=0]     - Crime risk score (0-100)
   * @param {number} [scores.weatherScore=0]   - Weather risk score (0-100)
   * @param {number} [scores.newsScore=0]      - News risk score (0-100)
   * @param {number} [scores.crowdScore=0]     - Crowd risk score (0-100)
   * @param {number} [scores.communityScore=0] - Community incident score (0-100)
   * @param {number} [scores.ewsScore=0]       - EWS alert score (0-100)
   * @param {Object} [customWeights]          - Optional custom weights override
   * @returns {{ totalRiskScore: number, level: string, breakdown: Object }}
   */
  calculateRisk(
    {
      crimeScore = 0,
      weatherScore = 0,
      newsScore = 0,
      crowdScore = 0,
      communityScore = 0,
      ewsScore = 0,
    } = {},
    customWeights = null
  ) {
    const weights = customWeights || RISK_WEIGHTS;

    const crime = this.clampScore(crimeScore);
    const weather = this.clampScore(weatherScore);
    const news = this.clampScore(newsScore);
    const crowd = this.clampScore(crowdScore);
    const community = this.clampScore(communityScore);
    const ews = this.clampScore(ewsScore);

    const wCrime = Number(weights.crime ?? 0.40);
    const wWeather = Number(weights.weather ?? 0.20);
    const wNews = Number(weights.news ?? 0.10);
    const wCrowd = Number(weights.crowd ?? 0.15);
    const wCommunity = Number(weights.community ?? 0.15);
    const wEws = Number(weights.ews ?? 0.00);

    const totalWeightSum = wCrime + wWeather + wNews + wCrowd + wCommunity + wEws;

    const rawWeightedScore =
      crime * wCrime +
      weather * wWeather +
      news * wNews +
      crowd * wCrowd +
      community * wCommunity +
      ews * wEws;

    // Normalize if total weights don't equal 1.0
    const normalizedScore = totalWeightSum > 0 ? rawWeightedScore / totalWeightSum : 0;
    const totalRiskScore = Math.min(100, Math.max(0, Math.round(normalizedScore)));
    const level = this.getRiskLevel(totalRiskScore);

    logger.info(
      `[RiskEngine] totalRiskScore=${totalRiskScore}, level=${level} | ` +
      `crime=${crime}, weather=${weather}, news=${news}, crowd=${crowd}, community=${community}, ews=${ews}`
    );

    return {
      totalRiskScore,
      level,
      breakdown: {
        crime: Math.round(crime),
        weather: Math.round(weather),
        news: Math.round(news),
        crowd: Math.round(crowd),
        community: Math.round(community),
        ews: Math.round(ews),
      },
    };
  }
}

module.exports = new RiskEngineService();
