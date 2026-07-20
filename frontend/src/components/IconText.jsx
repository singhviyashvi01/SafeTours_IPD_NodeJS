import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from './Text';
import { colors, spacing } from '../theme/theme';
export const IconText = ({ icon, text, iconColor = colors.textPrimary, textColor = colors.textPrimary, iconSize = 20, textVariant = 'bodyMd', style, }) => {
    return (<View style={[styles.container, style]}>
      <Feather name={icon} size={iconSize} color={iconColor}/>
      <Text variant={textVariant} color={textColor} style={styles.text}>
        {text}
      </Text>
    </View>);
};
const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    text: {
        marginLeft: spacing.sm,
    }
});
