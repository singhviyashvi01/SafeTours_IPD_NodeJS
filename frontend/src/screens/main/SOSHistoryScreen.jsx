import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { DataState } from '../../components/DataState';
import { sosService } from '../../services/sos';

import { colors, spacing, shapes } from '../../theme/theme';

export const SOSHistoryScreen = ({ navigation }) => {

  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    setItems(null);
    const result = await sosService.getHistory();
    if (result.success) {
      setItems(result.data || []);
    } else {
      // Services return formatted errors instead of throwing, so keep the
      // error visible and make DataState's retry button useful.
      setError(result.error?.message || 'Failed to load SOS history.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>

          <Text variant="headlineMd" style={styles.title}>SOS History</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {!items ? (
        <DataState loading={!error} error={error} onRetry={load} />
      ) : items.length === 0 ? (
        <DataState empty emptyText="No SOS events have been recorded." />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.map((item, index) => {
            const status = (item.status || 'ACTIVE').toUpperCase();
            const dateStr = item.createdAt || item.triggeredAt || item.timestamp;
            const timeFormatted = dateStr ? new Date(dateStr).toLocaleString() : 'Recent';
            
            let coordsStr = 'Location Captured';
            const coords = item.location?.location?.coordinates || item.location?.coordinates;
            if (Array.isArray(coords) && coords.length >= 2) {
              coordsStr = `${Number(coords[1]).toFixed(4)}° N, ${Number(coords[0]).toFixed(4)}° E`;
            }

            return (
              <View key={item._id || item.id || `sos-${index}`} style={styles.card}>
                <Ionicons name="warning" size={28} color={colors.error} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelLg" style={{ fontWeight: 'bold' }}>
                    SOS Event ({status})
                  </Text>
                  <Text color={colors['on-surface-variant']}>
                    Type: {item.triggerType || item.type || 'Manual'}
                  </Text>
                  <Text variant="labelMd" color={colors.outline}>
                    {coordsStr} • {timeFormatted}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: colors['surface-variant'],
  },
  title: {
    fontWeight: 'bold',
    color: colors.primary,
    flexShrink: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors['error-container'],
    borderRadius: shapes.roundedLg,
  },
});
