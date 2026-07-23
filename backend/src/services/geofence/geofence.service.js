const UserGeofenceState = require('../../models/UserGeofenceState');
const GeofenceEvent = require('../../models/GeofenceEvent');
const DangerZone = require('../../models/DangerZone');
const GridCell = require('../../models/GridCell');
const h3GridService = require('../h3GridService');
const dangerZoneService = require('../dangerZoneService');
const sosService = require('../sosService');
const logger = require('../../utils/logger');

/**
 * Helper: Checks if current risk level meets or exceeds configured SOS trigger threshold.
 * Configurable via process.env.GEOFENCE_SOS_TRIGGER_LEVEL (default: 'HIGH' - triggers on HIGH & EXTREME).
 */
function shouldTriggerGeofenceSOS(currentRiskLevel) {
  const triggerLevelSetting = (process.env.GEOFENCE_SOS_TRIGGER_LEVEL || 'HIGH').toUpperCase();
  const ranks = { SAFE: 0, LOW: 1, MODERATE: 2, HIGH: 3, EXTREME: 4 };
  const currentRank = ranks[String(currentRiskLevel).toUpperCase()] ?? 0;
  const triggerRank = ranks[triggerLevelSetting] ?? 3; // Default rank 3 is HIGH
  return currentRank >= triggerRank;
}

/**
 * GeofenceService — SafeTours IPD
 *
 * Core Geofencing Detection Engine, Live Monitoring, Offline Synchronization,
 * and Automatic SOS Trigger Integration.
 */
class GeofenceService {
  /**
   * Evaluates user location, calculates geofence transitions, logs events,
   * and automatically triggers an SOS on entry into configured high-risk zones.
   *
   * @param {string|Object} userId - User ObjectId or string ID
   * @param {number} latitude - WGS84 latitude
   * @param {number} longitude - WGS84 longitude
   * @returns {Promise<Object>} Detection payload with event, insideDangerZone, riskLevel, zoneId, message, totalRisk
   */
  async checkGeofence(userId, latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);

    // 1. Convert latitude/longitude to H3 cell (Resolution 9)
    const currentH3 = h3GridService.latLngToH3(lat, lng, 9);
    logger.info(`[GeofenceService] Checking geofence for user '${userId}' at [${lat}, ${lng}] (H3: '${currentH3}')`);

    // 2. Dynamic Danger Zone Refresh: Always query MongoDB directly for the latest un-cached DangerZone document
    let zone = await DangerZone.findOne({ h3Index: currentH3 }).lean();

    if (!zone) {
      // Fallback A: Check GridCell collection
      const gridCell = await GridCell.findOne({
        $or: [{ h3Index: currentH3 }, { h3CellId: currentH3 }],
      }).lean();

      if (gridCell) {
        zone = {
          _id: gridCell._id,
          h3Index: gridCell.h3Index || gridCell.h3CellId,
          riskLevel: gridCell.level || 'SAFE',
          totalRiskScore: gridCell.totalRiskScore || gridCell.totalRisk || 0,
        };
      } else {
        // Fallback B: Spatial query for nearest DangerZone within cell radius (~200m)
        const nearestZone = await dangerZoneService.getNearestDangerZone(lat, lng);
        if (nearestZone && nearestZone.distanceInMeters <= 200) {
          zone = nearestZone;
        }
      }
    }

    // Determine current risk level, total risk score, and danger zone status (HIGH / EXTREME are danger zones)
    const rawLevel = zone?.riskLevel ? String(zone.riskLevel).toUpperCase() : 'SAFE';
    const isDangerZone = ['HIGH', 'EXTREME'].includes(rawLevel);
    const insideDangerZone = isDangerZone;
    const currentZoneId = zone?._id ? zone._id.toString() : null;
    const totalRisk = zone?.totalRiskScore ?? zone?.crimeScore ?? 0;

    // 3. Find user's previously known H3 cell & state
    const previousState = await UserGeofenceState.findOne({ userId });
    const previousZoneId = previousState?.currentZoneId ? previousState.currentZoneId.toString() : null;

    let event = 'NONE';
    let message = '';

