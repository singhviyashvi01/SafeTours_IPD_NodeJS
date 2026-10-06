const Location = require('../models/Location');

class LocationService {
  /**
   * Saves a single location point for a user.
   * Formats the raw frontend payload into the GeoJSON structure required by MongoDB.
   * 
   * @param {string} userId - The MongoDB ObjectId of the user.
   * @param {Object} data - The validated location payload (latitude, longitude, accuracy, etc.).
   * @returns {Promise<Object>} The saved Location document.
   * @throws {Error} If database insertion fails.
   */
  async saveLocation(userId, data) {
    try {
      const { latitude, longitude, accuracy, speed, heading, timestamp, idempotencyKey } = data;
      
      const newLocation = new Location({
        userId,
        location: {
          type: 'Point',
          // CRITICAL: GeoJSON format always requires [longitude, latitude]
          coordinates: [longitude, latitude], 
        },
        accuracy,
        speed: speed || 0,
        heading,
        timestamp,
        idempotencyKey: idempotencyKey || undefined,
      });

      const savedLocation = await newLocation.save();
      return savedLocation;
    } catch (error) {
      // In a production environment, you would log to an APM like Sentry or Datadog here
      console.error(`[LocationService.saveLocation] Failed to save location for user ${userId}:`, error.message);
      throw new Error('Failed to save location data to the database.');
    }
  }

  /**
   * Stores a batch of points recorded offline. Safe to re-send: a point whose idempotencyKey already exists for
   * this user is counted as a duplicate and not stored again. Points with an impossible time (more than
   * `futureToleranceMs` ahead, or older than `maxAgeDays`) are rejected individually instead of failing the batch.
   *
   * @param {string} userId
   * @param {Array<{idempotencyKey:string, latitude:number, longitude:number, accuracy:number, timestamp:Date|string, speed?:number, heading?:number}>} points
   * @param {Object} [opts] { model, now, futureToleranceMs, maxAgeDays }  (model/now are injectable for tests)
   * @returns {Promise<{received:number, inserted:number, duplicates:number, rejected:Array<{index:number, reason:string}>, newest:Object|null}>}
   */
  async saveBatch(userId, points, { model = Location, now = new Date(), futureToleranceMs = 5 * 60000, maxAgeDays = 30 } = {}) {
    const rejected = [];
    const valid = [];
    const seen = new Set();
    points.forEach((p, index) => {
      const t = new Date(p.timestamp).getTime();
      if (Number.isNaN(t)) return rejected.push({ index, reason: 'invalid timestamp' });
      if (t > now.getTime() + futureToleranceMs) return rejected.push({ index, reason: 'timestamp in the future' });
      if (now.getTime() - t > maxAgeDays * 86400000) return rejected.push({ index, reason: 'older than ' + maxAgeDays + ' days' });
      if (seen.has(p.idempotencyKey)) return; // the same key twice inside one batch
      seen.add(p.idempotencyKey);
      valid.push(p);
    });
    const inBatchDuplicates = points.length - rejected.length - valid.length;

    // 1) cheap pre-filter: keys already stored
    const existing = valid.length
      ? await model.find({ userId, idempotencyKey: { $in: valid.map((p) => p.idempotencyKey) } }).select('idempotencyKey').lean()
      : [];
    const known = new Set(existing.map((d) => d.idempotencyKey));
    const fresh = valid.filter((p) => !known.has(p.idempotencyKey));

    // 2) insert; a concurrent duplicate loses to the unique index and is counted, not raised
    let inserted = fresh.length;
    if (fresh.length) {
      const docs = fresh.map((p) => ({
        userId,
        location: { type: 'Point', coordinates: [Number(p.longitude), Number(p.latitude)] },
        accuracy: Number(p.accuracy),
        speed: p.speed || 0,
        heading: p.heading,
        timestamp: new Date(p.timestamp),
        idempotencyKey: p.idempotencyKey,
      }));
      try {
        await model.insertMany(docs, { ordered: false });
      } catch (e) {
        const writeErrors = e.writeErrors || (e.cause && e.cause.writeErrors) || [];
        const onlyDuplicates = writeErrors.length > 0 && writeErrors.every((w) => (w.code || (w.err && w.err.code)) === 11000);
        if (!onlyDuplicates) throw e;
        inserted = fresh.length - writeErrors.length;
      }
    }

    const newest = fresh.length ? fresh.reduce((a, b) => (new Date(a.timestamp) > new Date(b.timestamp) ? a : b)) : null;
    return { received: points.length, inserted, duplicates: known.size + inBatchDuplicates + (fresh.length - inserted), rejected, newest };
  }

  /**
   * Retrieves the most recent location recorded for a specific user.
   * Uses the 'timestamp' field (from the GPS hardware) rather than 'createdAt'
   * to ensure accuracy even during delayed offline syncs.
   * 
   * @param {string} userId - The MongoDB ObjectId of the user.
   * @returns {Promise<Object|null>} The most recent Location document, or null if not found.
   * @throws {Error} If database query fails.
   */
  async getLatestLocation(userId) {
    try {
      const latestLocation = await Location.findOne({ userId })
        .sort({ timestamp: -1 }) // Sort descending by timestamp (newest first)
        .exec();

      return latestLocation;
    } catch (error) {
      console.error(`[LocationService.getLatestLocation] Failed to fetch latest location for user ${userId}:`, error.message);
      throw new Error('Failed to retrieve the latest location from the database.');
    }
  }
}

// Export as a singleton instance so controllers share the same service logic
module.exports = new LocationService();
