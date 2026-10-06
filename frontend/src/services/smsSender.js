import { Platform, PermissionsAndroid } from 'react-native';
import * as SMS from 'expo-sms';
import { SafeToursSms } from '../../modules/safetours-sms';
import { kvCache } from '../storage/kvCache';

/**
 * Platform layer for the SOS text message. Decisions live in offline/smsLogic.js; this file only touches the OS.
 *
 * Android: SafeToursSms (our own small native module, modules/safetours-sms) sends directly with SmsManager and
 *          reports the radio's answer per contact. Needs the SEND_SMS permission.
 * iOS / no permission / no native module: the composer (expo-sms) opens prefilled and the user must tap Send.
 *          iOS reports 'sent' or 'cancelled'; Android reports only 'unknown'.
 */
const ASKED_KEY = 'settings:smsPermissionAsked';

const SEND_SMS = 'android.permission.SEND_SMS';

/** 'granted' | 'denied' | 'undetermined' | 'unavailable' (iOS: there is no such permission) */
export async function smsPermissionStatus() {
  if (Platform.OS !== 'android') return 'unavailable';
  try {
    if (await PermissionsAndroid.check(SEND_SMS)) return 'granted';
    const asked = await kvCache.get(ASKED_KEY, { allowExpired: true });
    return asked && asked.value ? 'denied' : 'undetermined';
  } catch (e) {
    return 'undetermined';
  }
}

/** Shows the Android permission dialog (explain WHY before calling this). Returns the new status. */
export async function requestSmsPermission() {
  if (Platform.OS !== 'android') return 'unavailable';
  try {
    const result = await PermissionsAndroid.request(SEND_SMS, {
      title: 'Allow SafeTours to send SOS texts',
      message:
        'In an emergency without internet, SafeTours can text your emergency contacts your location straight from this phone. ' +
        'Standard SMS charges from your plan may apply. It only sends when you trigger an SOS, or when you press "Test SMS to myself".',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    await kvCache.set(ASKED_KEY, true);
    return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
  } catch (e) {
    return 'denied';
  }
}

/** What this phone can do right now (input of smsLogic.planSms). */
export async function smsEnvironment() {
  let directAvailable = false;
  if (Platform.OS === 'android' && SafeToursSms) {
    try {
      directAvailable = await SafeToursSms.isAvailableAsync();
    } catch (e) {
      directAvailable = false;
    }
  }
  let composerAvailable = false;
  try {
    composerAvailable = await SMS.isAvailableAsync();
  } catch (e) {
    composerAvailable = false;
  }
  return { platform: Platform.OS, permission: await smsPermissionStatus(), directAvailable, composerAvailable };
}

/**
 * Sends `message` to every phone directly, in parallel. Resolves to [{phone, ok, error}]; ok is true only when
 * the radio confirmed every part of the message.
 */
export async function sendDirect(phones, message) {
  return Promise.all(
    phones.map(async (phone) => {
      try {
        const res = await SafeToursSms.sendTextAsync(phone, message);
        return { phone, ok: Boolean(res && res.ok), error: res && res.error ? res.error : undefined };
      } catch (e) {
        return { phone, ok: false, error: e.message || 'send failed' };
      }
    })
  );
}

/** Opens the composer prefilled; resolves to 'sent' | 'cancelled' | 'unknown' (expo-sms). */
export async function openComposer(phones, message) {
  const { result } = await SMS.sendSMSAsync(phones, message);
  return result;
}
