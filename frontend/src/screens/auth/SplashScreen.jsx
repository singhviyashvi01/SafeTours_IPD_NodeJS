import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing } from '../../theme/theme';
import { useNavigation } from '@react-navigation/native';
export const SplashScreen = () => {
    const navigation = useNavigation();
    useEffect(() => {
        const timer = setTimeout(() => {
            navigation.replace('Login');
        }, 2000);
        return () => clearTimeout(timer);
    }, [navigation]);
    return (<Screen style={styles.container} backgroundColor={colors.primary}>
      <View style={styles.content}>
        <Text variant="headlineLg" color={colors.white} style={styles.title}>SafeTours</Text>
        <Text variant="bodyLg" color={colors.white}>Guardian Flow</Text>
      </View>
    </Screen>);
};
const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        alignItems: 'center',
    },
    title: {
        marginBottom: spacing.sm,
    },
});