    if (!previousState || !previousState.currentH3) {
      // Case 1: First location check
      event = 'NONE';
      if (insideDangerZone) {
        message = `Entering ${rawLevel === 'EXTREME' ? 'Extreme' : 'High'} Risk Area`;
      } else {
        message = 'Currently in Safe Area';
      }
    } else if (previousState.currentH3 === currentH3) {
      // Case 2: Same H3 cell
      event = 'NO_CHANGE';
      message = 'Location cell unchanged';
    } else {
      // Case 3: Different H3 cell
      const wasInside = Boolean(previousState.insideDangerZone);

      if (!wasInside && insideDangerZone) {
        // SAFE -> HIGH/EXTREME
        event = 'ENTER';
        message = `Entering ${rawLevel === 'EXTREME' ? 'Extreme' : 'High'} Risk Area`;
      } else if (wasInside && !insideDangerZone) {
        // HIGH/EXTREME -> SAFE
        event = 'EXIT';
        message = 'Exiting Danger Zone';
      } else if (wasInside && insideDangerZone) {
        // HIGH/EXTREME -> HIGH/EXTREME in another cell or zone
        event = 'ZONE_CHANGED';
        message = `Changed Danger Zone to ${rawLevel === 'EXTREME' ? 'Extreme' : 'High'} Risk Area`;
      } else {
        // SAFE -> SAFE (different cell)
        event = 'NO_CHANGE';
        message = 'Location changed within Safe Area';
      }
    }

