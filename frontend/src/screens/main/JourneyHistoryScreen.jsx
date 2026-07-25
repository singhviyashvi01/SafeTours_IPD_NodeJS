import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { DataState } from '../../components/DataState';
import { journeyService } from '../../services/journeys';
import { useSidebar } from '../../context/SidebarContext';
import { colors, spacing, shapes } from '../../theme/theme';

export const JourneyHistoryScreen = ({ navigation }) => {
  const { toggleDrawer } = useSidebar();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    setItems(null);
    try {
      const journeys = await journeyService.list();
      setItems(journeys);
    } catch (e) {
      setError(e?.message || 'Failed to load journey history.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleDrawer} accessibilityLabel="Open menu">
            <Ionicons name="menu" size={26} color={colors.primary} />
          </TouchableOpacity>
          <Text variant="headlineMd" style={styles.title}>Journey History</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {!items ? (
        <DataState loading={!error} error={error} onRetry={load} />
      ) : items.length === 0 ? (
        <DataState empty emptyText="No active or recorded journeys found." />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.map((item, index) => (
            <TouchableOpacity 
              key={item._id || item.id || `journey-${index}`} 
              style={styles.card} 
              onPress={() => navigation.navigate('LiveJourney')}
            >
              <Ionicons name="navigate-circle" size={28} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="labelLg" style={{ fontWeight: 'bold' }}>
                  Journey #{item._id ? item._id.substring(0, 8) : index + 1}
                </Text>
                <Text color={colors['on-surface-variant']}>
                  Status: {item.status || 'ACTIVE'}
                </Text>
                {item.expectedArrivalTime && (
                  <Text variant="labelMd" color={colors.outline}>
                    ETA: {new Date(item.expectedArrivalTime).toLocaleString()}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.outline} />
            </TouchableOpacity>
          ))}
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
    backgroundColor: colors['surface-container-low'],
    borderRadius: shapes.roundedLg,
    borderWidth: 1,
    borderColor: colors['surface-variant'],
  },
});
