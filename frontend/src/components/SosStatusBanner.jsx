import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useOutbox } from '../context/OutboxContext';
import { useConnectivity } from '../context/ConnectivityContext';
import { navigationRef } from '../navigation/navigationRef';
import { smsSummary } from '../offline/smsLogic';

/**
 * Persistent banner while an SOS has not reached the server: "SOS pending: no signal".
 * It stays on every screen until the SOS is delivered, rejected or cancelled, and says what was and was not done.
 */
export const SosStatusBanner = () => {
  const insets = useSafeAreaInsets();
  const { sos } = useOutbox();
  const conn = useConnectivity();
  const pending = sos.filter((s) => s.view.pendingNoSignal);
  if (pending.length === 0) return null;

  const latest = pending[0];
  const sms = latest.row.payload && latest.row.payload.sms;
  const title = conn.state === 'OFFLINE' ? 'SOS pending: no signal' : conn.state === 'WEAK' ? 'SOS pending: weak signal' : 'SOS pending: uploading';
  const line = sms && sms.outcome ? smsSummary(sms) : 'No text sent yet';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.banner, { paddingTop: insets.top + 6 }]}
      onPress={() => navigationRef.isReady() && navigationRef.navigate('SOS')}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}. Tap for details.`}
    >
      <Ionicons name="cloud-offline" size={18} color="#fff" />
      <View style={{ flex: 1 }}>
        <Text variant="labelLg" style={styles.title}>{title}</Text>
        <Text variant="labelSm" style={styles.line}>{line}. Will upload automatically. Tap for details.</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, elevation: 20, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#B3261E', paddingHorizontal: 14, paddingBottom: 8 },
  title: { color: '#fff', fontWeight: 'bold' },
  line: { color: '#fff', opacity: 0.95 },
});
