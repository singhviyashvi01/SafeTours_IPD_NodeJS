import React from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, shapes, shadows } from '../theme/theme';
import { Text } from './Text';
export const Button = ({ title, variant = 'primary', isLoading = false, style, disabled, ...props }) => {
    const getContainerStyle = () => {
        switch (variant) {
            case 'primary':
                return styles.primaryContainer;
            case 'secondary':
                return styles.secondaryContainer;
            case 'sos':
                return styles.sosContainer;
            default:
                return styles.primaryContainer;
        }
    };
    const getTextStyle = () => {
        switch (variant) {
            case 'primary':
            case 'sos':
                return styles.primaryText;
            case 'secondary':
                return styles.secondaryText;
            default:
                return styles.primaryText;
        }
    };
    return (<TouchableOpacity style={[
            styles.baseContainer,
            getContainerStyle(),
            disabled && styles.disabledContainer,
            style,
        ]} disabled={disabled || isLoading} activeOpacity={0.8} {...props}>
      {isLoading ? (<ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.white}/>) : (<Text variant="labelLg" style={getTextStyle()}>{title}</Text>)}
    </TouchableOpacity>);
};
const styles = StyleSheet.create({
    baseContainer: {
        height: 48,
        borderRadius: shapes.roundedPill,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        flexDirection: 'row',
    },
    primaryContainer: {
        backgroundColor: colors.primary,
    },
    secondaryContainer: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: colors.primary,
    },
    sosContainer: {
        backgroundColor: colors.alertAccent,
        ...shadows.ambient,
    },
    disabledContainer: {
        opacity: 0.5,
    },
    primaryText: {
        color: colors.white,
    },
    secondaryText: {
        color: colors.primary,
    },
});
