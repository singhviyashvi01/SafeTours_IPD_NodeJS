const axios = require('axios');
const logger = require('../utils/logger');
const User = require('../models/User');

class SMSService {
  /**
   * Automatically dispatches SMS alerts to emergency contacts for an SOS event.
   * 
   * @param {Object} params
   * @param {string}  params.userId       - Authenticated user's ObjectId
   * @param {Array}   params.contacts     - Array of EmergencyContact documents
   * @param {Object}  params.locationDoc  - Location document with GeoJSON coordinates
   * @param {string}  params.type         - 'manual' | 'automatic'
   * @param {string}  [params.reason]     - Optional trigger reason
   * @returns {Promise<Object>} Summary of SMS dispatch results
   */
  async sendSOSToSMSContacts({ userId, contacts, locationDoc, type, reason }) {
    try {
      if (!contacts || contacts.length === 0) {
        logger.warn(`[SMSService] No emergency contacts available to receive automatic SMS for user '${userId}'.`);
        return { sent: 0, failed: 0, reason: 'No emergency contacts found' };
      }

      // Fetch user details for name formatting
      let userName = 'SafeTours User';
      try {
        const userDoc = await User.findById(userId).select('name username phone').exec();
        if (userDoc) {
          userName = userDoc.name || userDoc.username || userName;
        }
      } catch (err) {
        logger.warn(`[SMSService] Could not fetch user document for '${userId}':`, err.message);
      }

      // Format coordinates into Google Maps URL
      let lat = 18.9220;
      let lng = 72.8347;
      if (locationDoc?.location?.coordinates && Array.isArray(locationDoc.location.coordinates)) {
        lng = locationDoc.location.coordinates[0];
        lat = locationDoc.location.coordinates[1];
      }

      const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
      const alertTypeUpper = (type || 'MANUAL').toUpperCase();

      const messageBody = `🚨 SafeTours Emergency Alert 🚨\nAn ${alertTypeUpper} SOS alert has been triggered for: ${userName}.\nReason: ${reason || 'Immediate Assistance Required'}\n\nLive Google Maps Location:\n${mapsUrl}`;

      const phoneNumbers = contacts
        .map(c => c.phone?.trim())
        .filter(Boolean);

      if (phoneNumbers.length === 0) {
        logger.warn(`[SMSService] Emergency contacts list has no valid phone numbers for user '${userId}'.`);
        return { sent: 0, failed: 0, reason: 'No phone numbers configured' };
      }

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromPhone = process.env.TWILIO_PHONE_NUMBER;

      // Check if Twilio API keys are configured in environment
      if (accountSid && authToken && fromPhone) {
        logger.info(`[SMSService] Dispatching server-side automatic SMS via Twilio to ${phoneNumbers.length} contacts...`);
        let sentCount = 0;
        let failCount = 0;

        const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

        for (const phone of phoneNumbers) {
          try {
            const params = new URLSearchParams();
            params.append('To', phone);
            params.append('From', fromPhone);
            params.append('Body', messageBody);

            await axios.post(twilioUrl, params.toString(), {
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              timeout: 10000,
            });
            sentCount++;
          } catch (smsErr) {
            failCount++;
            logger.error(`[SMSService] Failed to send SMS to '${phone}':`, smsErr.response?.data || smsErr.message);
          }
        }

        logger.info(`[SMSService] Twilio automatic SMS dispatch completed: ${sentCount} sent, ${failCount} failed.`);
        return { sent: sentCount, failed: failCount, provider: 'twilio' };
      } else {
        // Log simulated SMS dispatch when Twilio is not configured
        logger.info(`=======================================================`);
        logger.info(`[SMSService] SERVER-SIDE AUTOMATIC SMS DISPATCH (DEV MODE)`);
        logger.info(`Triggered For: ${userName} (ID: ${userId})`);
        logger.info(`Alert Type: ${alertTypeUpper}`);
        logger.info(`Recipients (${phoneNumbers.length}): ${phoneNumbers.join(', ')}`);
        logger.info(`Message Body:\n${messageBody}`);
        logger.info(`=======================================================`);

        return { sent: phoneNumbers.length, failed: 0, provider: 'simulated_dev' };
      }
    } catch (error) {
      logger.error(`[SMSService] Unexpected error in sendSOSToSMSContacts:`, error.message);
      return { sent: 0, failed: 0, error: error.message };
    }
  }
}

module.exports = new SMSService();
