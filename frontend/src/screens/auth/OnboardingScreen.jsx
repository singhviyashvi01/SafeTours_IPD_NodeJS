import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme/theme';
import { useNavigation } from '@react-navigation/native';

export const OnboardingScreen = () => {
    const navigation = useNavigation();
    return (
        <Screen style={styles.screen}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
            </ScrollView>
        </Screen>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: spacing.containerMargin,
        justifyContent: 'space-between',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        marginVertical: spacing.xl,
    },
    title: {
        marginBottom: spacing.md,
    },
    subtitle: {
        marginBottom: spacing.xl,
    },
    footer: {
        paddingBottom: spacing.lg,
    },
    button: {
        marginBottom: spacing.md,
    },
});
