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
      const { latitude, longitude, accuracy, speed, heading, timestamp } = data;
      
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
