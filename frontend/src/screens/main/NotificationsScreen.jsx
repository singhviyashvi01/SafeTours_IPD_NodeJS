import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';

export const NotificationsScreen = () => {
    const [activeFilter, setActiveFilter] = useState('All');

    const filters = ['All', 'SOS Alerts', 'Travel Updates', 'System'];

    return (
        <Screen style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text variant="headlineMd" style={{ fontWeight: 'bold' }}>History & Alerts</Text>
                <TouchableOpacity style={styles.headerBtn}>
                    <Ionicons name="trash-outline" size={24} color={colors['on-surface-variant']} />
                </TouchableOpacity>
            </View>

            {/* Filters */}
            <View style={styles.filtersContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
                    {filters.map((f) => (
                        <TouchableOpacity 
                            key={f}
                            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
                            onPress={() => setActiveFilter(f)}
                        >
                            <Text variant="labelLg" style={{ color: activeFilter === f ? colors['on-secondary-container'] : colors['on-surface-variant'] }}>{f}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* Timeline Line BG */}
                <View style={styles.timelineLine} />

                {/* Date Header */}
                <Text variant="labelSm" color={colors.outline} style={styles.dateDivider}>TODAY</Text>

                {/* SOS Triggered Card */}
                <View style={styles.timelineItem}>
                    <View style={styles.iconContainerError}>
                        <Ionicons name="warning" size={24} color={colors.white} />
                        <View style={styles.pulseRing} />
                    </View>
                    <View style={styles.cardError}>
                        <View style={styles.cardHeader}>
                            <Text variant="labelLg" style={{ color: colors.error }}>SOS Triggered</Text>
                            <Text variant="labelMd" color={colors['on-surface-variant']}>14:32</Text>
                        </View>
                        <Text variant="headlineSm" style={{ fontWeight: 'bold', marginVertical: 4 }}>Emergency Broadcast Sent</Text>
                        <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ marginBottom: 12 }}>
                            Signal sent to 3 emergency contacts and local authorities. Location: Central Station.
                        </Text>
                        <View style={styles.cardActionsRow}>
                            <TouchableOpacity style={styles.cardBtn}>
                                <Ionicons name="map-outline" size={18} color={colors.primary} />
                                <Text variant="labelLg" color={colors.primary}>View Map</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.cardBtn}>
                                <Ionicons name="call-outline" size={18} color={colors.primary} />
                                <Text variant="labelLg" color={colors.primary}>Call Authorities</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Safety Alert (Danger Zone) */}
                <View style={styles.timelineItem}>
                    <View style={styles.iconContainerWarning}>
                        <Ionicons name="alert" size={24} color={colors['on-error-container']} />
                    </View>
                    <View style={styles.cardStandard}>
                        <View style={styles.cardInnerPadding}>
                            <View style={styles.cardHeader}>
                                <Text variant="labelLg" style={{ color: colors.error }}>Danger Zone Warning</Text>
                                <Text variant="labelMd" color={colors['on-surface-variant']}>2h ago</Text>
                            </View>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold', marginVertical: 4 }}>Entered Red Zone</Text>
                        </View>
                        <View style={styles.cardImageContainer}>
                            <Image 
                                source={{ uri: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=800' }} 
                                style={styles.cardImage} 
                            />
                            <View style={styles.cardImageOverlay}>
                                <View style={styles.cardImageLabel}>
                                    <Ionicons name="warning" size={16} color={colors.error} />
                                    <Text variant="labelMd">High crime reports in this area</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Date Header */}
                <Text variant="labelSm" color={colors.outline} style={styles.dateDivider}>YESTERDAY</Text>

                {/* Weather Alert */}
                <View style={styles.timelineItem}>
                    <View style={styles.iconContainerInfo}>
                        <Ionicons name="rainy" size={24} color={colors['on-tertiary-container']} />
                    </View>
                    <View style={styles.cardInfo}>
                        <View style={styles.cardHeader}>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>Rain Alert</Text>
                            <Text variant="labelMd" color={colors['on-surface-variant']}>Oct 24 • 4:00 PM</Text>
                        </View>
                        <View style={styles.cardInfoInner}>
                            <Text variant="labelLg" color={colors['on-surface-variant']}>Recommended Action:</Text>
                            <Text variant="headlineSm" color={colors.tertiary} style={{ fontWeight: 'bold' }}>Seek Shelter</Text>
                            <Text variant="bodyMd" style={{ marginTop: 8 }}>
                                Heavy thunderstorms expected within 15 minutes. Visibility will decrease significantly.
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Shadow Mode History */}
                <View style={styles.timelineItem}>
                    <View style={styles.iconContainerMuted}>
                        <Ionicons name="eye" size={24} color={colors.primary} />
                    </View>
                    <View style={styles.cardStandardFull}>
                        <View style={styles.cardHeader}>
                            <View>
                                <Text variant="labelLg" color={colors['on-surface-variant']}>Shadow Mode History</Text>
                                <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>Hotel to Central Station</Text>
                            </View>
                            <View style={styles.successBadge}>
                                <Ionicons name="checkmark-circle" size={16} color="#166534" />
                                <Text variant="labelMd" style={{ color: '#166534' }}>Safe Arrival</Text>
                            </View>
                        </View>
                        
                        <View style={styles.statsRow}>
                            <View style={{ flex: 1 }}>
                                <Text variant="labelMd" color={colors['on-surface-variant']} style={{ textTransform: 'uppercase' }}>Date</Text>
                                <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Oct 23, 2023</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text variant="labelMd" color={colors['on-surface-variant']} style={{ textTransform: 'uppercase' }}>Duration</Text>
                                <Text variant="labelLg" style={{ fontWeight: 'bold' }}>24 Minutes</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.outlineBtn}>
                            <Text variant="labelLg" color={colors.primary}>View Route</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>
        </Screen>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        paddingBottom: spacing.sm,
        backgroundColor: colors.surface,
    },
    headerBtn: {
        padding: spacing.xs,
    },
    filtersContainer: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(217, 194, 183, 0.3)',
        paddingBottom: spacing.md,
    },
    filtersScroll: {
        paddingHorizontal: spacing.lg,
        gap: spacing.sm,
    },
    filterChip: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: colors['surface-container-high'],
        borderRadius: shapes.roundedPill,
    },
    filterChipActive: {
        backgroundColor: colors['secondary-container'],
    },
    scrollContent: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        position: 'relative',
    },
    timelineLine: {
        position: 'absolute',
        left: 44,
        top: 24,
        bottom: 0,
        width: 2,
        backgroundColor: 'rgba(217, 194, 183, 0.3)',
    },
    dateDivider: {
        marginLeft: 64,
        marginBottom: spacing.md,
        letterSpacing: 1,
        fontWeight: 'bold',
    },
    timelineItem: {
        flexDirection: 'row',
        marginBottom: spacing.xl,
    },
    iconContainerError: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.error,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
        borderWidth: 4,
        borderColor: colors.surface,
        position: 'relative',
    },
    pulseRing: {
        position: 'absolute',
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: colors.error,
        opacity: 0.3,
    },
    iconContainerWarning: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors['error-container'],
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
        borderWidth: 4,
        borderColor: colors.surface,
    },
    iconContainerInfo: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors['tertiary-container'],
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
        borderWidth: 4,
        borderColor: colors.surface,
    },
    iconContainerMuted: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors['surface-container-highest'],
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
        borderWidth: 4,
        borderColor: colors.surface,
    },
    cardError: {
        flex: 1,
        backgroundColor: 'rgba(255, 235, 238, 0.3)',
        borderWidth: 1,
        borderColor: 'rgba(186, 26, 26, 0.3)',
        borderRadius: 24,
        padding: spacing.md,
    },
    cardStandard: {
        flex: 1,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors['outline-variant'],
        borderRadius: 24,
        overflow: 'hidden',
    },
    cardStandardFull: {
        flex: 1,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors['outline-variant'],
        borderRadius: 24,
        padding: spacing.md,
    },
    cardInfo: {
        flex: 1,
        backgroundColor: '#F0FDFB',
        borderWidth: 1,
        borderColor: 'rgba(182, 115, 73, 0.3)',
        borderRadius: 24,
        padding: spacing.md,
    },
    cardInfoInner: {
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderRadius: 12,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(182, 115, 73, 0.2)',
        marginTop: spacing.sm,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    cardActionsRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.xs,
    },
    cardBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: colors.white,
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: 'rgba(113, 85, 72, 0.2)',
    },
    cardInnerPadding: {
        padding: spacing.md,
    },
    cardImageContainer: {
        height: 150,
        width: '100%',
        position: 'relative',
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    cardImageOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.1)',
        justifyContent: 'flex-end',
        padding: spacing.sm,
    },
    cardImageLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.9)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: shapes.roundedMd,
        alignSelf: 'flex-start',
    },
    successBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#DCFCE7',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: shapes.roundedPill,
    },
    statsRow: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
        paddingVertical: spacing.sm,
        marginVertical: spacing.md,
    },
    outlineBtn: {
        width: '100%',
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: shapes.roundedPill,
        alignItems: 'center',
    }
});
