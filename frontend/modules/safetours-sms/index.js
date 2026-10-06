import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * JS side of the local Android module (modules/safetours-sms). On iOS, in Expo Go, and on the web the native
 * module does not exist: `SafeToursSms` is null and callers must fall back to the composer (expo-sms).
 */
export const SafeToursSms = requireOptionalNativeModule('SafeToursSms');
