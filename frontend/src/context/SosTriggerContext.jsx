import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, TouchableOpacity, Vibration, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../components/Text';
import { useAuth } from './AuthContext';
import { kvCache } from '../storage/kvCache';
import { triggerSos } from '../services/sosDispatcher';
import { navigationRef } from '../navigation/navigationRef';
import { createPressDetector } from '../offline/pressDetector';
import { hardware as hwCfg, sos as sosCfg } from '../offline/offlineConfig';

/**
 * SosTriggerContext: the shared "start an SOS with a 3-second cancel window" for triggers that can fire by
 * accident (volume buttons, the notification shortcut). The on-screen SOS button keeps its own behaviour.
 *
 * Hardware trigger, honestly
 *   - It is FOREGROUND ONLY: triple press of a volume button while the app is open and in front.
 *     A JavaScript app cannot read volume buttons with the screen off, and Android/iOS give no hook for an app
 *     that is not running in front. The listener is therefore switched off whenever the app is not active.
 *   - Volume events only arrive when the volume actually changes: at maximum volume "up" does nothing and at
 *     zero "down" does nothing, so those presses are invisible to the app.
 *   - It is off by default (opt-in in Settings): three volume presses while using a map would otherwise start
 *     the countdown by accident.
 * Notification shortcut (Android): a sticky notification whose tap starts the same countdown. On a locked
 *     phone Android asks for the unlock first, and Android 14+ lets the user swipe it away (it is re-posted
 *     the next time the app starts).
 */
const KEY_HW = 'settings:hardwareTrigger';
const KEY_SHORTCUT = 'settings:sosShortcut';
const SHORTCUT_ID = 'sos-shortcut';

let VolumeManager = null;
try {
  // Native module of a development build; absent in Expo Go and on the web.
  // eslint-disable-next-line global-require
  VolumeManager = require('react-native-volume-manager').VolumeManager;
} catch (e) {
  VolumeManager = null;
}

const SosTriggerContext = createContext({ requestSos: () => {}, hardware: { supported: false, enabled: false, setEnabled: async () => {} }, shortcut: { supported: false, enabled: false, setEnabled: async () => {} }, counting: false });
export const useSosTrigger = () => useContext(SosTriggerContext);

const readFlag = async (key, fallback) => {
  const hit = await kvCache.get(key, { allowExpired: true });
  return hit && typeof hit.value === 'boolean' ? hit.value : fallback;
};

