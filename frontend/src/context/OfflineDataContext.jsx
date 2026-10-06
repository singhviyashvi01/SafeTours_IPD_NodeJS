import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useConnectivity } from './ConnectivityContext';
import { locationBus } from '../utils/locationBus';
import { distanceMeters } from '../utils/geo';
import { loadClientConfig, refreshClientConfig } from '../services/clientConfig';
import { downloadRegion, ensureCurrentRegion, ensureDestinationRegion } from '../services/riskCache';
import { estimateNearbyDownload, prefetchNearbyArea } from '../services/nearby';
import { riskCellStore } from '../storage/riskCellStore';
import { kvCache } from '../storage/kvCache';
import { outboxStore } from '../storage/outboxStore';
import { databaseBytes } from '../storage/db';
import { resetDeviceGeofence } from '../utils/deviceGeofenceRunner';
import { bboxAround, estimateCells } from '../offline/cacheLogic';
import { riskCache as riskCfg, download as downloadCfg } from '../offline/offlineConfig';

/**
 * OfflineDataContext: keeps the offline caches filled while ONLINE and exposes what Settings needs
 * (real sizes and ages, "Download this area", Clear cache).
 *
 * Automatic prefetch (only when the connectivity state is ONLINE, never on WEAK/OFFLINE): the risk cells
 * around the user, at most once per prefetchMinIntervalMs unless the user moved > 1.5 km from the last
 * prefetch centre. Nearby places for the current cell are already cached by NearbyContext on every lookup.
 */
const REPREFETCH_DISTANCE_M = 1500;

const OfflineDataContext = createContext(null);
export const useOfflineData = () => useContext(OfflineDataContext);

const IDLE = { running: false, phase: null, done: 0, total: 0, result: null, error: null };

export const OfflineDataProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const conn = useConnectivity();
  const [stats, setStats] = useState(null);
  const [progress, setProgress] = useState(IDLE);
  const abortRef = useRef(null);
  const lastPrefetch = useRef({ at: 0, lat: null, lng: null });
  const busy = useRef(false);

  const refreshStats = useCallback(async () => {
    const [risk, kv, log, dbBytes] = await Promise.all([riskCellStore.stats(), kvCache.stats(), outboxStore.summary().catch(() => ({ waiting: 0, dead: 0, byType: {} })), databaseBytes()]);
    setStats({
      risk,
      nearby: kv.byPrefix?.nearby || { entries: 0, bytes: 0 },
      log,
      dbBytes,
      at: Date.now(),
    });
  }, []);

  // Startup: cached server config, purge expired rows, first stats.
  useEffect(() => {
    (async () => {
      await loadClientConfig();
      await riskCellStore.purgeExpired();
      await kvCache.purgeExpired();
      refreshStats();
    })();
  }, [refreshStats]);

  const online = isAuthenticated && conn.state === 'ONLINE';

  // Refresh the cached server thresholds when we become ONLINE (no-op while younger than a day).
  useEffect(() => {
    if (online) refreshClientConfig();
  }, [online]);

  // Automatic prefetch around the user.
  useEffect(() => {
    if (!online) return undefined;
    const consider = async (loc) => {
      if (!loc || busy.current) return;
      const p = lastPrefetch.current;
      const moved = p.lat === null ? Infinity : distanceMeters(p.lat, p.lng, loc.latitude, loc.longitude);
      if (Date.now() - p.at < riskCfg.prefetchMinIntervalMs && moved < REPREFETCH_DISTANCE_M) return;
      busy.current = true;
      lastPrefetch.current = { at: Date.now(), lat: loc.latitude, lng: loc.longitude };
      try {
        await ensureCurrentRegion(loc.latitude, loc.longitude, { force: moved >= REPREFETCH_DISTANCE_M });
      } catch (e) {
        lastPrefetch.current.at = 0; // retry on the next fix
      } finally {
        busy.current = false;
        refreshStats();
      }
    };
    const initial = locationBus.getLast();
    if (initial) consider(initial);
    return locationBus.subscribe(consider);
  }, [online, refreshStats]);

  /** Risk cells + nearby places for a journey's destination (called when a journey starts or loads). */
  const prepareDestination = useCallback(
    async (lat, lng, journeyId) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      try {
        await ensureDestinationRegion(lat, lng, journeyId);
        await prefetchNearbyArea({ lat, lng, radiusM: 0 }); // radius 0 = just the destination's own cell
      } catch (e) {
        console.warn('[offline] destination prefetch failed:', e.message);
      }
      refreshStats();
    },
    [refreshStats]
  );

  /** Numbers shown before the user confirms a download. */
  const estimate = useCallback((lat, lng, radiusM) => {
    const cells = estimateCells(bboxAround(lat, lng, radiusM));
    const places = estimateNearbyDownload(lat, lng, radiusM);
    return {
      cells,
      riskBytes: cells * riskCfg.rowBytesEstimate,
      nearbyCenters: places.centers,
      geoapifyCredits: places.creditsEstimate,
    };
  }, []);

  /** "Download this area": risk cells (fast) then nearby places (slower). */
  const downloadArea = useCallback(
    async (lat, lng, radiusM) => {
      if (progress.running) return null;
      const controller = new AbortController();
      abortRef.current = controller;
      setProgress({ ...IDLE, running: true, phase: 'risk' });
      try {
        const risk = await downloadRegion({
          lat,
          lng,
          radiusM,
          kind: 'manual',
          id: `manual:${Math.round(lat * 1000)}:${Math.round(lng * 1000)}:${radiusM}`,
          signal: controller.signal,
          onProgress: ({ done, total }) => setProgress({ ...IDLE, running: true, phase: 'risk', done, total }),
        });
        setProgress({ ...IDLE, running: true, phase: 'places' });
        const places = await prefetchNearbyArea({
          lat,
          lng,
          radiusM,
          signal: controller.signal,
          onProgress: ({ done, total }) => setProgress({ ...IDLE, running: true, phase: 'places', done, total }),
        });
        const result = { risk, places, aborted: places.aborted };
        setProgress({ ...IDLE, result });
        return result;
      } catch (e) {
        const aborted = controller.signal.aborted;
        setProgress({ ...IDLE, error: aborted ? null : e.message || 'Download failed', result: aborted ? { aborted: true } : null });
        return null;
      } finally {
        abortRef.current = null;
        refreshStats();
      }
    },
    [progress.running, refreshStats]
  );

  const cancelDownload = useCallback(() => abortRef.current && abortRef.current.abort(), []);

  /** Clears cached risk cells and nearby places. Settings, the server-config copy and the offline log (pending uploads) are kept. */
  const clearCache = useCallback(async () => {
    await riskCellStore.clear();
    await kvCache.clearPrefixes(['nearby']);
    lastPrefetch.current = { at: 0, lat: null, lng: null };
    resetDeviceGeofence();
    await refreshStats();
  }, [refreshStats]);

  const value = useMemo(
    () => ({
      stats,
      refreshStats,
      progress,
      radiiM: downloadCfg.radiiM,
      estimate,
      downloadArea,
      cancelDownload,
      prepareDestination,
      clearCache,
    }),
    [stats, refreshStats, progress, estimate, downloadArea, cancelDownload, prepareDestination, clearCache]
  );

  return <OfflineDataContext.Provider value={value}>{children}</OfflineDataContext.Provider>;
};
