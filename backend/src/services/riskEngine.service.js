const axios = require('axios');
const logger = require('../utils/logger');
const { normalizeNumeric } = require('../utils/normalizeData');
const { RISK_LEVELS, RISK_THRESHOLDS } = require('../config/riskWeights.config');

/**
 * RiskEngineService — SafeTours IPD
 *
 * Purpose of this service:
 * Forwards necessary data to the Python score-service which acts as the
 * single centralized Risk Score Engine.
 */
class RiskEngineService {
  /**
   * Helper method to map a numeric score (0-100) to a standard risk level.
   * Retained for backward compatibility if needed by tests or other modules.
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
   * Main calculation function that delegates to the Python score-service.
   *
   * @param {Object} data
   * @param {number} data.lat
   * @param {number} data.lng
   * @param {number} [data.crowdCount=0]
   * @param {Array} [data.communityReports=[]]
   * @param {boolean} [data.solo=false]
   * @returns {Promise<{ totalRiskScore: number, level: string, breakdown: Object }>}
   */
  async calculateRisk({ lat, lng, crowdCount = 0, communityReports = [], solo = false }) {
    try {
      // Node.js collects the data. Missing numeric values become 0.
      const payload = {
        lat: normalizeNumeric(lat),
        lng: normalizeNumeric(lng),
        crowd_count: normalizeNumeric(crowdCount),
        community_reports: communityReports,
        solo: Boolean(solo)
      };

      // Python performs the actual risk calculation.
      const response = await axios.post('http://localhost:8000/score', payload, {
        headers: {
          'X-API-Key': process.env.SAFETOURS_API_KEY,
        },
        timeout: 10000,
      });

      const data = response.data;
      logger.info(`[RiskEngineService] Python score-service returned: totalRiskScore=${data.score}, level=${data.zone}`);

      // Node.js only forwards the result.
      return {
        totalRiskScore: data.score,
        level: data.zone,
        breakdown: {
          crime: data.breakdown.crime,
          weather: data.breakdown.weather,
          news: data.breakdown.news,
          crowd: data.breakdown.crowd,
          community: data.breakdown.community_reports,
          infra: data.breakdown.infra,
          time: data.breakdown.time
        },
      };
    } catch (error) {
      logger.error('[RiskEngineService] Error calling Python score-service:', error.message);
      // Controlled backend error if Python is unavailable. DO NOT fallback to Node.js calculation.
      throw new Error('Risk calculation service is currently unavailable.');
    }
  }
}

module.exports = new RiskEngineService();

