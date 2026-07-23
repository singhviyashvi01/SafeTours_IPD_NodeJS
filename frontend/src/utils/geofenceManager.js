/**
 * Geofence Manager
 * Evaluates current GPS location against Danger Zones to detect zone entry, exit, and transitions.
 */

// Haversine formula to compute distance in meters between two lat/lng points
export const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

class GeofenceManager {
  constructor() {
    this.currentZone = null;
    this.listeners = {
      onEnterDangerZone: [],
      onExitDangerZone: [],
      onDangerZoneChanged: [],
    };
  }

  /**
   * Subscribe event listeners
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Unsubscribe event listeners
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit event to subscribers
   */
  emit(event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(...args);
        } catch (err) {
          console.error(`[GeofenceManager] Error in ${event} listener:`, err);
        }
      });
    }
  }

  /**
   * Evaluate user location against array of danger zones
   */
  evaluateLocation(coords, dangerZones = []) {
    if (!coords || !coords.latitude || !coords.longitude || !dangerZones.length) {
      return {
        activeZone: this.currentZone,
        toastMessage: null,
      };
    }

    const { latitude, longitude } = coords;
    let detectedZone = null;
    let minDistance = Infinity;

    // Find if user is inside or immediately adjacent to any danger zone
    for (const zone of dangerZones) {
      let zoneLat = null;
      let zoneLng = null;

      if (zone.location && Array.isArray(zone.location.coordinates)) {
        zoneLng = zone.location.coordinates[0];
        zoneLat = zone.location.coordinates[1];
      } else if (zone.latitude !== undefined && zone.longitude !== undefined) {
        zoneLat = Number(zone.latitude);
        zoneLng = Number(zone.longitude);
      }

      if (zoneLat !== null && zoneLng !== null) {
        const dist = calculateDistanceMeters(latitude, longitude, zoneLat, zoneLng);
        const radius = zone.radius || 300; // default 300m radius

        if (dist <= radius && dist < minDistance) {
          minDistance = dist;
          detectedZone = { ...zone, distanceInMeters: dist };
        }
      }
    }

    let toastMessage = null;
    const prevZone = this.currentZone;

    if (!prevZone && detectedZone) {
      // ENTERED DANGER ZONE
      this.currentZone = detectedZone;
      const riskLabel = (detectedZone.riskLevel || 'High Risk').toUpperCase();
      toastMessage = `Entering ${riskLabel} Area (Zone #${detectedZone.hotspotId || 'Active'})`;
      
      this.emit('onEnterDangerZone', detectedZone);
      this.emit('onDangerZoneChanged', detectedZone, null);
    } else if (prevZone && !detectedZone) {
      // EXITED DANGER ZONE
      this.currentZone = null;
      toastMessage = 'Leaving Danger Zone — Entering Safe Area';
      
      this.emit('onExitDangerZone', prevZone);
      this.emit('onDangerZoneChanged', null, prevZone);
    } else if (
      prevZone &&
      detectedZone &&
      (prevZone.hotspotId !== detectedZone.hotspotId || prevZone._id !== detectedZone._id)
    ) {
      // TRANSITIONED BETWEEN DANGER ZONES
      this.currentZone = detectedZone;
      const riskLabel = (detectedZone.riskLevel || 'High Risk').toUpperCase();
      toastMessage = `Transitioned to ${riskLabel} Area (Zone #${detectedZone.hotspotId || 'Active'})`;
      
      this.emit('onDangerZoneChanged', detectedZone, prevZone);
    }

    return {
      activeZone: this.currentZone,
      toastMessage,
    };
  }
}

export const geofenceManager = new GeofenceManager();
