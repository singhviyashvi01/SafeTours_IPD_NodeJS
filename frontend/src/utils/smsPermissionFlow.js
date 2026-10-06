import { Alert, Platform } from 'react-native';
import { requestSmsPermission, smsPermissionStatus } from '../services/smsSender';

/**
 * Explains WHY the app wants the SEND_SMS permission, then shows the Android dialog.
 * Used from "first SOS setup" (after the first emergency contact is saved) and from Settings.
 * Resolves to 'granted' | 'denied' | 'undetermined' | 'unavailable' (iOS has no such permission) | 'skipped'.
 */
export function explainAndRequestSmsPermission() {
  if (Platform.OS !== 'android') return Promise.resolve('unavailable');
  return new Promise((resolve) => {
    Alert.alert(
      'Text your contacts when there is no internet?',
      'If you press SOS and the phone has no data connection, SafeTours can text your emergency contacts your location straight from this phone.\n\n' +
        'It sends texts only when you trigger an SOS (or press "Test SMS to myself" in Settings). Your plan\'s normal SMS charges apply. ' +
        'If you say no, SafeTours opens your messaging app with the text ready and you tap Send yourself.',
      [
        { text: 'Not now', style: 'cancel', onPress: async () => resolve((await smsPermissionStatus()) === 'granted' ? 'granted' : 'skipped') },
        { text: 'Continue', onPress: async () => resolve(await requestSmsPermission()) },
      ],
      { cancelable: false }
    );
  });
}

/** Asks once, only when the permission has never been asked about (used right after the first contact is saved). */
export async function offerSmsPermissionOnce() {
  if ((await smsPermissionStatus()) !== 'undetermined') return null;
  return explainAndRequestSmsPermission();
}
