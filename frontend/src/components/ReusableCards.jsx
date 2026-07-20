import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, shapes, shadows, spacing } from '../theme/theme';

export const GlassCard = ({ children, style, padding = spacing.md, ...props }) => {
    return (
        <View style={[
            styles.glassCard,
            { padding },
            style
        ]} {...props}>
            {children}
        </View>
    );
};

export const InfoCard = ({ children, style, padding = spacing.md, ...props }) => {
    return (
        <View style={[
            styles.infoCard,
            { padding },
            style
        ]} {...props}>
            {children}
        </View>
    );
};

const styles = StyleSheet.create({
    glassCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: shapes.roundedLg,
        ...shadows.ambient,
    },
    infoCard: {
        backgroundColor: colors['surface-container-lowest'] || '#ffffff',
        borderRadius: shapes.roundedLg,
    }
});
