import * as Notifications from 'expo-notifications';
import { initialState, isInside, progressOf } from '../offline/deviceCore';
import { evaluateReadings } from '../offline/deviceGeofence';
import { riskCellStore } from '../storage/riskCellStore';
import { deviceLogStore } from '../storage/deviceLogStore';
import { getClientConfig } from '../services/clientConfig';
import { cell9 } from './geo';

/**
 * On-device geofence check: the SAME state machine as the server (shared deviceCore.js), fed with cached
 * risk cells. Used when the phone is OFFLINE (or the server cannot be reached).
 *
 * What it does:  updates the device state machine, records the reading and any events locally (uploaded by
 *                phase 6B), shows a LOCAL notification when the user enters a danger zone.
 * What it never does: create a server SOS or a safety check (there is no server to run the 30 s countdown
 *                and the contacts cannot be reached). The user just gets the alert.
 * A cell missing from the cache is "no data": shown as such, never safe, never danger.
 */
const STATE_KEY = 'geofence';
let state = null;
let lastResult = null;

async function loadState() {
  if (!state) state = (await deviceLogStore.getState(STATE_KEY)) || initialState();
  return state;
}

async function notifyEnter(event) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'You entered a high-risk area',
        body: `${event.message || 'Stay alert.'} (offline check; no SOS was sent)`,
        data: { type: 'OFFLINE_GEOFENCE', h3Index: event.h3Index },
        sound: true,
        ...(Notifications.AndroidNotificationPriority ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
      },
      trigger: { channelId: 'geofence' }, // immediate; channelId routes it on Android
    });
  } catch (e) {
    console.warn('[deviceGeofence] local notification failed:', e.message);
  }
}

/**
 * @param {{coords:{latitude,longitude,accuracy}, timestamp:number}} location expo-location reading
 * @returns {Promise<Object>} a result shaped like the server's POST /geofence/check, plus source:'device'
 */
export async function runDeviceCheck(location) {
  const c = location.coords;
  const cfg = getClientConfig();
  const ts = location.timestamp || Date.now();
  const h3Index = cell9(c.latitude, c.longitude);

  const current = await loadState();
  const out = await evaluateReadings(
    current,
    [{ h3Index, timestamp: ts, accuracy: c.accuracy ?? undefined, latitude: c.latitude, longitude: c.longitude }],
    { getCell: (h3) => riskCellStore.getCell(h3), clientConfig: cfg }
  );

  if (out.accepted > 0) {
    state = out.state;
    await deviceLogStore.setState(STATE_KEY, state);
    await deviceLogStore.addReading({ ts, lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, h3: h3Index });
    for (const e of out.events) {
      await deviceLogStore.addEvent({ ts: e.timestamp, event: e.event, h3: e.h3Index, level: e.riskLevel, score: e.totalRisk, message: e.message, lat: c.latitude, lng: c.longitude });
      if (e.event === 'ENTER' && !e.historical) await notifyEnter(e);
    }
  }

  const status = out.accepted > 0 ? 'OK' : out.skipped.lowAccuracy > 0 ? 'LOW_ACCURACY' : 'STALE_READING';
  const last = out.last;
  const noData = Boolean(last && last.risk && last.risk.noData);
  lastResult = {
    source: 'device',
    status,
    journeyActive: true,
    event: last ? last.event : 'NONE',
    phase: state.phase,
    insideDangerZone: isInside(state),
    riskLevel: state.lastLevel || 'UNKNOWN',
    totalRisk: state.lastScore ?? null,
    dataConfidence: last ? last.risk.dataConfidence : null,
    lowConfidence: last ? last.risk.lowConfidence : null,
    noData,
    h3Index: state.currentH3,
    zoneId: null,
    message: status === 'LOW_ACCURACY'
      ? `GPS accuracy is too low (limit ${cfg.geofence.accuracyMaxMeters} m); reading ignored`
      : noData
        ? 'No cached risk data for this spot (offline). Download this area while online.'
        : last && last.message ? last.message : 'Offline check',
    progress: last ? last.progress : progressOf(state, Date.now(), cfg.geofence),
    accuracyMaxMeters: cfg.geofence.accuracyMaxMeters,
    promptDecision: 'offline_no_server',
    safetyCheck: null,
  };
  return lastResult;
}

export const getLastDeviceResult = () => lastResult;

/** Forget the on-device state (used by "Clear cache"). */
export function resetDeviceGeofence() {
  state = null;
  lastResult = null;
}
