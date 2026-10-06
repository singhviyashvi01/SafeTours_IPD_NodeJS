import { Alert, Linking, Platform } from 'react-native';

/** Keeps a leading + and digits only: "+91 22 2345-6789" -> "+912223456789". */
export const sanitizePhone = (phone) => {
  if (!phone) return null;
  const cleaned = String(phone).trim().replace(/(?!^\+)[^\d]/g, '');
  return cleaned.replace(/^\+?$/, '') || null;
};

/** Call = the phone dialer (tel:). Returns false when there is no usable number. */
export async function callNumber(phone) {
  const number = sanitizePhone(phone);
  if (!number) return false;
  try {
    await Linking.openURL(`tel:${number}`);
    return true;
  } catch (e) {
    Alert.alert('Cannot place call', 'This device could not open the phone dialer.');
    return false;
  }
}

/**
 * Directions = the platform's maps app: a geo: intent on Android, Apple Maps on iOS. If that cannot be
 * opened it falls back to the Google Maps directions URL in the browser.
 */
export async function openDirections({ lat, lng, name }) {
  const label = encodeURIComponent(name || 'Destination');
  const primary = Platform.select({
    ios: `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
    android: `geo:0,0?q=${lat},${lng}(${label})`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  });
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  try {
    await Linking.openURL(primary);
  } catch (e) {
    try {
      await Linking.openURL(fallback);
    } catch (e2) {
      Alert.alert('Cannot open maps', 'No maps app is available on this device.');
    }
  }
}
