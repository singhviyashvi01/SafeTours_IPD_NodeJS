import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, TouchableOpacity, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Text } from '../components/Text';
import { useAuth } from './AuthContext';
import { sosService } from '../services/sos';
import { geofenceManager } from '../utils/geofenceManager';
import { registerForPush, addNotificationListeners } from '../services/pushNotifications';

/**
 * SafetyCheckProvider
 *  - shows the full-screen "Are you safe?" / "Are you okay?" prompt (with countdown, vibration and an
 *    alarm sound) whenever the SERVER has a pending safety check for the user. The server owns the
 *    deadline and escalates by itself, so this screen is only a way to answer in time
 *  - finds the check by push (when available) AND by polling GET /api/sos/pending every 5 s while the
 *    app is open (the fallback that works in Expo Go and without a push token)
 *  - registers the Expo push token after login
 *  - runs the foreground location watch that feeds the backend geofence check
 */
const SafetyCheckContext = createContext({ pendingCheck: null, refresh: async () => {} });
export const useSafetyCheck = () => useContext(SafetyCheckContext);

const POLL_MS = 5000;
const EXTEND_OPTIONS = [15, 30, 60];

export const SafetyCheckProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [check, setCheck] = useState(null); // { id, triggerSource, riskLevel, deadlineAt }
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [escalated, setEscalated] = useState(false);
  const answeredRef = useRef(false);
  const checkRef = useRef(null);
  const playerRef = useRef(null);

  const applyPending = useCallback((rec) => {
    if (!rec) {
      // The check vanished without us answering it: the server escalated it.
      if (checkRef.current && !answeredRef.current) setEscalated(true);
      setCheck(null);
      return;
    }
    answeredRef.current = false;
    setEscalated(false);
    setError(null);
    setCheck((prev) =>
      prev && prev.id === rec.id
        ? prev
        : {
            id: rec.id || rec._id,
            triggerSource: rec.triggerSource,
            riskLevel: rec.riskLevel,
            // Use the server's secondsLeft (not its clock) so a wrong device clock cannot matter.
            deadlineAt: Date.now() + (rec.secondsLeft ?? 60) * 1000,
          }
    );
  }, []);

  useEffect(() => {
    checkRef.current = check;
  }, [check]);

  const refresh = useCallback(async () => {
    const res = await sosService.getPending();
    if (res.success) applyPending(res.data);
  }, [applyPending]);

  // Poll while signed in and the app is in the foreground.
  useEffect(() => {
    if (!isAuthenticated) {
      setCheck(null);
      return undefined;
    }
    refresh();
    let timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      clearInterval(timer);
      if (state === 'active') {
        refresh();
        timer = setInterval(refresh, POLL_MS);
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [isAuthenticated, refresh]);

  // Push: register the token, and refresh the moment a safety-check push arrives or is tapped.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    registerForPush().then((r) => {
      if (!r.ok) console.log('[push] not registered:', r.reason);
    });
    return addNotificationListeners({
      onNotification: (data) => {
        if (data?.type === 'SAFETY_CHECK' || data?.type === 'SOS') refresh();
      },
    });
  }, [isAuthenticated, refresh]);

  // Foreground location watch -> backend geofence check (throttled by geofenceManager).
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let sub = null;
    let cancelled = false;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 25 },
        (loc) => geofenceManager.submit(loc)
      );
    })().catch((e) => console.log('[geofence] watch not started:', e.message));

    const off = geofenceManager.on('result', (r) => {
      if (r?.safetyCheck) applyPending(r.safetyCheck);
    });
    return () => {
      cancelled = true;
      off();
      sub?.remove();
    };
  }, [isAuthenticated, applyPending]);

  // Countdown (from the deadline computed when the check was first seen).
  useEffect(() => {
    if (!check) return undefined;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((check.deadlineAt - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [check]);

  // Vibration + alarm sound while the prompt is visible.
  useEffect(() => {
    if (!check) return undefined;
    Vibration.vibrate([0, 700, 400, 700, 400], true);
    let player;
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true });
        player = createAudioPlayer(require('../../assets/sounds/alarm.wav'));
        player.loop = true;
        player.play();
        playerRef.current = player;
      } catch (e) {
        console.log('[safety-check] sound unavailable:', e.message);
      }
    })();
    return () => {
      Vibration.cancel();
      try {
        player?.pause();
        player?.remove();
      } catch (e) {
        /* already released */
      }
      playerRef.current = null;
    };
  }, [check?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = async (fn) => {
    if (!check || busy) return;
    setBusy(true);
    setError(null);
    answeredRef.current = true;
    const res = await fn();
    setBusy(false);
    if (res.success) {
      setCheck(null);
    } else {
      answeredRef.current = false;
      setError(
        res.error?.status === 0
          ? 'No connection: your answer could not be sent. If you do not answer in time, your contacts will be alerted. Tap again to retry.'
          : res.error?.message || 'Could not send your answer. Tap again to retry.'
      );
    }
  };

  const imSafe = (extendMinutes) => answer(() => sosService.cancel(check.id, { reason: 'User confirmed they are safe', extendMinutes }));
  const sendNow = () => answer(() => sosService.confirm(check.id));

  const isEta = check?.triggerSource === 'SHADOW_MODE';

  return (
    <SafetyCheckContext.Provider value={{ pendingCheck: check, refresh }}>
      {children}

      <Modal visible={Boolean(check)} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <View style={styles.screen}>
          <Ionicons name="warning" size={56} color="#fff" />
          <Text style={styles.title}>{isEta ? 'Are you okay?' : 'Are you safe?'}</Text>
          <Text style={styles.body}>
            {isEta
              ? 'You have not arrived by your expected time.'
              : `You are in a ${String(check?.riskLevel || 'high').toLowerCase()} risk area.`}
            {'\n'}Your emergency contacts will be alerted when the timer ends.
          </Text>

          <View style={styles.timer}>
            <Text style={styles.timerText}>{secondsLeft}</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={[styles.btn, styles.safe]} onPress={() => imSafe()} disabled={busy} accessibilityRole="button">
            <Text style={styles.btnText}>{isEta ? "I'M OKAY" : "I'M SAFE"}</Text>
          </TouchableOpacity>

          {isEta && (
            <View style={styles.extendRow}>
              {EXTEND_OPTIONS.map((m) => (
                <TouchableOpacity key={m} style={styles.extendChip} onPress={() => imSafe(m)} disabled={busy}>
                  <Text style={styles.extendText}>+{m} min</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={[styles.btn, styles.sos]} onPress={sendNow} disabled={busy} accessibilityRole="button">
            <Text style={styles.btnText}>SEND SOS NOW</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={escalated && !check} transparent animationType="fade" onRequestClose={() => setEscalated(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Ionicons name="alert-circle" size={40} color="#ba1a1a" />
            <Text style={styles.cardTitle}>SOS sent</Text>
            <Text style={styles.cardBody}>
              There was no answer in time, so your emergency contacts were alerted with your location. You can
              cancel it from the SOS screen if this was a mistake.
            </Text>
            <TouchableOpacity style={[styles.btn, styles.safe, { alignSelf: 'stretch' }]} onPress={() => setEscalated(false)}>
              <Text style={styles.btnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafetyCheckContext.Provider>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#b3261e', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  title: { color: '#fff', fontSize: 34, fontWeight: '800', textAlign: 'center' },
  body: { color: '#ffe9e6', fontSize: 16, textAlign: 'center', lineHeight: 22 },
  timer: { width: 120, height: 120, borderRadius: 60, borderWidth: 6, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  timerText: { color: '#fff', fontSize: 52, fontWeight: '800' },
  error: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.25)', padding: 10, borderRadius: 8, textAlign: 'center' },
  btn: { alignSelf: 'stretch', paddingVertical: 18, borderRadius: 14, alignItems: 'center' },
  safe: { backgroundColor: '#1b8a3a' },
  sos: { backgroundColor: '#5c0a05' },
  btnText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  extendRow: { flexDirection: 'row', gap: 10 },
  extendChip: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' },
  extendText: { color: '#fff', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#211a16' },
  cardBody: { fontSize: 15, color: '#54433b', textAlign: 'center' },
});
