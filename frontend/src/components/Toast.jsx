import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from './Text';
import { colors, spacing, shapes, shadows } from '../theme/theme';

export const Toast = ({ message, type = 'error', onDismiss, duration = 4000 }) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      if (onDismiss) onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  const isError = type === 'error';
  const backgroundColor = isError ? colors.errorContainer || '#ffdad6' : '#d4edda';
  const textColor = isError ? colors.error || '#ba1a1a' : '#155724';
  const borderColor = isError ? colors.alertAccent || '#ba1a1a' : '#c3e6cb';

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onDismiss}
      style={[
        styles.container,
        { backgroundColor, borderColor },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.text, { color: textColor }]}>{message}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    padding: spacing.md,
    borderRadius: shapes.roundedMd,
    borderWidth: 1,
    ...shadows.ambient,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});
