import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, shadows, spacing } from '../theme/theme';
export const SOSButton = ({ onPress }) => {
    const pulseAnim = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        Animated.loop(Animated.sequence([
            Animated.timing(pulseAnim, {
                toValue: 1.1,
                duration: 1000,
                useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
            }),
        ])).start();
    }, [pulseAnim]);
    return (<Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
      <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.8}>
        <Feather name="alert-triangle" size={32} color={colors.white}/>
      </TouchableOpacity>
    </Animated.View>);
};
const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: spacing.xxl,
        right: spacing.containerMargin,
        zIndex: 100,
    },
    button: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.alertAccent,
        justifyContent: 'center',
        alignItems: 'center',
        ...shadows.ambient,
        shadowColor: colors.alertAccent, // Override shadow color for SOS
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    }
});
