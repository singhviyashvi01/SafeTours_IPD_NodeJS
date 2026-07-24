import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, Switch, Modal, Animated, ActivityIndicator, Alert } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { locationService } from '../../services/locationService';
import { journeyService } from '../../services/journeys';
import { sosService } from '../../services/sos';
import { useNavigation } from '@react-navigation/native';

export const SOSScreen = () => {
    const navigation = useNavigation();
    const [isShadowMode, setIsShadowMode] = useState(true);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [showShareSheet, setShowShareSheet] = useState(false);
    const [countdown, setCountdown] = useState(60);

    // SOS States
    const [activeSosRecord, setActiveSosRecord] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [userLocation, setUserLocation] = useState(null);
    const [statusMessage, setStatusMessage] = useState('SOS Status: Ready');

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

        fetchCurrentLocation();
    }, []);

    const fetchCurrentLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                setUserLocation({
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                });
            }
        } catch (err) {
            console.warn('Could not fetch location for SOS:', err);
        }
    };

    useEffect(() => {
        let interval;
        if (showSafetyModal && countdown > 0) {
            interval = setInterval(() => {
                setCountdown((prev) => prev - 1);
            }, 1000);
        } else if (countdown === 0) {
            // Trigger automatic SOS when countdown expires
            setShowSafetyModal(false);
            handleAutomaticSOSTrigger();
        }
        return () => clearInterval(interval);
    }, [showSafetyModal, countdown]);

    // Helper to get or sync latest location and retrieve active journey
    const prepareSOSData = async () => {
        let locationId = null;
        const currentLat = userLocation?.latitude || 18.9220;
        const currentLng = userLocation?.longitude || 72.8347;

        // Try syncing fresh location first to get locationId from Location API response
        const syncRes = await locationService.syncLocation({
            latitude: currentLat,
            longitude: currentLng,
            accuracy: 10,
        });

        if (syncRes.success && syncRes.data?._id) {
            locationId = syncRes.data._id;
        } else {
            // Fallback: Fetch latest location from locationService
            const latestRes = await locationService.getLatestLocation();
            if (latestRes.success && latestRes.location?._id) {
                locationId = latestRes.location._id;
            }
        }

        // Fetch active journey if any
        let journeyId = null;
        try {
            const journeyRes = await journeyService.getActive();
            if (journeyRes.success && journeyRes.journey?._id) {
                journeyId = journeyRes.journey._id;
            }
        } catch (err) {
            console.warn('Could not fetch active journey for SOS:', err);
        }

        return { locationId, journeyId };
    };

    const handleSOSPress = async () => {
        setIsSubmitting(true);
        setStatusMessage('Broadcasting Emergency SOS...');

        const { locationId, journeyId } = await prepareSOSData();

        if (!locationId) {
            setIsSubmitting(false);
            setStatusMessage('SOS Status: Ready');
            Alert.alert('SOS Error', 'Could not obtain location record for SOS trigger.');
            return;
        }

        const payload = {
            locationId,
            ...(journeyId ? { journeyId } : {}),
            reason: 'Manual SOS button pressed by user from mobile screen.',
        };

        const res = await sosService.triggerManual(payload);
        setIsSubmitting(false);

        if (res.success) {
            setActiveSosRecord(res.data);
            setStatusMessage('SOS ACTIVE — Emergency Contacts & Authorities Notified');
            Alert.alert('SOS Broadcast Sent', 'Your emergency alert and live coordinates have been broadcast.');
        } else {
            setStatusMessage('SOS Status: Ready');
            Alert.alert('SOS Error', res.error?.message || 'Could not send emergency alert.');
        }
    };

    const handleAutomaticSOSTrigger = async () => {
        setIsSubmitting(true);
        setStatusMessage('Triggering Automatic SOS...');

        const { locationId, journeyId } = await prepareSOSData();

        if (!locationId || !journeyId) {
            setIsSubmitting(false);
            setStatusMessage('SOS Status: Ready');
            Alert.alert('SOS Error', 'An active journey and valid location are required for Automatic SOS.');
            return;
        }

        const payload = {
            locationId,
            journeyId,
            reason: 'Safety prompt countdown expired without user response.',
        };

        const res = await sosService.triggerAutomatic(payload);
        setIsSubmitting(false);

        if (res.success) {
            setActiveSosRecord(res.data);
            setStatusMessage('AUTOMATIC SOS ACTIVE');
        } else {
            setStatusMessage('SOS Status: Ready');
            Alert.alert('SOS Error', res.error?.message || 'Could not send automatic emergency alert.');
        }
    };

    const handleCancelSOS = async () => {
        const sosId = activeSosRecord?._id || activeSosRecord?.id;
        if (!sosId) {
            setActiveSosRecord(null);
            setStatusMessage('SOS Status: Ready');
            return;
        }

        Alert.alert(
            'Cancel Emergency Action',
            'Are you sure you want to cancel the active SOS alert?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Cancel SOS',
                    style: 'destructive',
                    onPress: async () => {
                        setIsSubmitting(true);
                        const res = await sosService.cancel(sosId, 'User cancelled emergency alert from app');
                        setIsSubmitting(false);
                        if (res.success) {
                            setActiveSosRecord(null);
                            setStatusMessage('SOS Status: Ready');
                            Alert.alert('Cancelled', 'Emergency SOS alert has been cancelled.');
                        } else {
                            Alert.alert('Error', res.error?.message || 'Could not cancel SOS.');
                        }
                    }
                }
            ]
        );
    };

    const latStr = userLocation ? `${userLocation.latitude.toFixed(4)}° N` : '18.9220° N';
    const lngStr = userLocation ? `${userLocation.longitude.toFixed(4)}° E` : '72.8347° E';

    return (
        <Screen style={styles.container}>
            {/* Top Navigation */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
                    <Text variant="headlineMd" style={styles.headerTitle}>SafeTours</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('SOSHistory')}>
                    <Ionicons name="time" size={24} color={colors.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* Emergency Header */}
                <View style={[styles.emergencyHeader, activeSosRecord && { backgroundColor: colors.error }]}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <Ionicons name="warning" size={32} color={activeSosRecord ? colors.white : colors.error} />
                    </Animated.View>
                    <View style={styles.emergencyHeaderText}>
                        <Text variant="headlineSm" style={[{ fontWeight: 'bold' }, activeSosRecord && { color: colors.white }]}>
                            {statusMessage}
                        </Text>
                        <Text variant="labelMd" style={[{ opacity: 0.8, textTransform: 'uppercase' }, activeSosRecord && { color: colors.white }]}>
                            {activeSosRecord ? "Active Emergency Tracking" : "Tap and hold to broadcast"}
                        </Text>
                    </View>
                </View>

                {/* Big SOS Button */}
                <View style={styles.sosButtonContainer}>
                    <TouchableOpacity 
                        style={[styles.sosButton, activeSosRecord && { backgroundColor: colors['error-container'] }]}
                        onLongPress={handleSOSPress}
                        onPress={handleSOSPress}
                        delayLongPress={1000}
                        activeOpacity={0.8}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="large" color={colors.white} />
                        ) : (
                            <>
                                <Ionicons name="warning" size={48} color={activeSosRecord ? colors.error : colors['on-error']} />
                                <Text variant="headlineSm" style={[styles.sosButtonText, activeSosRecord && { color: colors.error }]}>
                                    {activeSosRecord ? "SOS SENT" : "Send SOS"}
                                </Text>
                            </>
                        )}
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
                            <Text variant="bodyMd" style={styles.monoText}>{latStr}, {lngStr}</Text>
                        </View>
                        <View style={styles.innerCardRow}>
                            <Text variant="labelMd" color={colors['on-surface-variant']}>Status</Text>
                            <Text variant="bodyMd" style={{ fontWeight: 'bold' }}>
                                {activeSosRecord ? 'EMERGENCY_BROADCAST' : 'READY'}
                            </Text>
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
                </View>

                {/* Cancel Area */}
                {activeSosRecord && (
                    <View style={styles.cancelArea}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelSOS} disabled={isSubmitting}>
                            <Text variant="labelLg" color={colors.error} style={{ fontWeight: 'bold' }}>
                                CANCEL EMERGENCY ACTION
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
                
                {/* Test Safety Prompt Modal button */}
                <TouchableOpacity style={{ padding: 20, alignItems: 'center' }} onPress={() => { setCountdown(60); setShowSafetyModal(true); }}>
                    <Text color={colors.primary}>Test "Are you safe?" Safety Prompt</Text>
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
                                <Text variant="bodyMd" style={styles.monoText}>{latStr}, {lngStr}</Text>
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
    cancelArea: {
        paddingTop: spacing.md,
    },
    cancelBtn: {
        width: '100%',
        paddingVertical: 16,
        borderWidth: 2,
        borderColor: colors.error,
        borderRadius: shapes.roundedPill,
        alignItems: 'center',
        justifyContent: 'center',
    },
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
