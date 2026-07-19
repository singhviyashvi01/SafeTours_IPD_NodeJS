import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Dimensions } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

export const LiveJourneyScreen = () => {
    const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
    const navigation = useNavigation();

    return (
        <Screen style={styles.container}>
            {/* Map Placeholder Image Background */}
            <Image 
                source={{ uri: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=1200' }} 
                style={styles.mapPlaceholder} 
                resizeMode="cover"
            />
            {/* Dark overlay for map readability */}
            <View style={styles.mapOverlay} />

            {/* Top Destination Header */}
            <View style={styles.topHeader}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={24} color={colors['on-surface']} />
                </TouchableOpacity>
                <View style={styles.destinationBox}>
                    <Text variant="labelMd" color={colors['on-surface-variant']} style={{ textTransform: 'uppercase' }}>Navigating To</Text>
                    <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>Victoria Station</Text>
                </View>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
                    <Text variant="labelLg" color={colors.error}>Cancel</Text>
                </TouchableOpacity>
            </View>

            {/* Floating Map Controls */}
            <View style={styles.floatingControls}>
                <TouchableOpacity style={styles.fabBtn}>
                    <Ionicons name="map" size={24} color={colors['on-surface-variant']} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.fabBtn}>
                    <Ionicons name="navigate" size={24} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.fabBtn}>
                    <Ionicons name="cellular-outline" size={24} color={colors['on-surface-variant']} />
                </TouchableOpacity>
            </View>

            {/* SOS FAB */}
            <TouchableOpacity style={styles.sosFab} onPress={() => navigation.navigate('SOS')}>
                <Ionicons name="warning" size={32} color={colors.white} />
            </TouchableOpacity>

            {/* Bottom Sheet */}
            <View style={[styles.bottomSheet, bottomSheetExpanded && styles.bottomSheetExpanded]}>
                <TouchableOpacity 
                    style={styles.sheetHandleContainer}
                    onPress={() => setBottomSheetExpanded(!bottomSheetExpanded)}
                >
                    <View style={styles.sheetHandle} />
                </TouchableOpacity>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
                    
                    {/* Progress Header */}
                    <View style={styles.progressHeader}>
                        <View>
                            <Text variant="headlineMd" style={{ fontWeight: 'bold' }}>Arriving in 14 min</Text>
                            <Text variant="bodyMd" color={colors['on-surface-variant']}>Estimated 18:45 Arrival</Text>
                        </View>
                        <View style={styles.safeRouteBadge}>
                            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
                            <Text variant="labelLg" color={colors.primary} style={{ fontWeight: 'bold' }}>Safe Route</Text>
                        </View>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressBarBg}>
                        <View style={styles.progressBarFill} />
                    </View>

                    {/* Stats Bento Grid */}
                    <View style={styles.statsGrid}>
                        <View style={styles.statBox}>
                            <Text variant="labelSm" color={colors.outline} style={styles.statLabel}>Time Left</Text>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>14 min</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text variant="labelSm" color={colors.outline} style={styles.statLabel}>Distance</Text>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>0.8 mi</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text variant="labelSm" color={colors.outline} style={styles.statLabel}>Speed</Text>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>3.2 mph</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text variant="labelSm" color={colors.outline} style={styles.statLabel}>Arrival</Text>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>18:45</Text>
                        </View>
                    </View>

                    {/* AI Recommendation */}
                    <View style={styles.aiBox}>
                        <View style={styles.aiIconWrapper}>
                            <Ionicons name="sparkles" size={24} color={colors.secondary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text variant="labelLg" style={{ fontWeight: 'bold', color: colors['on-secondary-container'] }}>AI Safety Assistant</Text>
                            <Text variant="labelMd" style={{ color: colors['on-secondary-container'], opacity: 0.8, marginTop: 4 }}>
                                "Route is clear, stay on path. No recent alerts in Victoria St area."
                            </Text>
                        </View>
                    </View>

                    {/* Timeline */}
                    <View style={styles.timeline}>
                        <View style={styles.timelineLine} />

                        {/* Node 1 */}
                        <View style={styles.timelineNodeContainer}>
                            <View style={styles.nodeIconActive} />
                            <View style={styles.nodeContent}>
                                <View style={styles.nodeHeader}>
                                    <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Entered Soho Central</Text>
                                    <Text variant="labelSm" color={colors.outline}>18:31</Text>
                                </View>
                                <Text variant="labelMd" color={colors['on-surface-variant']}>High visibility zone, 4 security cameras active.</Text>
                            </View>
                        </View>

                        {/* Node 2 */}
                        <View style={[styles.timelineNodeContainer, { opacity: 0.6 }]}>
                            <View style={styles.nodeIconInactive} />
                            <View style={styles.nodeContent}>
                                <View style={styles.nodeHeader}>
                                    <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Entered Yellow Zone</Text>
                                    <Text variant="labelSm" color={colors.outline}>18:25</Text>
                                </View>
                                <Text variant="labelMd" color={colors['on-surface-variant']}>Construction area ahead. AI monitoring activated.</Text>
                            </View>
                        </View>

                        {/* Node 3 */}
                        <View style={[styles.timelineNodeContainer, { opacity: 0.4 }]}>
                            <View style={styles.nodeIconInactive} />
                            <View style={styles.nodeContent}>
                                <View style={styles.nodeHeader}>
                                    <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Journey Started</Text>
                                    <Text variant="labelSm" color={colors.outline}>18:20</Text>
                                </View>
                                <Text variant="labelMd" color={colors['on-surface-variant']}>Oxford Circus Station departure.</Text>
                            </View>
                        </View>
                    </View>

                </ScrollView>
            </View>
        </Screen>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    mapPlaceholder: {
        ...StyleSheet.absoluteFillObject,
        width: width,
        height: height,
        opacity: 0.6,
    },
    mapOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 248, 246, 0.1)',
    },
    topHeader: {
        position: 'absolute',
        top: spacing.xl,
        left: spacing.md,
        right: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: shapes.roundedLg,
        padding: spacing.md,
        zIndex: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors['surface-container-high'],
        alignItems: 'center',
        justifyContent: 'center',
    },
    destinationBox: {
        flex: 1,
        paddingHorizontal: spacing.md,
    },
    cancelBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    floatingControls: {
        position: 'absolute',
        right: spacing.md,
        top: 140,
        gap: spacing.sm,
        zIndex: 10,
    },
    fabBtn: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    sosFab: {
        position: 'absolute',
        bottom: 240,
        right: spacing.md,
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.error,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.error,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 15,
        elevation: 8,
        zIndex: 20,
    },
    bottomSheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 500,
        backgroundColor: colors['surface-container-lowest'],
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: spacing.xl,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 20,
        zIndex: 30,
        transform: [{ translateY: 240 }], // hidden state
    },
    bottomSheetExpanded: {
        transform: [{ translateY: 0 }],
    },
    sheetHandleContainer: {
        alignItems: 'center',
        paddingVertical: spacing.md,
        paddingBottom: spacing.lg,
    },
    sheetHandle: {
        width: 48,
        height: 6,
        backgroundColor: colors['outline-variant'],
        borderRadius: 3,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xl,
    },
    safeRouteBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(182, 115, 73, 0.1)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: 'rgba(182, 115, 73, 0.2)',
    },
    progressBarBg: {
        width: '100%',
        height: 12,
        backgroundColor: colors['surface-container-high'],
        borderRadius: 6,
        marginBottom: spacing.xl,
        overflow: 'hidden',
    },
    progressBarFill: {
        width: '66%',
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: 6,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md,
        marginBottom: spacing.xl,
    },
    statBox: {
        width: '47%',
        backgroundColor: colors['surface-container-low'],
        padding: spacing.md,
        borderRadius: shapes.roundedLg,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.1)',
    },
    statLabel: {
        textTransform: 'uppercase',
        fontWeight: 'bold',
        marginBottom: 4,
    },
    aiBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        backgroundColor: colors['secondary-container'],
        padding: spacing.lg,
        borderRadius: shapes.roundedXl,
        marginBottom: spacing.xl,
    },
    aiIconWrapper: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    timeline: {
        paddingLeft: 16,
        position: 'relative',
    },
    timelineLine: {
        position: 'absolute',
        left: 23,
        top: 8,
        bottom: 8,
        width: 2,
        backgroundColor: 'rgba(217, 194, 183, 0.3)',
    },
    timelineNodeContainer: {
        flexDirection: 'row',
        marginBottom: spacing.lg,
    },
    nodeIconActive: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.primary,
        borderWidth: 4,
        borderColor: colors.white,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
        marginRight: spacing.lg,
        marginTop: 4,
    },
    nodeIconInactive: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors['outline-variant'],
        borderWidth: 4,
        borderColor: colors.white,
        marginRight: spacing.lg,
        marginTop: 4,
    },
    nodeContent: {
        flex: 1,
    },
    nodeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
});
