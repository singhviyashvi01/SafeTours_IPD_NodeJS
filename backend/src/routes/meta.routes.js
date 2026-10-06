const express = require('express');
const geofenceCfg = require('../config/geofence.config');
const riskCfg = require('../config/risk.config');
const nearbyCfg = require('../config/nearby.config');

const router = express.Router();

/**
 * GET /api/health: unauthenticated liveness probe. The app pings it to tell "connected to a network" from
 * "can actually reach the server" (connectivity state ONLINE / WEAK / OFFLINE).
 */
router.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ success: true, status: 'ok', serverTime: new Date().toISOString() });
});

/**
 * GET /api/config/client: the non-secret thresholds the phone needs to run the geofence check and the
 * time-of-day rules offline with exactly the server's values. The app caches this and falls back to its
 * built-in defaults (the same values) when it has never been online.
 */
router.get('/config/client', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.status(200).json({
    success: true,
    version: 1,
    geofence: {
      accuracyMaxMeters: geofenceCfg.accuracyMaxMeters,
      enterScore: geofenceCfg.enterScore,
      exitScore: geofenceCfg.exitScore,
      enterReadings: geofenceCfg.enterReadings,
      enterDwellSeconds: geofenceCfg.enterDwellSeconds,
      exitReadings: geofenceCfg.exitReadings,
      exitDwellSeconds: geofenceCfg.exitDwellSeconds,
      minReadingsForDwell: geofenceCfg.minReadingsForDwell,
      historicalAfterMinutes: geofenceCfg.historicalAfterMinutes,
      futureToleranceSeconds: geofenceCfg.futureToleranceSeconds,
    },
    risk: {
      timezone: riskCfg.timezone,
      thresholds: riskCfg.thresholds,
      dangerLevels: riskCfg.dangerLevels,
      confidence: riskCfg.confidence,
      timeModifier: riskCfg.timeModifier,
      festivals: riskCfg.festivals.map(({ name, start, end, riskBoost }) => ({ name, start, end, riskBoost })),
    },
    nearby: { resolution: nearbyCfg.resolution, defaultRadius: nearbyCfg.radius.default },
  });
});

module.exports = router;
