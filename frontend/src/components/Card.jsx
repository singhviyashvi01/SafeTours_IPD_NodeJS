import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, shapes, shadows, spacing } from '../theme/theme';
export const Card = ({ children, style, padding = spacing.md, isAlert = false, ...props }) => {
    return (<View style={[
            styles.card,
            { padding },
            isAlert && styles.alertCard,
            style
        ]} {...props}>
      {isAlert && <View style={styles.alertAccent}/>}
      {children}
    </View>);
};
const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: shapes.roundedLg,
        borderWidth: 1,
        borderColor: colors.surfaceVariant,
        ...shadows.ambient,
        overflow: 'hidden', // To ensure the alert accent doesn't spill over corners
    },
    alertCard: {
        backgroundColor: colors.alertBackground,
    },
    alertAccent: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: colors.alertAccent,
    },
});
