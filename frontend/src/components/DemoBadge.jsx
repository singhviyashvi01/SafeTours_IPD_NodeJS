import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';

/**
 * Shown wherever a risk value includes DEMO data (backend flag demo: true, from USE_DEMO_CRIME_DATA).
 * Demo values are randomised placeholders for presentations, not real measurements.
 */
export const DemoBadge = ({ style }) => (
    <View style={[styles.badge, style]} accessibilityLabel="Demo data">
        <Ionicons name="flask-outline" size={12} color="#92400e" />
        <Text variant="labelSm" style={styles.text}>Demo data</Text>
    </View>
);

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: '#fef3c7',
        borderWidth: 1,
        borderColor: '#f59e0b',
    },
    text: { color: '#92400e', fontWeight: '700' },
});
