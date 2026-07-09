const Journey = require('../models/Journey');

class JourneyService {
  
  /**
   * Initializes a new journey.
   * Enforces the business rule that a user can only have one active journey at a time.
   */
  async startJourney(userId, data) {
    try {
      // 1. Business Logic: Check for existing active journeys
      const existingActiveJourney = await Journey.findOne({ userId, status: 'ACTIVE' }).exec();
      if (existingActiveJourney) {
        throw new Error('User already has an active journey. Please complete or cancel it first.');
      }

      // 2. Format payload to match GeoJSON schema
      const { startLocation, destination, expectedArrivalTime } = data;

      const newJourney = new Journey({
        userId,
        startLocation: { type: 'Point', coordinates: startLocation },
        destination: { type: 'Point', coordinates: destination },
        expectedArrivalTime,
        status: 'ACTIVE' // Explicitly setting state machine starting point
      });

      const savedJourney = await newJourney.save();
      return savedJourney;
    } catch (error) {
      console.error(`[JourneyService.startJourney] Error for user ${userId}:`, error.message);
      throw new Error(error.message || 'Failed to start journey in the database.');
    }
  }

  /**
   * Updates an ongoing journey (e.g., updating ETA due to traffic delays).
   * Ensures the user owns the journey and it is still ACTIVE.
   */
  async updateJourney(journeyId, userId, updateData) {
    try {
      // 1. Security & State validation
      const journey = await Journey.findOne({ _id: journeyId, userId, status: 'ACTIVE' }).exec();
      if (!journey) {
        throw new Error('Active journey not found or you do not have permission to update it.');
      }

      // 2. Apply allowed updates
      if (updateData.expectedArrivalTime) {
        journey.expectedArrivalTime = updateData.expectedArrivalTime;
      }
      
      // Merge any metadata updates (like distanceTravelled) safely
      if (updateData.metadata) {
        journey.metadata = { ...journey.metadata, ...updateData.metadata };
      }

      const updatedJourney = await journey.save();
      return updatedJourney;
    } catch (error) {
      console.error(`[JourneyService.updateJourney] Error for journey ${journeyId}:`, error.message);
      throw new Error(error.message || 'Failed to update journey.');
    }
  }

  /**
   * Terminates a journey.
   * Validates the final status and sets the completion timestamp.
   */
  async endJourney(journeyId, userId, finalStatus) {
    try {
      // 1. State transition validation
      if (!['COMPLETED', 'CANCELLED'].includes(finalStatus)) {
        throw new Error('Invalid final status. Must be COMPLETED or CANCELLED.');
      }

      // 2. Security validation
      const journey = await Journey.findOne({ _id: journeyId, userId, status: 'ACTIVE' }).exec();
      if (!journey) {
        throw new Error('Active journey not found to end.');
      }

      // 3. Apply state change
      journey.status = finalStatus;
      journey.endTime = new Date(); // Stamp the completion time

      const savedJourney = await journey.save();
      return savedJourney;
    } catch (error) {
      console.error(`[JourneyService.endJourney] Error for journey ${journeyId}:`, error.message);
      throw new Error(error.message || 'Failed to end journey.');
    }
  }

  /**
   * Checks if the user currently has an ongoing journey.
   * Used heavily by the frontend on app restart to resume state.
   */
  async getJourneyStatus(userId) {
    try {
      // Return the single active journey, or null if they aren't traveling
      const activeJourney = await Journey.findOne({ userId, status: 'ACTIVE' }).exec();
      return activeJourney;
    } catch (error) {
      console.error(`[JourneyService.getJourneyStatus] Error for user ${userId}:`, error.message);
      throw new Error('Failed to retrieve journey status.');
    }
  }
}

// Export as a singleton
module.exports = new JourneyService();
