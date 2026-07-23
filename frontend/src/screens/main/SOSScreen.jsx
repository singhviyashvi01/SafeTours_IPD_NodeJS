import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, Switch, Modal, Animated } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';

export const SOSScreen = () => {
    const [isShadowMode, setIsShadowMode] = useState(true);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [showShareSheet, setShowShareSheet] = useState(false);
    const [countdown, setCountdown] = useState(60);

    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.1,
                    duration: 1500,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1500,
                    useNativeDriver: true,
                })
            ])
        ).start();
    }, []);

    useEffect(() => {
        let interval;
        if (showSafetyModal && countdown > 0) {
            interval = setInterval(() => {
                setCountdown((prev) => prev - 1);
            }, 1000);
        } else if (countdown === 0) {
            // handle emergency trigger
            setShowSafetyModal(false);
        }
        return () => clearInterval(interval);
    }, [showSafetyModal, countdown]);

    const handleSOSPress = () => {
        // Implement long press logic or simple alert for now
        alert('SOS SENT TO CONTACTS AND AUTHORITIES!');
    };

    return (
        <Screen style={styles.container}>
            {/* Top Navigation */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
                    <Text variant="headlineMd" style={styles.headerTitle}>SafeTours</Text>
                </View>
                <View style={styles.profilePicContainer}>
                    <Image 
                        source={{ uri: 'https://i.pravatar.cc/100?img=9' }} 
                        style={styles.profilePic} 
                    />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* Emergency Header */}
                <View style={styles.emergencyHeader}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <Ionicons name="home" size={32} color={colors.error} />
                    </Animated.View>
                    <View style={styles.emergencyHeaderText}>
                        <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>SOS Status: Ready</Text>
                        <Text variant="labelMd" style={{ opacity: 0.8, textTransform: 'uppercase' }}>Tap and hold to broadcast</Text>
                    </View>
                </View>

                {/* Big SOS Button */}
                <View style={styles.sosButtonContainer}>
                    <TouchableOpacity 
                        style={styles.sosButton}
                        onLongPress={handleSOSPress}
                        delayLongPress={2000}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="warning" size={48} color={colors['on-error']} />
                        <Text variant="headlineSm" style={styles.sosButtonText}>Send SOS</Text>
                    </TouchableOpacity>
                    <Text variant="labelMd" style={styles.sosButtonHint}>
                        Contacts & local authorities will be notified instantly
                    </Text>
                </View>

                {/* Live Location Card */}
                <View style={styles.cardContainer}>
                    <View style={styles.cardHeaderRow}>
                        <View style={styles.cardHeaderTitle}>
                            <Ionicons name="location" size={18} color={colors.primary} />
                            <Text variant="labelLg" style={styles.cardTitleText}>Live Location</Text>
                        </View>
                        <View style={styles.statusBadgeActive}>
                            <Text variant="labelMd" style={styles.statusBadgeText}>Active</Text>
                        </View>
                    </View>

                    <View style={styles.innerCard}>
                        <View style={styles.innerCardRowBorder}>
                            <Text variant="labelMd" color={colors['on-surface-variant']}>Coordinates</Text>
                            <Text variant="bodyMd" style={styles.monoText}>40.7128° N, 74.0060° W</Text>
                        </View>
                        <View style={styles.innerCardRow}>
                            <Text variant="labelMd" color={colors['on-surface-variant']}>Zone ID</Text>
                            <Text variant="bodyMd" style={{ fontWeight: 'bold' }}>NY-MAN-0024</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.shareBtn} onPress={() => setShowShareSheet(true)}>
                        <Ionicons name="share-social" size={18} color={colors.tertiary} />
                        <Text variant="labelLg" style={styles.shareBtnText}>Share Status</Text>
                    </TouchableOpacity>
                </View>

                {/* Shadow Mode Card */}
                <View style={styles.cardContainer}>
                    <View style={styles.cardHeaderRow}>
                        <View style={styles.cardHeaderTitle}>
                            <Ionicons name="eye-off" size={18} color={colors.primary} />
                            <Text variant="labelLg" style={styles.cardTitleText}>Shadow Mode</Text>
                        </View>
                        <Switch
                            trackColor={{ false: colors['outline-variant'], true: colors.primary }}
                            thumbColor={colors.white}
                            onValueChange={setIsShadowMode}
                            value={isShadowMode}
                        />
                    </View>

                    <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ marginBottom: spacing.lg }}>
                        Automatically monitors your journey and triggers SOS if you deviate from the safe route or stop moving for too long.
                    </Text>

                    {/* Timeline */}
                    <View style={styles.timeline}>
                        {/* Event 1 */}
                        <View style={styles.timelineEvent}>
                            <View style={[styles.timelineNode, styles.timelineNodeActive]}>
                                <View style={styles.timelineNodeInnerActive} />
                            </View>
                            <View style={styles.timelineContent}>
                                <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Location Captured</Text>
                                <Text variant="labelMd" color={colors['on-surface-variant']}>2 minutes ago</Text>
                            </View>
                        </View>
                        
                        {/* Event 2 */}
                        <View style={[styles.timelineEvent, { opacity: 0.5 }]}>
                            <View style={styles.timelineNode}>
                                <View style={styles.timelineNodeInner} />
                            </View>
                            <View style={styles.timelineContent}>
                                <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Shadow Mode Initialized</Text>
                                <Text variant="labelMd" color={colors['on-surface-variant']}>Waiting for destination...</Text>
                            </View>
                        </View>

                        {/* Event 3 */}
                        <View style={[styles.timelineEvent, { opacity: 0.5 }]}>
                            <View style={styles.timelineNode}>
                                <View style={styles.timelineNodeInner} />
                            </View>
                            <View style={styles.timelineContent}>
                                <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Contacts Notified</Text>
                                <Text variant="labelMd" color={colors['on-surface-variant']}>Will trigger on SOS</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Cancel Area */}
                <View style={styles.cancelArea}>
                    <TouchableOpacity style={styles.cancelBtn}>
                        <Text variant="labelLg" color={colors['on-surface-variant']} style={{ fontWeight: 'bold' }}>CANCEL EMERGENCY ACTION</Text>
                    </TouchableOpacity>
                </View>
                
                {/* For testing modal button */}
                <TouchableOpacity style={{ padding: 20, alignItems: 'center' }} onPress={() => { setCountdown(60); setShowSafetyModal(true); }}>
                    <Text color={colors.primary}>Test "Are you safe?" Modal</Text>
                </TouchableOpacity>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* "Are You Safe?" Modal */}
            <Modal visible={showSafetyModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.timerCircle}>
                            <Text style={styles.timerText}>{countdown}</Text>
                        </View>
                        <Text variant="headlineMd" style={{ fontWeight: 'bold', marginBottom: 8 }}>Are You Safe?</Text>
                        <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ textAlign: 'center', marginBottom: 24 }}>
                            We noticed you stopped moving for a while. Please confirm your status.
                        </Text>

                        <TouchableOpacity style={styles.safeBtn} onPress={() => setShowSafetyModal(false)}>
                            <Text variant="headlineSm" color={colors.white} style={{ fontWeight: 'bold' }}>YES, I'M SAFE</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.emergencyModalBtn} onPress={handleSOSPress}>
                            <Text variant="headlineSm" color={colors.white} style={{ fontWeight: 'bold' }}>EMERGENCY</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Share Sheet */}
            <Modal visible={showShareSheet} transparent animationType="slide">
                <View style={styles.sheetOverlay}>
                    <View style={styles.sheetContent}>
                        <View style={styles.sheetHandle} />
                        <Text variant="headlineSm" style={{ fontWeight: 'bold', marginBottom: 4 }}>Share Live Location</Text>
                        <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ marginBottom: 24 }}>
                            Send your current status to your emergency contacts.
                        </Text>

                        <View style={styles.innerCard}>
                            <View style={styles.innerCardRow}>
                                <Text variant="labelMd" color={colors['on-surface-variant']} style={{ textTransform: 'uppercase' }}>Coordinates</Text>
                                <Text variant="bodyMd" style={styles.monoText}>40.7128° N, 74.0060° W</Text>
                            </View>
                            <View style={[styles.innerCardRow, { marginTop: 12 }]}>
                                <Text variant="labelMd" color={colors['on-surface-variant']} style={{ textTransform: 'uppercase' }}>Timestamp</Text>
                                <Text variant="bodyMd">Just now</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.shareNowBtn} onPress={() => setShowShareSheet(false)}>
                            <Text variant="headlineSm" color={colors.white} style={{ fontWeight: 'bold' }}>SHARE NOW</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowShareSheet(false)}>
                            <Text variant="labelLg" color={colors['on-surface-variant']} style={{ fontWeight: 'bold' }}>CANCEL</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
    emergencyHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors['error-container'],
        padding: spacing.md,
        borderRadius: shapes.roundedMd,
        borderLeftWidth: 4,
        borderLeftColor: colors.error,
        marginBottom: spacing.xxl,
    },
    emergencyHeaderText: {
        flex: 1,
    },
    sosButtonContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xl,
        marginBottom: spacing.xxl,
    },
    sosButton: {
        width: 192,
        height: 192,
        borderRadius: 96,
        backgroundColor: colors.error,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 10,
        shadowColor: colors.error,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        marginBottom: spacing.md,
    },
    sosButtonText: {
        color: colors.white,
        fontWeight: '900',
        textTransform: 'uppercase',
        marginTop: 8,
    },
    sosButtonHint: {
        color: colors['on-surface-variant'],
        textAlign: 'center',
        maxWidth: 200,
    },
    cardContainer: {
        backgroundColor: colors['surface-container-low'],
        borderRadius: shapes.roundedLg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
        marginBottom: spacing.lg,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    cardHeaderTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cardTitleText: {
        fontWeight: 'bold',
        color: colors.primary,
    },
    statusBadgeActive: {
        backgroundColor: colors['tertiary-container'],
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: shapes.roundedPill,
    },
    statusBadgeText: {
        color: colors['on-tertiary-container'],
    },
    innerCard: {
        backgroundColor: colors.white,
        borderRadius: shapes.roundedMd,
        padding: spacing.md,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    innerCardRowBorder: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(217, 194, 183, 0.2)',
        paddingBottom: spacing.sm,
        marginBottom: spacing.sm,
    },
    innerCardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    monoText: {
        fontFamily: 'monospace',
    },
    shareBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        marginTop: spacing.md,
        borderWidth: 2,
        borderColor: colors.tertiary,
        borderRadius: shapes.roundedMd,
    },
    shareBtnText: {
        color: colors.tertiary,
    },
    timeline: {
        paddingLeft: 16,
    },
    timelineEvent: {
        position: 'relative',
        paddingBottom: spacing.lg,
    },
    timelineNode: {
        position: 'absolute',
        left: -32,
        top: 0,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors['surface-container-highest'],
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: colors.surface,
        zIndex: 2,
    },
    timelineNodeActive: {
        backgroundColor: colors['primary-container'],
    },
    timelineNodeInner: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.outline,
    },
    timelineNodeInnerActive: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.primary,
    },
    timelineContent: {
        paddingLeft: 8,
    },
    cancelArea: {
        paddingTop: spacing.md,
    },
    cancelBtn: {
        width: '100%',
        paddingVertical: 16,
        borderWidth: 2,
        borderColor: colors['outline-variant'],
        borderRadius: shapes.roundedPill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    modalContent: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 32,
        padding: spacing.xl,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.3,
        shadowRadius: 30,
        elevation: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    timerCircle: {
        width: 128,
        height: 128,
        borderRadius: 64,
        borderWidth: 8,
        borderColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    timerText: {
        fontSize: 48,
        fontWeight: 'bold',
        color: colors.primary,
    },
    safeBtn: {
        width: '100%',
        paddingVertical: 16,
        backgroundColor: colors.tertiary,
        borderRadius: shapes.roundedPill,
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    emergencyModalBtn: {
        width: '100%',
        paddingVertical: 16,
        backgroundColor: colors.error,
        borderRadius: shapes.roundedPill,
        alignItems: 'center',
    },
    // Sheet Styles
    sheetOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-end',
    },
    sheetContent: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: spacing.xl,
        paddingBottom: spacing.xxl,
    },
    sheetHandle: {
        width: 48,
        height: 6,
        backgroundColor: 'rgba(217, 194, 183, 0.5)',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: spacing.md,
    },
    shareNowBtn: {
        width: '100%',
        paddingVertical: 16,
        backgroundColor: colors.tertiary,
        borderRadius: shapes.roundedPill,
        alignItems: 'center',
        marginTop: spacing.xl,
        marginBottom: spacing.md,
    },
    sheetCancelBtn: {
        width: '100%',
        paddingVertical: 16,
        borderWidth: 2,
        borderColor: colors['outline-variant'],
        borderRadius: shapes.roundedPill,
        alignItems: 'center',
    }
});