export const SosTriggerProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [countdown, setCountdown] = useState(null); // { source, left }
  const [hwEnabled, setHwEnabled] = useState(false);
  const [shortcutEnabled, setShortcutEnabled] = useState(false);
  const timerRef = useRef(null);
  const sourceRef = useRef(null);
  const detector = useRef(createPressDetector(hwCfg)).current;

  const stop = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    sourceRef.current = null;
    Vibration.cancel();
    setCountdown(null);
  }, []);

  const fire = useCallback(async (source) => {
    stop();
    if (navigationRef.isReady()) navigationRef.navigate('SOS');
    try {
      await triggerSos({ source, reason: source === 'hardware' ? 'SOS from the volume buttons.' : source === 'notification' ? 'SOS from the notification shortcut.' : 'SOS triggered.' });
    } catch (e) {
      console.warn('[sos] trigger failed:', e.message);
    }
  }, [stop]);

  /** Starts the cancel window; the SOS is created when it reaches zero. A second request while counting is ignored. */
  const requestSos = useCallback((source = 'manual') => {
    if (timerRef.current) return;
    sourceRef.current = source;
    let left = sosCfg.countdownSeconds;
    setCountdown({ source, left });
    Vibration.vibrate([0, 300, 200, 300, 200, 300], true);
    timerRef.current = setInterval(() => {
      left -= 1;
      if (left <= 0) fire(source);
      else setCountdown({ source, left });
    }, 1000);
  }, [fire]);

  // ── saved switches ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setHwEnabled(await readFlag(KEY_HW, false));
      setShortcutEnabled(await readFlag(KEY_SHORTCUT, false));
    })();
  }, []);

  // ── hardware: foreground only ──────────────────────────────────────────────
  useEffect(() => {
    if (!VolumeManager || !hwEnabled || !isAuthenticated) return undefined;
    let sub = null;
    const attach = () => {
      if (sub) return;
      sub = VolumeManager.addVolumeListener(() => {
        if (AppState.currentState !== 'active') return;
        if (detector.press(Date.now())) requestSos('hardware');
      });
    };
    const detach = () => {
      if (sub && sub.remove) sub.remove();
      sub = null;
      detector.reset();
    };
    if (AppState.currentState === 'active') attach();
    const appSub = AppState.addEventListener('change', (s) => (s === 'active' ? attach() : detach()));
    return () => {
      appSub.remove();
      detach();
    };
  }, [hwEnabled, isAuthenticated, requestSos, detector]);

  // ── notification shortcut (Android) ────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android' || !isAuthenticated) return undefined;
    (async () => {
      try {
        if (shortcutEnabled) {
          await Notifications.setNotificationChannelAsync('sos-shortcut', {
            name: 'SOS shortcut',
            importance: Notifications.AndroidImportance.LOW,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            sound: null,
            vibrationPattern: null,
          });
          await Notifications.scheduleNotificationAsync({
            identifier: SHORTCUT_ID,
            content: {
              title: 'SafeTours SOS',
              body: 'Tap to start an SOS. You get 3 seconds to cancel.',
              data: { type: 'SOS_SHORTCUT' },
              sticky: true,
              autoDismiss: false,
            },
            trigger: { channelId: 'sos-shortcut' },
          });
        } else {
          await Notifications.dismissNotificationAsync(SHORTCUT_ID).catch(() => {});
          await Notifications.cancelScheduledNotificationAsync(SHORTCUT_ID).catch(() => {});
        }
      } catch (e) {
        console.warn('[sos] shortcut notification failed:', e.message);
      }
    })();

    const handle = (response) => {
      const data = response && response.notification && response.notification.request.content.data;
      if (!data || data.type !== 'SOS_SHORTCUT') return;
      // Only a real tap reaches this listener. The 3-second cancel window still applies.
      requestSos('notification');
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [shortcutEnabled, isAuthenticated, requestSos]);

  const setHardware = useCallback(async (v) => {
    await kvCache.set(KEY_HW, Boolean(v));
    setHwEnabled(Boolean(v));
  }, []);
  const setShortcut = useCallback(async (v) => {
    await kvCache.set(KEY_SHORTCUT, Boolean(v));
    setShortcutEnabled(Boolean(v));
  }, []);

  const value = useMemo(
    () => ({
      requestSos,
      counting: Boolean(countdown),
      hardware: { supported: Boolean(VolumeManager), enabled: hwEnabled, setEnabled: setHardware },
      shortcut: { supported: Platform.OS === 'android', enabled: shortcutEnabled, setEnabled: setShortcut },
    }),
    [requestSos, countdown, hwEnabled, shortcutEnabled, setHardware, setShortcut]
  );

  return (
    <SosTriggerContext.Provider value={value}>
      {children}
      <Modal visible={Boolean(countdown)} animationType="fade" transparent statusBarTranslucent onRequestClose={stop}>
        <View style={styles.overlay}>
          <Ionicons name="warning" size={64} color="#fff" />
          <Text style={styles.title}>Sending SOS in {countdown ? countdown.left : 0}</Text>
          <Text style={styles.body}>
            {countdown && countdown.source === 'hardware' ? 'Triggered by the volume buttons.' : countdown && countdown.source === 'notification' ? 'Triggered from the notification.' : ''}
            {'\n'}Your contacts will be alerted. Cancel now if this was a mistake.
          </Text>
          <TouchableOpacity style={styles.cancel} onPress={stop} accessibilityRole="button" accessibilityLabel="Cancel SOS">
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SosTriggerContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(179,38,30,0.97)', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  title: { color: '#fff', fontSize: 30, fontWeight: 'bold', textAlign: 'center' },
  body: { color: '#fff', fontSize: 16, textAlign: 'center', opacity: 0.95 },
  cancel: { marginTop: 18, backgroundColor: '#fff', borderRadius: 999, paddingVertical: 18, paddingHorizontal: 60 },
  cancelText: { color: '#B3261E', fontSize: 22, fontWeight: 'bold', letterSpacing: 1 },
});
