import * as Location from 'expo-location';
import { locationBus } from './locationBus';
import { geofenceManager } from './geofenceManager';

/**
 * One foreground GPS watch for the whole app. Each fix is published on the locationBus (nearby services,
 * maps) and offered to the geofence manager (which throttles what it sends to the backend).
 * ensureWatching() is idempotent and never prompts: it starts only if foreground permission is already
 * granted. Screens call it right after they obtain permission.
 */
let subscription = null;
let starting = false;

export async function ensureWatching() {
  if (subscription || starting) return true;
  starting = true;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return false;

    // A fast first position so dependent features can start before the first GPS fix.
    const known = await Location.getLastKnownPositionAsync().catch(() => null);
    if (known) locationBus.publish(known);

    subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 25 },
      (loc) => {
        locationBus.publish(loc);
        geofenceManager.submit(loc);
      }
    );
    return true;
  } catch (error) {
    console.log('[locationWatcher] not started:', error.message);
    return false;
  } finally {
    starting = false;
  }
}

export function stopWatching() {
  subscription?.remove();
  subscription = null;
}
