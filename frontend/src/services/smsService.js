import * as SMS from 'expo-sms';
import * as Location from 'expo-location';
import { contactsService } from './contacts';

export const smsService = {
  /**
   * Opens the native SMS composer with emergency contacts and a location link.
   * @param {Object} [location] - Optional { latitude, longitude }
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async sendSOSTriggerSMS(location) {
    try {
      // 1. Resolve real location coordinates before opening the emergency message.
      let lat = location?.latitude;
      let lng = location?.longitude;

      if (!lat || !lng) {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (loc && loc.coords) {
              lat = loc.coords.latitude;
              lng = loc.coords.longitude;
            }
          }
        } catch (locErr) {
          console.warn('[smsService] Could not fetch live location fix:', locErr);
        }
      }

      // Never send an SOS message with placeholder coordinates.
      if (!lat || !lng) {
        return { success: false, message: 'A current location is required to prepare the SOS message.' };
      }

      // 2. Fetch emergency contacts
      let contacts = [];
      try {
        contacts = await contactsService.list();
      } catch (err) {
        console.warn('[smsService] Failed to fetch emergency contacts:', err);
        return { success: false, message: 'Could not retrieve emergency contacts from server.' };
      }

      // Filter and extract phone numbers
      const phoneNumbers = (contacts || [])
        .map(c => c.phone?.trim())
        .filter(Boolean);

      // 3. Handle no emergency contacts
      if (phoneNumbers.length === 0) {
        return { success: false, message: 'No emergency contacts with phone numbers found.' };
      }

      // 4. Check if SMS is available on the device
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        return { success: false, message: 'SMS composer is not available on this device.' };
      }

      // 5. Construct the prefilled message
      const message = `🚨 SafeTours Emergency Alert\nUser has triggered an SOS\n\nLive Google Maps location:\nhttps://maps.google.com/?q=${lat},${lng}`;

      // 6. Open SMS composer
      const { result } = await SMS.sendSMSAsync(phoneNumbers, message);

      if (result === 'cancelled') {
        return { success: false, message: 'SMS composer was cancelled by user.' };
      }

      return { success: true, message: 'SMS composer opened successfully.' };
    } catch (error) {
      console.error('[smsService] Error sending SMS:', error);
      return { success: false, message: error.message || 'An unexpected error occurred opening SMS.' };
    }
  }
};
