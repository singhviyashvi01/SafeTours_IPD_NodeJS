import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Platform } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { GlassCard, InfoCard } from '../../components/ReusableCards';
import { SOSButton } from '../../components/SOSButton';
import { IconText } from '../../components/IconText';
import { Chip } from '../../components/Chip';
import { colors, spacing, typography, shapes } from '../../theme/theme';
import { dashboardService } from '../../services/dashboard';
import { profileService } from '../../services/profile';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export const HomeScreen = () => {
    const navigation = useNavigation();
    const [data, setData] = useState(null);
    const [profile, setProfile] = useState(null);
    useEffect(() => {
        dashboardService.getDashboardData().then(setData);
        profileService.getProfile().then(setProfile);
    }, []);

    if (!data) {
        return (
            <Screen style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </Screen>
        );
    }

    return (
        <Screen style={styles.container}>
            {/* Top Navigation */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
                    <Text variant="headlineMd" style={styles.headerTitle}>SafeTours</Text>
                </View>
                <View style={styles.headerRight}>
                    <View style={styles.onlineBadge}>
                        <View style={styles.onlineDot} />
                        <Text variant="labelMd" style={styles.onlineText}>ONLINE</Text>
                    </View>
                    <TouchableOpacity style={styles.profilePicContainer} onPress={() => navigation.navigate('Profile')}>
                        {profile?.profileImage
                            ? <Image source={{ uri: profile.profileImage }} style={styles.profilePic} />
                            : <Ionicons name="person" size={20} color={colors.primary} />}
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* Greeting */}
                <View style={styles.greetingSection}>
                    <Text variant="bodyMd" color={colors['on-surface-variant']}>Good Morning,</Text>
                    <Text variant="headlineLg" style={styles.greetingName}>{profile?.name || 'SafeTours User'}</Text>
                    <Text variant="bodyMd" color={colors.primary} style={styles.greetingSub}>Your safety summary for today.</Text>
                </View>

                {/* Safety Score Card (Hero) */}
                <GlassCard style={styles.heroCard}>
                    <View style={styles.heroHeader}>
                        <Text variant="headlineSm" color={colors['on-surface']}>Safety Score</Text>
                        <Chip label="Very Safe" variant="success" backgroundColor={colors['tertiary-container']} textColor={colors['on-tertiary-container']} />
                    </View>
                    <View style={styles.heroBody}>
                        <View style={styles.scoreCircle}>
                            <Text style={styles.scoreText}>{data.safetyScore}</Text>
                            <Text style={styles.scoreMax}>/100</Text>
                        </View>
                        <Text variant="bodyMd" color={colors['on-surface-variant']} style={styles.scoreDesc}>
                            Your surroundings are secure. No active alerts in your immediate vicinity.
                        </Text>
                    </View>
                </GlassCard>

                {/* Weather & Connectivity Row */}
                <View style={styles.rowCards}>
                    <InfoCard style={styles.halfCard}>
                        <View style={styles.halfCardHeader}>
                            <Ionicons name="partly-sunny" size={24} color={colors.primary} />
                            <Text variant="headlineMd" style={styles.halfCardValue}>{data.weather.temp}°C</Text>
                        </View>
                        <Text variant="labelMd" color={colors['on-surface-variant']}>{data.weather.condition}</Text>
                        <Text variant="labelMd" color={colors['on-surface-variant']}>AQI: Good (42)</Text>
                    </InfoCard>
                    <InfoCard style={styles.halfCard}>
                        <View style={styles.halfCardHeader}>
                            <Ionicons name="wifi" size={24} color={colors.tertiary} />
                            <Text variant="headlineMd" style={styles.halfCardValue}>Strong</Text>
                        </View>
                        <Text variant="labelMd" color={colors['on-surface-variant']}>{data.connectivity.network}</Text>
                        <Text variant="labelMd" color={colors['on-surface-variant']}>Connected</Text>
                    </InfoCard>
                </View>

                {/* AI Safety Assistant */}
                <InfoCard style={styles.aiCard}>
                    <View style={styles.aiHeader}>
                        <Ionicons name="sparkles" size={20} color={colors['on-primary-container']} />
                        <Text variant="headlineSm" style={styles.aiTitle}>AI Safety Assistant</Text>
                    </View>
                    {data.aiRecommendations.map((rec, index) => (
                        <View key={index} style={styles.recItem}>
                            <View style={styles.recBullet} />
                            <Text variant="bodyMd" color={colors['on-surface']}>{rec}</Text>
                        </View>
                    ))}
                </InfoCard>

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                    <Text variant="headlineSm" style={styles.sectionTitle}>Quick Actions</Text>
                    <View style={styles.actionGrid}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('LiveJourney')}>
                            <View style={styles.actionIconWrapper}>
                                <Ionicons name="location" size={24} color={colors.primary} />
                            </View>
                            <Text variant="labelMd">Share Location</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('EmergencyContacts')}>
                            <View style={styles.actionIconWrapper}>
                                <Ionicons name="people" size={24} color={colors.primary} />
                            </View>
                            <Text variant="labelMd">Contacts</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('MedicalId')}>
                            <View style={styles.actionIconWrapper}>
                                <Ionicons name="medkit" size={24} color={colors.primary} />
                            </View>
                            <Text variant="labelMd">Medical ID</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Spacing for floating button */}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Floating SOS Button */}
            <View style={styles.floatingSosContainer}>
                <SOSButton onPress={() => navigation.navigate('SOS')} size={64} style={styles.floatingSos} />
            </View>
        </Screen>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.surface,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: 'rgba(255, 248, 246, 0.9)',
        borderBottomWidth: 1,
        borderBottomColor: colors['surface-variant'],
        zIndex: 10,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    headerTitle: {
        color: colors.primary,
        fontWeight: 'bold',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    onlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 105, 110, 0.1)',
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: 'rgba(0, 105, 110, 0.2)',
    },
    onlineDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.tertiary,
        marginRight: 6,
    },
    onlineText: {
        color: colors.tertiary,
        fontWeight: '600',
    },
    profilePicContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: colors['primary-container'],
        overflow: 'hidden',
    },
    profilePic: {
        width: '100%',
        height: '100%',
    },
    scrollContent: {
        padding: spacing.lg,
    },
    greetingSection: {
        marginBottom: spacing.xl,
    },
    greetingName: {
        fontSize: 32,
        color: colors['on-surface'],
        fontWeight: 'bold',
        letterSpacing: -0.5,
    },
    greetingSub: {
        marginTop: 4,
    },
    heroCard: {
        backgroundColor: colors['surface-container-lowest'],
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: colors['surface-variant'],
    },
    heroHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    heroBody: {
        alignItems: 'flex-start',
    },
    scoreCircle: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: spacing.sm,
    },
    scoreText: {
        fontSize: 64,
        fontWeight: 'bold',
        color: colors.primary,
        fontFamily: typography.fontFamily,
    },
    scoreMax: {
        fontSize: 24,
        color: colors['on-surface-variant'],
        fontWeight: '500',
        marginLeft: 4,
    },
    scoreDesc: {
        lineHeight: 24,
    },
    rowCards: {
        flexDirection: 'row',
        gap: spacing.md,
        marginBottom: spacing.lg,
    },
    halfCard: {
        flex: 1,
        backgroundColor: colors['surface-container-lowest'],
        borderWidth: 1,
        borderColor: colors['surface-variant'],
    },
    halfCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    halfCardValue: {
        color: colors['on-surface'],
    },
    aiCard: {
        backgroundColor: colors['primary-fixed'],
        marginBottom: spacing.xl,
        borderWidth: 1,
        borderColor: colors['primary-fixed-dim'],
    },
    aiHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    aiTitle: {
        color: colors['on-primary-container'],
    },
    recItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: spacing.sm,
        gap: spacing.sm,
    },
    recBullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors['on-primary-container'],
        marginTop: 8,
    },
    quickActions: {
        marginBottom: spacing.xxl,
    },
    sectionTitle: {
        marginBottom: spacing.md,
        color: colors['on-surface'],
    },
    actionGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    actionBtn: {
        alignItems: 'center',
        gap: spacing.sm,
    },
    actionIconWrapper: {
        width: 64,
        height: 64,
        borderRadius: shapes.roundedLg,
        backgroundColor: colors['surface-container-low'],
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors['surface-variant'],
    },
    floatingSosContainer: {
        position: 'absolute',
        bottom: spacing.lg,
        right: spacing.lg,
        ...Platform.select({
            ios: {
                shadowColor: colors.error,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.3,
                shadowRadius: 16,
            },
            elevation: 8,
        }),
    },
    floatingSos: {
        backgroundColor: colors.error,
    }
});
