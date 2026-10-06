import axios from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { BASE_URL } from '../services/apiClient';
import { kvCache } from '../storage/kvCache';
import { connectivityBus } from './connectivityBus';
import { createModel, reduce, pendingDelay } from '../offline/connectivityMachine';
import { connectivity as cfg } from '../offline/offlineConfig';

/**
 * connectivityStore: ONLINE / WEAK / OFFLINE for the whole app (see offline/connectivityMachine.js for the rules).
 *
 * Inputs: NetInfo (network type, 2G), a lightweight unauthenticated backend ping (GET /api/health), the outcome
 * of every API request (reported by the API client), and the "offline mode" test switch. isConnected alone is
 * not trusted: the ping decides whether the server is really reachable.
 *
 * Use getState() anywhere (also in background tasks), or useConnectivity() in components.
 */
const FORCE_KEY = 'settings:forceOffline';

let model = createModel();
let started = false;
let pingTimer = null;
let settleTimer = null;
let netUnsubscribe = null;
let lastPingMs = null;
const listeners = new Set();

const snapshot = () => ({
  state: model.state,
  reasons: model.reasons,
  since: model.since,
  forced: model.forced,
  lastPingMs,
  isOnline: model.state === 'ONLINE',
  isWeak: model.state === 'WEAK',
  isOffline: model.state === 'OFFLINE',
  netType: model.net.type,
});
let current = snapshot();

function notify() {
  const next = snapshot();
  const changed = next.state !== current.state || next.forced !== current.forced || next.lastPingMs !== current.lastPingMs || next.reasons.join() !== current.reasons.join();
  current = next;
  if (changed) listeners.forEach((fn) => fn(current));
}

function dispatch(event) {
  model = reduce(model, event, Date.now(), cfg);
  connectivityBus.setForcedOffline(model.forced);
  notify();
  scheduleSettle();
}

function scheduleSettle() {
  clearTimeout(settleTimer);
  const delay = pendingDelay(model, Date.now(), cfg);
  if (delay !== null) settleTimer = setTimeout(() => dispatch({ type: 'tick' }), delay + 50);
}

async function ping() {
  if (model.forced) return;
  const started = Date.now();
  try {
    await axios.get(`${BASE_URL}${cfg.pingPath}`, { timeout: cfg.pingTimeoutMs, headers: { 'Cache-Control': 'no-cache' } });
    const ms = Date.now() - started;
    lastPingMs = ms;
    dispatch({ type: 'ping', ok: true, ms });
  } catch (e) {
    dispatch({ type: 'ping', ok: false });
  }
}

function schedulePing() {
  clearTimeout(pingTimer);
  const wait = model.state === 'ONLINE' ? cfg.pingIntervalMs : cfg.pingIntervalDegradedMs;
  pingTimer = setTimeout(async () => {
    if (AppState.currentState === 'active') await ping();
    schedulePing();
  }, wait);
}

function onNetInfo(info) {
  dispatch({
    type: 'net',
    connected: info.isConnected,
    reachable: info.isInternetReachable,
    netType: info.type,
    generation: info.details && info.details.cellularGeneration ? info.details.cellularGeneration : null,
  });
  if (info.isConnected) ping(); // confirm with the backend as soon as a network appears / changes
}

export const connectivityStore = {
  /** Idempotent. Call once at app start. */
  async start() {
    if (started) return;
    started = true;
    connectivityBus.onRequest(({ ok, ms }) => dispatch({ type: 'request', ok, ms }));
    const forced = await kvCache.get(FORCE_KEY);
    if (forced && forced.value === true) {
      model = reduce(model, { type: 'force', value: true }, Date.now(), cfg);
      connectivityBus.setForcedOffline(true);
      notify();
    }
    netUnsubscribe = NetInfo.addEventListener(onNetInfo);
    AppState.addEventListener('change', (s) => {
      if (s === 'active') ping();
    });
    schedulePing();
  },

  stop() {
    started = false;
    clearTimeout(pingTimer);
    clearTimeout(settleTimer);
    netUnsubscribe && netUnsubscribe();
  },

  getState: () => current,

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** The "offline mode" test switch: forces OFFLINE behaviour (API calls fail as if there were no network). */
  async setForcedOffline(value) {
    await kvCache.set(FORCE_KEY, Boolean(value));
    dispatch({ type: 'force', value });
    if (!value) ping();
  },

  /** Force an immediate backend check (pull-to-refresh, Settings "Check connection"). */
  checkNow: ping,
};
