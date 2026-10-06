import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors, spacing, shapes } from '../theme/theme';
import { formatAge, formatDistance } from '../utils/geo';
import { callNumber, openDirections, sanitizePhone } from '../utils/placeActions';
import { NEARBY_TYPES } from '../services/nearby';

export const typeMeta = (key) => NEARBY_TYPES.find((t) => t.key === key) || { key, label: key, icon: 'location', color: colors.primary };

/** One honest line about where the data comes from and how old it is. */
export const nearbyStatusText = (n) => {
  if (n.loading && n.places.length === 0) return 'Looking up nearby help...';
  if (n.state === 'none') return n.error?.status === 0 ? 'No data for this area (you are offline)' : 'No data for this area';
  if (n.state === 'cached') {
    const age = n.cachedAt ? formatAge(Date.now() - new Date(n.cachedAt).getTime()) : '';
    return `Offline data${age ? `, updated ${age}` : ''}`;
  }
  if (n.status === 'seed') return 'Limited data: locations only, no names or phone numbers';
  if (n.stale || n.status === 'partial') return 'Some of this data is outdated or incomplete';
  const ageMs = n.cachedAt ? Date.now() - new Date(n.cachedAt).getTime() : 0;
  return ageMs > 2 * 3600 * 1000 ? `Updated ${formatAge(ageMs)}` : null;
};

export const NearbyStatusLine = ({ nearby, style }) => {
  const text = nearbyStatusText(nearby);
  if (!text) return null;
  const warn = nearby.state !== 'live' || nearby.stale;
  return (
    <View style={[styles.statusRow, style]}>
      <Ionicons name={nearby.state === 'cached' ? 'cloud-offline-outline' : 'information-circle-outline'} size={14} color={warn ? colors.error : colors['on-surface-variant']} />
      <Text variant="labelSm" color={warn ? colors.error : colors['on-surface-variant']}>{text}</Text>
    </View>
  );
};

export const OpenChip = ({ openNow }) => {
  if (openNow === null || openNow === undefined) return null; // unknown stays unknown
  return (
    <View style={[styles.chip, { backgroundColor: openNow ? '#dcfce7' : '#fee2e2' }]}>
      <Text variant="labelSm" style={{ color: openNow ? '#166534' : '#991b1b', fontWeight: '700' }}>{openNow ? 'Open now' : 'Closed'}</Text>
    </View>
  );
};

/** Row for one place: name, type, distance, open status, and Call (only with a number) + Directions. */
export const PlaceRow = ({ place, compact = false, onPress }) => {
  const meta = typeMeta(place.type);
  const title = place.name || `${place.typeLabel || meta.label} (name unknown)`;
  const canCall = Boolean(sanitizePhone(place.phone));
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} style={styles.row}>
      <View style={[styles.icon, { backgroundColor: `${meta.color}22` }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="labelLg" style={{ fontWeight: 'bold' }} numberOfLines={1}>{title}</Text>
        <View style={styles.metaRow}>
          <Text variant="labelMd" color={colors['on-surface-variant']}>{formatDistance(place.distance)} · {meta.label}</Text>
          <OpenChip openNow={place.openNow} />
        </View>
        {!compact && place.address ? <Text variant="labelSm" color={colors['on-surface-variant']} numberOfLines={1}>{place.address}</Text> : null}
      </View>
      <View style={styles.actions}>
        {canCall && (
          <TouchableOpacity style={[styles.actionBtn, styles.callBtn]} onPress={() => callNumber(place.phone)} accessibilityLabel={`Call ${title}`}>
            <Ionicons name="call" size={18} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.actionBtn} onPress={() => openDirections({ lat: place.lat, lng: place.lng, name: title })} accessibilityLabel={`Directions to ${title}`}>
          <Ionicons name="navigate" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

export const FilterChips = ({ types, value, onChange }) => (
  <View style={styles.filters}>
    {[{ key: 'all', label: 'All' }, ...types].map((t) => (
      <TouchableOpacity key={t.key} style={[styles.filterChip, value === t.key && styles.filterChipActive]} onPress={() => onChange(t.key)}>
        <Text variant="labelMd" color={value === t.key ? colors['on-primary'] : colors['on-surface-variant']}>{t.label}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-container-low'], borderWidth: 1, borderColor: colors['outline-variant'] },
  callBtn: { backgroundColor: '#1b8a3a', borderColor: '#1b8a3a' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: spacing.sm },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: shapes.roundedPill, backgroundColor: colors['surface-container-high'] || colors['surface-container'] },
  filterChipActive: { backgroundColor: colors.primary },
});
