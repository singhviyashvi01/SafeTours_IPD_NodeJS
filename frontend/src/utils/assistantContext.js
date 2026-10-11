import * as Location from 'expo-location';
import { locationBus } from './locationBus';
import { cachedRiskAt } from '../services/riskCache';
import { loadNearby } from '../services/nearby';
import { getClientConfig } from '../services/clientConfig';

/**
 * The context object of offline/assistantRules.js, built from what the phone has:
 *   - the live dashboard values (Home), or
 *   - the offline caches (risk cells in SQLite, nearby places, last known position).
 * Nothing here calls the AI.
 */

/** Nearest `perType` places of each type from a flat, distance-sorted list. */
export function nearestByType(places, perType = 2) {
  const nearest = {};
  for (const p of places || []) {
    nearest[p.type] = nearest[p.type] || [];
    if (nearest[p.type].length < perType) nearest[p.type].push({ name: p.name || null, distance: Number.isFinite(p.distance) ? p.distance : null, phone: p.phone || null, openNow: null });
  }
  return nearest;
}

/** A risk view (server publicView or the device view of riskCache) -> the rules' risk shape. */
export function riskForRules(r) {
  if (!r) return null;
  return {
    level: r.riskLevel || 'UNKNOWN',
    score: r.totalRiskScore ?? null,
    topFactor: r.topFactor || null,
    dataConfidence: r.dataConfidence ?? null,
    demo: Boolean(r.demo),
    lowConfidence: Boolean(r.lowConfidence),
    reasons: r.lowConfidenceReasons || [],
    notes: r.notes || [],
    missing: r.missing || [],
    stale: r.stale || [],
  };
}

/**
 * @param {{risk?:Object, weather?:Object, places?:Array, nearbyState?:string, nearbyStale?:boolean, source?:string, fetchedAt?:number|string, communityCount?:number|null}} p
 */
export function contextFromParts({ risk, weather, places, nearbyState, nearbyStale, source = 'server', fetchedAt = null, communityCount = null }) {
  return {
    source,
    fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null,
    risk: riskForRules(risk),
    weather: weather
      ? { temperature: weather.temperature ?? null, description: weather.weatherDescription || null, rainMmPerHour: weather.rainMmPerHour ?? null, stale: Boolean(weather.stale) }
      : null,
    nearby: nearbyState && nearbyState !== 'none' ? { status: 'ok', stale: Boolean(nearbyStale), nearest: nearestByType(places) } : null,
    journey: null,
    community: Number.isFinite(communityCount) ? { count: communityCount } : null,
  };
}

/** Best known position: the shared GPS, else the last fix the OS has. Never invented. */
export async function currentPosition() {
  const last = locationBus.getLast();
  if (last) return { latitude: last.latitude, longitude: last.longitude, accuracy: last.accuracy ?? null, timestamp: last.timestamp };
  try {
    const known = await Location.getLastKnownPositionAsync();
    if (known) return { latitude: known.coords.latitude, longitude: known.coords.longitude, accuracy: known.coords.accuracy ?? null, timestamp: known.timestamp };
  } catch (e) {
    /* no permission */
  }
  return null;
}

/** Offline context: cached risk cell + cached nearby places. Weather and community are not cached. */
export async function buildLocalContext(position) {
  if (!position) return { source: 'device', fetchedAt: null, risk: null, weather: null, nearby: null, journey: null, community: null };
  const risk = await cachedRiskAt(position.latitude, position.longitude);
  let nearby = { state: 'none', places: [], stale: true };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    nearby = await loadNearby({ lat: position.latitude, lng: position.longitude, signal: ctl.signal });
    clearTimeout(timer);
  } catch (e) {
    /* aborted or no cache: nearby stays empty */
  }
  const ctx = contextFromParts({ risk, weather: null, places: nearby.places, nearbyState: nearby.state, nearbyStale: true, source: 'device', fetchedAt: risk ? risk.fetchedAt : null });
  // The thresholds used to rate cells offline come from the same cached server config.
  ctx.configAge = getClientConfig() ? 'cached' : null;
  return ctx;
}
