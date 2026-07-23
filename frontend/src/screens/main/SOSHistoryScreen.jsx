import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { DataState } from '../../components/DataState';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { sosService } from '../../services/sos';
import { colors, shapes, spacing } from '../../theme/theme';

export const SOSHistoryScreen = ({ navigation }) => {
  const [items, setItems] = useState(null); const [error, setError] = useState('');
  // GET /sos/history returns every SOS state so the user can review active and closed alerts.
  const load = useCallback(async () => { setItems(null); setError(''); try { setItems(await sosService.history()); } catch (requestError) { setError(requestError.message); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return <Screen style={styles.container}><View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={colors.primary} /></TouchableOpacity><Text variant="headlineMd" style={styles.title}>SOS History</Text><View style={{ width: 24 }} /></View>{!items ? <DataState loading={!error} error={error} onRetry={load} /> : items.length === 0 ? <DataState empty emptyText="No SOS events have been recorded." /> : <ScrollView contentContainerStyle={styles.content}>{items.map(item => <View key={item._id || item.id} style={styles.card}><Ionicons name="warning" size={24} color={colors.error} /><View style={{ flex: 1 }}><Text variant="labelLg" style={{ fontWeight: 'bold' }}>SOS {item.status}</Text><Text color={colors['on-surface-variant']}>{item.type || 'manual'} {item.reason ? `• ${item.reason}` : ''}</Text><Text variant="labelMd" color={colors.outline}>{new Date(item.triggeredAt).toLocaleString()}</Text></View></View>)}</ScrollView>}</Screen>;
};
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.surface }, header: { padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors['surface-variant'] }, title: { fontWeight: 'bold', color: colors.primary }, content: { padding: spacing.lg, gap: spacing.md }, card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors['error-container'], borderRadius: shapes.roundedLg } });
