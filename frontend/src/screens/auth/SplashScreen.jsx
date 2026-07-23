import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing } from '../../theme/theme';
import { useNavigation } from '@react-navigation/native';

export const SplashScreen = ({ isRestoring = false }) => {
    let navigation = null;
    try {
        navigation = useNavigation();
    } catch (e) {
        // Rendered outside NavigationContainer in RootNavigator during initial restore
        navigation = null;
    }

    useEffect(() => {
        if (!isRestoring && navigation && navigation.replace) {
            const timer = setTimeout(() => {
                navigation.replace('Login');
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [navigation, isRestoring]);

    return (
      <Screen style={styles.container} backgroundColor={colors.primary}>
        <View style={styles.content}>
          <Text variant="headlineLg" color={colors.white} style={styles.title}>SafeTours</Text>
          <Text variant="bodyLg" color={colors.white}>Guardian Flow</Text>
          <ActivityIndicator size="small" color={colors.white} style={styles.loader} />
        </View>
      </Screen>
    );
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
        marginBottom: spacing.xs,
    },
    loader: {
        marginTop: spacing.xl,
    },
});

