import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { InfoCard } from './ReusableCards';
import { FilterChips, NearbyStatusLine, PlaceRow } from './NearbyParts';
import { colors, spacing } from '../theme/theme';
import { useNearbyServices } from '../context/NearbyContext';

/**
 * Home "Nearby Emergency Services": the nearest hospital and nearest police station first, then the
 * nearest few of the selected type. Everything is real data (or an honest empty/offline state).
 */
export const NearbyServicesCard = () => {
  const navigation = useNavigation();
  const n = useNearbyServices();
  if (!n) return null;

  const featured = [n.nearestHospital, n.nearestPolice].filter(Boolean);
  const rows = n.filter === 'all' ? featured : n.visible.slice(0, 4);
  const empty = !n.loading && n.places.length === 0;

  return (
    <InfoCard style={styles.card}>
      <View style={styles.header}>
        <Text variant="headlineSm" color={colors['on-surface']}>Nearby Emergency Services</Text>
        <View style={styles.headerActions}>
          {n.loading ? <ActivityIndicator size="small" color={colors.primary} /> : (
            <TouchableOpacity onPress={n.refresh} accessibilityLabel="Refresh nearby services">
              <Ionicons name="refresh" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FilterChips types={n.types} value={n.filter} onChange={n.setFilter} />

      {empty ? (
        <Text variant="bodyMd" color={colors['on-surface-variant']}>
          {n.state === 'none' ? 'No data for this area.' : 'Nothing of this type was found nearby.'}
        </Text>
      ) : (
        <>
          {n.filter === 'all' && featured.length === 0 && (
            <Text variant="bodyMd" color={colors['on-surface-variant']}>No hospital or police station found within 3 km.</Text>
          )}
          {rows.map((p) => <PlaceRow key={p.id} place={p} compact />)}
        </>
      )}

      <NearbyStatusLine nearby={n} />

      <TouchableOpacity style={styles.more} onPress={() => navigation.navigate('EmergencyServices')}>
        <Text variant="labelLg" color={colors.primary} style={{ fontWeight: 'bold' }}>See all nearby services</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </TouchableOpacity>
    </InfoCard>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg, borderWidth: 1, borderColor: colors['surface-variant'] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { minWidth: 24, alignItems: 'flex-end' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: spacing.sm },
});
