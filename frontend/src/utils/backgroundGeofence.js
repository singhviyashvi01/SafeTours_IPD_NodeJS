import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { geofenceManager } from './geofenceManager';

/**
 * Background geofence / Shadow Mode tracking (expo-task-manager + expo-location, SDK 54).
 *
 * The task is defined at module scope (required by TaskManager) and this file is imported from
 * index.js. It forwards each background reading to the same throttled backend geofence check; the
 * backend response says when no journey is active any more and the task stops itself.
 *
 * Limits: not available in Expo Go (Android: no TaskManager/foreground service; iOS: no background
 * execution): use a development build. Android needs ACCESS_BACKGROUND_LOCATION (a second prompt
 * after foreground permission) and shows a persistent notification while tracking.
 */
export const GEOFENCE_TASK = 'safetours-geofence-task';

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[backgroundGeofence] task error:', error.message);
    return;
  }
  const locations = data?.locations || [];
  const last = locations[locations.length - 1];
  if (!last) return;
  const out = await geofenceManager.submit(last);
  if (out?.data && out.data.journeyActive === false) {
    await stopBackgroundGeofence();
  }
});

export async function startBackgroundGeofence() {
  try {
    if (!(await TaskManager.isAvailableAsync())) return { started: false, reason: 'task-manager-unavailable (Expo Go?)' };

    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return { started: false, reason: 'foreground-permission-missing' };
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return { started: false, reason: 'background-permission-denied' };

    if (await Location.hasStartedLocationUpdatesAsync(GEOFENCE_TASK)) return { started: true, already: true };

    await Location.startLocationUpdatesAsync(GEOFENCE_TASK, {
      accuracy: Location.Accuracy.High, // readings above 50 m accuracy are ignored by the backend
      distanceInterval: 50,
      timeInterval: 30000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'SafeTours is watching over your journey',
        notificationBody: 'Checking for risky areas and your arrival time.',
        notificationColor: '#B3261E',
      },
    });
    return { started: true };
  } catch (error) {
    return { started: false, reason: error.message };
  }
}

export async function stopBackgroundGeofence() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(GEOFENCE_TASK)) {
      await Location.stopLocationUpdatesAsync(GEOFENCE_TASK);
    }
  } catch (error) {
    console.warn('[backgroundGeofence] stop failed:', error.message);
  }
}
