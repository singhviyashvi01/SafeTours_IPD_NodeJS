import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { loadNearby, NEARBY_TYPES } from '../services/nearby';
import { locationBus } from '../utils/locationBus';
import { cell8, distanceMeters } from '../utils/geo';

/**
 * NearbyProvider: ONE shared nearby-services lookup for the whole app (Home card, Nearby screen, Maps
 * markers, SOS strip), driven by the shared GPS (locationBus).
 *
 * Refresh rule: only when the user enters a new H3 res-8 cell or has moved more than 1 km from the last
 * lookup: never on every GPS tick. Lookups are debounced (1.5 s) and the previous in-flight request is
 * cancelled. A failed lookup is retried after 60 s.
 */
const NearbyContext = createContext(null);
export const useNearbyServices = () => useContext(NearbyContext);

const DEBOUNCE_MS = 1500;
const RETRY_MS = 60 * 1000;
const MOVE_THRESHOLD_M = 1000;

export const shouldRefresh = (last, coords) => {
  if (!last) return true;
  if (cell8(coords.latitude, coords.longitude) !== last.cell) return true;
  return distanceMeters(last.latitude, last.longitude, coords.latitude, coords.longitude) > MOVE_THRESHOLD_M;
};

export const NearbyProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [result, setResult] = useState({ loading: false, state: 'none', places: [], stale: true, cachedAt: null, status: null, source: null });
  const [filter, setFilter] = useState('all');

  const lastLookup = useRef(null); // { cell, latitude, longitude }
  const controller = useRef(null);
  const debounceTimer = useRef(null);
  const retryTimer = useRef(null);

  const run = useCallback(async (coords) => {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    clearTimeout(retryTimer.current);
    setResult((r) => ({ ...r, loading: true }));
    try {
      const out = await loadNearby({ lat: coords.latitude, lng: coords.longitude, signal: ctl.signal });
      if (ctl.signal.aborted) return;
      setResult({ loading: false, ...out });
      if (out.state !== 'live') retryTimer.current = setTimeout(() => run(coords), RETRY_MS);
    } catch (error) {
      if (axios.isCancel(error) || ctl.signal.aborted) return; // superseded by a newer lookup
      setResult((r) => ({ ...r, loading: false }));
      retryTimer.current = setTimeout(() => run(coords), RETRY_MS);
    }
  }, []);

  const consider = useCallback((coords, force = false) => {
    if (!force && !shouldRefresh(lastLookup.current, coords)) return;
    lastLookup.current = { cell: cell8(coords.latitude, coords.longitude), latitude: coords.latitude, longitude: coords.longitude };
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => run(coords), DEBOUNCE_MS);
  }, [run]);

  useEffect(() => {
    if (!isAuthenticated) {
      controller.current?.abort();
      clearTimeout(debounceTimer.current);
      clearTimeout(retryTimer.current);
      lastLookup.current = null;
      setResult({ loading: false, state: 'none', places: [], stale: true, cachedAt: null, status: null, source: null });
      return undefined;
    }
    const initial = locationBus.getLast();
    if (initial) consider(initial);
    const off = locationBus.subscribe((loc) => consider(loc));
    return () => {
      off();
      controller.current?.abort();
      clearTimeout(debounceTimer.current);
      clearTimeout(retryTimer.current);
    };
  }, [isAuthenticated, consider]);

  const refresh = useCallback(() => {
    const here = locationBus.getLast();
    if (here) consider(here, true);
  }, [consider]);

  const value = useMemo(() => {
    const visible = filter === 'all' ? result.places : result.places.filter((p) => p.type === filter);
    return {
      ...result,
      filter,
      setFilter,
      refresh,
      types: NEARBY_TYPES,
      visible,
      nearestHospital: result.places.find((p) => p.type === 'hospital') || null,
      nearestPolice: result.places.find((p) => p.type === 'police') || null,
    };
  }, [result, filter, refresh]);

  return <NearbyContext.Provider value={value}>{children}</NearbyContext.Provider>;
};
