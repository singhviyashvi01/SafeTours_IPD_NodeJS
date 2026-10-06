import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { NearbyStatusLine } from './NearbyParts';
import { colors, spacing } from '../theme/theme';
import { useNearbyServices } from '../context/NearbyContext';
import { callNumber, openDirections, sanitizePhone } from '../utils/placeActions';
import { formatDistance } from '../utils/geo';

/**
 * SOS screen "Nearest help": one tap to call the nearest hospital and police station, or to get
 * directions when the place has no phone number. The national emergency number 112 is always there.
 */
const HelpButton = ({ place, fallbackLabel, icon, color }) => {
  if (!place) {
    return (
      <View style={[styles.btn, styles.btnEmpty]}>
        <Ionicons name={icon} size={20} color={colors.outline} />
        <Text variant="labelMd" color={colors['on-surface-variant']}>{fallbackLabel}: none found</Text>
      </View>
    );
  }
  const canCall = Boolean(sanitizePhone(place.phone));
  const title = place.name || place.typeLabel;
  return (
    <TouchableOpacity
      style={[styles.btn, { borderColor: color }]}
      onPress={() => (canCall ? callNumber(place.phone) : openDirections({ lat: place.lat, lng: place.lng, name: title }))}
      accessibilityLabel={canCall ? `Call ${title}` : `Directions to ${title}`}
    >
      <Ionicons name={canCall ? 'call' : 'navigate'} size={22} color={color} />
      <View style={{ flex: 1 }}>
        <Text variant="labelLg" style={{ fontWeight: 'bold' }} numberOfLines={1}>{title}</Text>
        <Text variant="labelSm" color={colors['on-surface-variant']}>{formatDistance(place.distance)} · {canCall ? 'tap to call' : 'tap for directions'}</Text>
      </View>
    </TouchableOpacity>
  );
};

export const NearestHelpStrip = () => {
  const n = useNearbyServices();
  if (!n) return null;
  return (
    <View style={styles.wrap}>
      <Text variant="labelLg" style={{ fontWeight: 'bold', marginBottom: spacing.xs }}>Nearest help</Text>
      <HelpButton place={n.nearestHospital} fallbackLabel="Hospital" icon="medkit" color="#c62828" />
      <HelpButton place={n.nearestPolice} fallbackLabel="Police" icon="shield" color="#1565c0" />
      <TouchableOpacity style={[styles.btn, { borderColor: colors.error, backgroundColor: colors['error-container'] }]} onPress={() => callNumber('112')} accessibilityLabel="Call 112">
        <Ionicons name="alert-circle" size={22} color={colors.error} />
        <View style={{ flex: 1 }}>
          <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Call 112</Text>
          <Text variant="labelSm" color={colors['on-surface-variant']}>National emergency number</Text>
        </View>
      </TouchableOpacity>
      <NearbyStatusLine nearby={n} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg, gap: spacing.sm },
  btn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 14, borderWidth: 1.5, backgroundColor: colors['surface-container-lowest'] },
  btnEmpty: { borderColor: colors['outline-variant'], borderStyle: 'dashed' },
});
