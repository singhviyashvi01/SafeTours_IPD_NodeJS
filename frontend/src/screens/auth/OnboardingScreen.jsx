import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme/theme';
import { useNavigation } from '@react-navigation/native';
export const OnboardingScreen = () => {
    const navigation = useNavigation();
    return (<Screen style={styles.container}>
      <View style={styles.content}>
        <Text variant="headlineLg" style={styles.title}>Your Safety,{"\n"}Our Priority.</Text>
        <Text variant="bodyLg" color={colors.textSecondary} style={styles.subtitle}>
          A serene, trustworthy environment for trip planning and navigation.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button title="Get Started" onPress={() => navigation.navigate('Signup')} style={styles.button}/>
        <Button title="Log In" variant="secondary" onPress={() => navigation.navigate('Login')}/>
      </View>
    </Screen>);
};
const styles = StyleSheet.create({
    container: {
        padding: spacing.containerMargin,
        justifyContent: 'space-between',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        marginBottom: spacing.md,
    },
    subtitle: {
        marginBottom: spacing.xxl,
    },
    footer: {
        paddingBottom: spacing.lg,
    },
    button: {
        marginBottom: spacing.md,
    },
});
