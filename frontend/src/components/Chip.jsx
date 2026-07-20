import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { colors, shapes, spacing } from '../theme/theme';
export const Chip = ({ label, variant = 'default', style }) => {
    const getColors = () => {
        switch (variant) {
            case 'success':
                return { bg: '#D1FAE5', text: '#065F46' }; // Using generic green
            case 'warning':
                return { bg: '#FEF3C7', text: '#92400E' }; // Using generic yellow
            case 'error':
                return { bg: colors.alertBackground, text: colors.alertAccent };
            default:
                return { bg: colors.surfaceVariant, text: colors.textPrimary };
        }
    };
    const { bg, text } = getColors();
    return (<View style={[styles.container, { backgroundColor: bg }, style]}>
      <Text variant="labelMd" color={text} weight="semiBold">{label}</Text>
    </View>);
};
const styles = StyleSheet.create({
    container: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: shapes.roundedSm,
        alignSelf: 'flex-start',
    }
});
