import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Text } from './Text';
import { InfoCard } from './ReusableCards';
import { colors, spacing, shapes } from '../theme/theme';
import { useNearbyServices } from '../context/NearbyContext';
import { contextFromParts } from '../utils/assistantContext';
import { homeTips } from '../offline/assistantRules';

/**
 * Home "safety recommendations": 2 to 3 short tips written by rules (offline/assistantRules.js, the same file the
 * server uses for its fallback) from the real risk, weather and nearby data already on screen. No AI call is
 * made when Home loads. Tapping a tip opens the assistant with that question.
 */
export const SafetyTips = ({ data }) => {
  const navigation = useNavigation();
  const nearby = useNearbyServices();

  const tips = useMemo(() => {
    if (!data || !data.risk) return [];
    const ctx = contextFromParts({
      risk: data.risk,
      weather: data.weather,
      places: nearby.places,
      nearbyState: nearby.state,
      nearbyStale: nearby.stale,
      source: data.source === 'device' ? 'device' : 'server',
      fetchedAt: data.fetchedAt,
    });
    return homeTips(ctx, 3);
  }, [data, nearby.places, nearby.state, nearby.stale]);

  if (tips.length === 0) return null;

  return (
    <InfoCard style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="bulb" size={18} color={colors.primary} />
        <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Safety tips for here</Text>
      </View>
      {tips.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={styles.tip}
          onPress={() => navigation.navigate('Assistant', { initialPrompt: t.prompt, promptId: `${t.id}-${Date.now()}` })}
          accessibilityRole="button"
          accessibilityLabel={`${t.title}. ${t.text}. Tap to ask the assistant.`}
        >
          <Ionicons name={t.icon} size={20} color={colors.primary} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text variant="labelLg" style={{ fontWeight: 'bold' }}>{t.title}</Text>
            <Text variant="bodyMd" color={colors['on-surface-variant']}>{t.text}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.outline} />
        </TouchableOpacity>
      ))}
    </InfoCard>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  tip: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors['outline-variant'], borderRadius: shapes.roundedMd },
});
