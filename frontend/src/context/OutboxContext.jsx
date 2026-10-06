import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useConnectivity } from './ConnectivityContext';
import { outboxRunner } from '../services/outboxRunner';
import { sosDispatcher, getSosRows } from '../services/sosDispatcher';
import { contactsCache } from '../services/contactsCache';
import { profileService } from '../services/profile';
import { sosView } from '../offline/smsLogic';

/**
 * OutboxContext: starts the outbox runner and the SOS dispatcher once, and exposes
 *   summary  { waiting, dead, failed, sosLive, lastSyncAt, byType, running, ... }  for Home and Settings
 *   sos      [{ row, view }]  the SOS rows (newest first) with what the screen may say about each (sosView)
 * It also keeps the offline copies the SOS text needs (emergency contacts, name, custom text) fresh while online.
 */
const empty = { waiting: 0, dead: 0, failed: 0, sosLive: 0, lastSyncAt: null, byType: {}, running: false };
const OutboxContext = createContext({ summary: empty, sos: [], refresh: async () => {} });
export const useOutbox = () => useContext(OutboxContext);

const REFRESH_COPIES_MS = 60 * 60 * 1000;

export const OutboxProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const conn = useConnectivity();
  const [summary, setSummary] = useState(empty);
  const [sos, setSos] = useState([]);
  const lastCopies = useRef(0);

  const loadSos = useCallback(async () => {
    const rows = await getSosRows();
    setSos(rows.map((row) => ({ row, view: sosView(row) })));
  }, []);

  useEffect(() => {
    outboxRunner.start();
    sosDispatcher.start();
    const offRunner = outboxRunner.subscribe((s) => {
      setSummary(s);
      loadSos();
    });
    const offDispatcher = sosDispatcher.subscribe(loadSos);
    loadSos();
    return () => {
      offRunner();
      offDispatcher();
    };
  }, [loadSos]);

  // While online, keep the contacts / name / custom text that the offline SOS text uses up to date.
  useEffect(() => {
    if (!isAuthenticated || conn.state !== 'ONLINE') return;
    if (Date.now() - lastCopies.current < REFRESH_COPIES_MS) return;
    lastCopies.current = Date.now();
    contactsCache.refresh();
    profileService.getProfile().catch(() => {});
  }, [isAuthenticated, conn.state]);

  const refresh = useCallback(async () => {
    await outboxRunner.refresh();
    await loadSos();
  }, [loadSos]);

  const value = useMemo(() => ({ summary, sos, refresh }), [summary, sos, refresh]);
  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
};