    // 4. Store/Update the user's latest H3 cell & state in MongoDB (UserGeofenceState)
    await UserGeofenceState.findOneAndUpdate(
      { userId },
      {
        $set: {
          currentH3,
          currentZoneId: zone?._id || null,
          insideDangerZone,
          lastChecked: new Date(),
          lastEvent: event,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    // 5. Persist event in GeofenceEvent collection ONLY when state changes (ENTER, EXIT, ZONE_CHANGED)
    // Duplicate prevention: NO_CHANGE and NONE do not produce duplicate GeofenceEvent documents
    if (['ENTER', 'EXIT', 'ZONE_CHANGED'].includes(event)) {
      await GeofenceEvent.create({
        userId,
        event,
        zoneId: zone?._id || null,
        previousZone: previousState?.currentZoneId || null,
        riskLevel: rawLevel,
        totalRisk,
        location: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        timestamp: new Date(),
      });

      logger.info(`[GeofenceService] GeofenceEvent created for user '${userId}': event=${event}, zoneId=${currentZoneId}, previousZone=${previousZoneId}`);
    }

    // 6. AUTOMATIC SOS TRIGGER INTEGRATION
    // Whenever an ENTER or ZONE_CHANGED event into a HIGH or EXTREME risk zone is detected,
    // automatically trigger an SOS using sosService (with duplicate active SOS prevention).
    let automaticSOSResult = null;
    if (['ENTER', 'ZONE_CHANGED'].includes(event) && shouldTriggerGeofenceSOS(rawLevel)) {
      try {
        automaticSOSResult = await sosService.triggerGeofenceSOS(userId, {
          latitude: lat,
          longitude: lng,
          zoneId: zone?._id || null,
          riskLevel: rawLevel,
          reason: `Automatic SOS triggered on geofence ${event} into ${rawLevel} Risk Area`,
        });

        if (automaticSOSResult.triggered) {
          logger.info(`[GeofenceService] Automatic SOS successfully created for user '${userId}': SOS ID = ${automaticSOSResult.sos._id}`);
        } else {
          logger.info(`[GeofenceService] Automatic SOS creation skipped for user '${userId}': ${automaticSOSResult.reason}`);
        }
      } catch (sosErr) {
        // Requirement 7: Ensure robust error handling so geofence processing continues even if SOS creation fails
        logger.error(`[GeofenceService] Non-blocking error triggering automatic SOS for user '${userId}':`, sosErr.message);
      }
    }

    logger.info(
      `[GeofenceService] Result for user '${userId}': event=${event}, insideDangerZone=${insideDangerZone}, riskLevel=${rawLevel}, zoneId=${currentZoneId}`
    );

    return {
      event,
      insideDangerZone,
      riskLevel: rawLevel,
      totalRisk,
      zoneId: currentZoneId,
      previousZone: previousZoneId,
      message,
      automaticSOS: automaticSOSResult ? {
        triggered: automaticSOSResult.triggered,
        sosId: automaticSOSResult.sos ? automaticSOSResult.sos._id : null,
        reason: automaticSOSResult.reason || null,
      } : null,
    };
  }

  /**
   * Offline Batch Processing — Synchronizes multiple stored GPS points chronologically.
   *
   * @param {string|Object} userId
   * @param {Array<{latitude: number, longitude: number, timestamp?: string}>} locations
   * @returns {Promise<Object>} Summary of processed locations, generated events, and final status
   */
  async syncOfflineLocations(userId, locations) {
    if (!Array.isArray(locations) || locations.length === 0) {
      throw new Error('Locations array cannot be empty.');
    }

    // 1. Sort locations chronologically (oldest to newest)
    const sortedLocations = [...locations].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeA - timeB;
    });

    logger.info(`[GeofenceService] Processing batch sync of ${sortedLocations.length} locations for user '${userId}'`);

    // 2. Performance optimization: Pre-map H3 cells and bulk-query DangerZone collection
    const h3CellMap = new Map();
    const locationCellPairs = sortedLocations.map((loc) => {
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      const h3Index = h3GridService.latLngToH3(lat, lng, 9);
      return { loc, lat, lng, h3Index };
    });

    const uniqueH3s = Array.from(new Set(locationCellPairs.map((p) => p.h3Index)));

    // Always fetch latest un-cached DangerZone documents directly from MongoDB
    const matchingZones = await DangerZone.find({ h3Index: { $in: uniqueH3s } }).lean();
    matchingZones.forEach((z) => h3CellMap.set(z.h3Index, z));

    // Fallback lookup for cells not in DangerZone collection
    const missingH3s = uniqueH3s.filter((h3) => !h3CellMap.has(h3));
    if (missingH3s.length > 0) {
      const gridCells = await GridCell.find({
        $or: [{ h3Index: { $in: missingH3s } }, { h3CellId: { $in: missingH3s } }],
      }).lean();
      gridCells.forEach((gc) => {
        const cellH3 = gc.h3Index || gc.h3CellId;
        if (!h3CellMap.has(cellH3)) {
          h3CellMap.set(cellH3, {
            _id: gc._id,
            h3Index: cellH3,
            riskLevel: gc.level || 'SAFE',
            totalRiskScore: gc.totalRiskScore || gc.totalRisk || 0,
          });
        }
      });
    }

    // 3. Process each location chronologically through the geofence engine
    const generatedEvents = [];
    let lastResult = null;

    for (const pair of locationCellPairs) {
      const { loc, lat, lng, h3Index } = pair;
      let zone = h3CellMap.get(h3Index);

      // Fallback spatial query if not matched by H3 index
      if (!zone) {
        const nearestZone = await dangerZoneService.getNearestDangerZone(lat, lng);
        if (nearestZone && nearestZone.distanceInMeters <= 200) {
          zone = nearestZone;
          h3CellMap.set(h3Index, nearestZone);
        }
      }

      const rawLevel = zone?.riskLevel ? String(zone.riskLevel).toUpperCase() : 'SAFE';
      const isDangerZone = ['HIGH', 'EXTREME'].includes(rawLevel);
      const insideDangerZone = isDangerZone;
      const currentZoneId = zone?._id ? zone._id.toString() : null;
      const totalRisk = zone?.totalRiskScore ?? zone?.crimeScore ?? 0;
      const pointTime = loc.timestamp ? new Date(loc.timestamp) : new Date();

      // Retrieve previous state
      const previousState = await UserGeofenceState.findOne({ userId });
      const previousZoneId = previousState?.currentZoneId ? previousState.currentZoneId.toString() : null;

      let event = 'NONE';
      let message = '';

      if (!previousState || !previousState.currentH3) {
        event = 'NONE';
        message = insideDangerZone
          ? `Entering ${rawLevel === 'EXTREME' ? 'Extreme' : 'High'} Risk Area`
          : 'Currently in Safe Area';
      } else if (previousState.currentH3 === h3Index) {
        event = 'NO_CHANGE';
        message = 'Location cell unchanged';
      } else {
        const wasInside = Boolean(previousState.insideDangerZone);

        if (!wasInside && insideDangerZone) {
          event = 'ENTER';
          message = `Entering ${rawLevel === 'EXTREME' ? 'Extreme' : 'High'} Risk Area`;
        } else if (wasInside && !insideDangerZone) {
          event = 'EXIT';
          message = 'Exiting Danger Zone';
        } else if (wasInside && insideDangerZone) {
          event = 'ZONE_CHANGED';
          message = `Changed Danger Zone to ${rawLevel === 'EXTREME' ? 'Extreme' : 'High'} Risk Area`;
        } else {
          event = 'NO_CHANGE';
          message = 'Location changed within Safe Area';
        }
      }

      // Update UserGeofenceState
      await UserGeofenceState.findOneAndUpdate(
        { userId },
        {
          $set: {
            currentH3: h3Index,
            currentZoneId: zone?._id || null,
            insideDangerZone,
            lastChecked: pointTime,
            lastEvent: event,
          },
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );

      // Duplicate prevention: Persist ONLY state change events (ENTER, EXIT, ZONE_CHANGED)
      if (['ENTER', 'EXIT', 'ZONE_CHANGED'].includes(event)) {
        const eventDoc = await GeofenceEvent.create({
          userId,
          event,
          zoneId: zone?._id || null,
          previousZone: previousState?.currentZoneId || null,
          riskLevel: rawLevel,
          totalRisk,
          location: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          timestamp: pointTime,
        });

        generatedEvents.push({
          eventId: eventDoc._id,
          event,
          zoneId: currentZoneId,
          previousZone: previousZoneId,
          riskLevel: rawLevel,
          totalRisk,
          coordinates: [lng, lat],
          timestamp: pointTime,
          message,
        });
      }

      // AUTOMATIC SOS TRIGGER INTEGRATION DURING BATCH REPLAY
      if (['ENTER', 'ZONE_CHANGED'].includes(event) && shouldTriggerGeofenceSOS(rawLevel)) {
        try {
          await sosService.triggerGeofenceSOS(userId, {
            latitude: lat,
            longitude: lng,
            zoneId: zone?._id || null,
            riskLevel: rawLevel,
            reason: `Automatic SOS triggered during batch sync on geofence ${event} into ${rawLevel} Risk Area`,
          });
        } catch (sosErr) {
          logger.error(`[GeofenceService] Non-blocking error triggering automatic SOS during batch sync for user '${userId}':`, sosErr.message);
        }
      }

      lastResult = {
        event,
        insideDangerZone,
        riskLevel: rawLevel,
        totalRisk,
        currentH3: h3Index,
        zoneId: currentZoneId,
        message,
      };
    }

    logger.info(
      `[GeofenceService] Batch sync completed for user '${userId}': ${sortedLocations.length} locations processed, ${generatedEvents.length} events generated.`
    );

    return {
      processedCount: sortedLocations.length,
      eventsGenerated: generatedEvents.length,
      events: generatedEvents,
      finalState: lastResult,
    };
  }

  /**
   * Retrieves current geofence status for a user.
   *
   * @param {string|Object} userId
   * @returns {Promise<Object>} Status object containing current zone, risk, H3 cell, last event, inside zone
   */
  async getGeofenceStatus(userId) {
    const userState = await UserGeofenceState.findOne({ userId })
      .populate('currentZoneId')
      .lean();

    if (!userState) {
      return {
        currentZone: null,
        currentRisk: {
          riskLevel: 'SAFE',
          totalRisk: 0,
        },
        currentH3: null,
        lastEvent: 'NONE',
        insideZone: false,
        lastChecked: null,
      };
    }

    const currentZone = userState.currentZoneId || null;
    const riskLevel = currentZone?.riskLevel
      ? String(currentZone.riskLevel).toUpperCase()
      : userState.insideDangerZone ? 'HIGH' : 'SAFE';
    const totalRisk = currentZone?.totalRiskScore ?? currentZone?.crimeScore ?? 0;

    return {
      currentZone,
      currentRisk: {
        riskLevel,
        totalRisk,
      },
      currentH3: userState.currentH3,
      lastEvent: userState.lastEvent,
      insideZone: userState.insideDangerZone,
      lastChecked: userState.lastChecked,
    };
  }

  /**
   * Retrieves full geofence event history for a user.
   *
   * @param {string|Object} userId
   * @returns {Promise<Object[]>} List of historical GeofenceEvent documents
   */
  async getGeofenceHistory(userId) {
    const history = await GeofenceEvent.find({ userId })
      .sort({ timestamp: -1 })
      .populate('zoneId previousZone')
      .lean();

    logger.info(`[GeofenceService] Fetched ${history.length} geofence history events for user '${userId}'`);
    return history;
  }
}

module.exports = new GeofenceService();
