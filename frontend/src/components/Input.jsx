import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { useController } from 'react-hook-form';
import { colors, spacing, shapes, typography } from '../theme/theme';
import { Text } from './Text';
export const Input = ({ label, name, rules, defaultValue, control, style, ...props }) => {
    const { field, fieldState } = useController({ name, control, rules, defaultValue });
    return (<View style={styles.container}>
      {label && <Text variant="labelMd" style={styles.label}>{label}</Text>}
      <TextInput style={[
            styles.input,
            fieldState.error && styles.inputError,
            style
        ]} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholderTextColor={colors.textSecondary} {...props}/>
      {fieldState.error && (<Text variant="labelMd" style={styles.errorText}>
          {fieldState.error.message}
        </Text>)}
    </View>);
};
const styles = StyleSheet.create({
    container: {
        marginBottom: spacing.md,
    },
    label: {
        marginBottom: spacing.xs,
        color: colors.textSecondary,
    },
    input: {
        height: 48,
        backgroundColor: colors.surface,
        borderRadius: shapes.roundedMd,
        paddingHorizontal: spacing.md,
        color: colors.textPrimary,
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.bodyMd,
        borderWidth: 1,
        borderColor: colors.surfaceVariant,
    },
    inputError: {
        borderColor: colors.emergency,
    },
    errorText: {
        color: colors.emergency,
        marginTop: spacing.xs,
    },
});
