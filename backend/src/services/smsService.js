const axios = require('axios');
const logger = require('../utils/logger');
const User = require('../models/User');
const { formatIst, formatLateBy } = require('./sos/sosLate');

const twilioConfigured = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);

class SMSService {
  /** 'twilio' when this server can really text contacts, else 'not_configured' (it then only logs). */
  mode() {
    return twilioConfigured() ? 'twilio' : 'not_configured';
  }

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
  async sendSOSToSMSContacts({ userId, contacts, coords, locationDoc, type, reason, timestamp, triggeredAt, lateBySeconds = 0, lateDelivery = false }) {
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
      // The location must come from the SOS itself. There is deliberately NO fallback coordinate: an
      // alert with a wrong place is worse than one that says the location is unavailable.
      let lat = null;
      let lng = null;
      if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
        lat = coords.latitude;
        lng = coords.longitude;
      } else if (locationDoc?.location?.coordinates && Array.isArray(locationDoc.location.coordinates)) {
        lng = locationDoc.location.coordinates[0];
        lat = locationDoc.location.coordinates[1];
      }
      const mapsUrl = Number.isFinite(lat) && Number.isFinite(lng) ? `https://maps.google.com/?q=${lat},${lng}` : null;
      const alertTypeUpper = (type || 'MANUAL').toUpperCase();

      // States WHEN the SOS was triggered (IST). A late delivery says so, so contacts are not misled about timing.
      const when = formatIst(triggeredAt || timestamp || new Date());
      const lateLine = lateDelivery ? `\nThis alert was delayed by ${formatLateBy(lateBySeconds)} (the phone had no signal). Triggered at ${when}.` : '';
      const messageBody = `🚨 SafeTours Emergency Alert 🚨\nAn ${alertTypeUpper} SOS alert was triggered for: ${userName} at ${when}.${lateLine}\nReason: ${reason || 'Immediate Assistance Required'}\n\n${mapsUrl ? `Location:\n${mapsUrl}` : 'Location unavailable.'}`;

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

        // Nothing was texted: report that honestly (sent:0) instead of pretending the contacts were reached.
        return { sent: 0, failed: 0, simulated: phoneNumbers.length, provider: 'simulated_dev' };
      }
    } catch (error) {
      logger.error(`[SMSService] Unexpected error in sendSOSToSMSContacts:`, error.message);
      return { sent: 0, failed: 0, error: error.message };
    }
  }
}

module.exports = new SMSService();
