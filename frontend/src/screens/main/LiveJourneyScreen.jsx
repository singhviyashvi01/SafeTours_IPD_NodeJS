import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { journeyService } from '../../services/journeys';
import { sosService } from '../../services/sos';
import { locationService } from '../../services/locationService';
import { MapComponent } from '../../components/MapComponent';
import { dangerZoneService } from '../../services/dangerZoneService';
import { geofenceManager } from '../../utils/geofenceManager';

const { width, height } = Dimensions.get('window');

export const LiveJourneyScreen = () => {
    const navigation = useNavigation();
    const [bottomSheetExpanded, setBottomSheetExpanded] = useState(true);
    
    // Journey state
    const [activeJourney, setActiveJourney] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [dangerZones, setDangerZones] = useState([]);
    const [journeyWarning, setJourneyWarning] = useState(null);

    // Form inputs for starting a new journey
    const [showStartModal, setShowStartModal] = useState(false);
    const [destinationName, setDestinationName] = useState('Victoria Station');
    const [destLat, setDestLat] = useState('18.9320');
    const [destLng, setDestLng] = useState('72.8340');
    const [etaMinutes, setEtaMinutes] = useState('25');

    // Live GPS location
    const [userLocation, setUserLocation] = useState(null);

    useEffect(() => {
        loadInitialState();
    }, []);

    const loadInitialState = async () => {
        setIsLoading(true);
        setErrorMessage(null);
        try {
            // Get current location
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const currentLocation = {
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                };
                setUserLocation(currentLocation);

                // Reuse Person 2's danger-zone data so the journey map shows current route risks.
                const zonesResult = await dangerZoneService.getNearbyDangerZones(
                    currentLocation.latitude,
                    currentLocation.longitude,
                    3000
                );
                if (zonesResult.success) {
                    const zones = zonesResult.data || [];
                    setDangerZones(zones);

                    // Reuse the existing geofence evaluator only for a journey warning.
                    // SOS triggering remains owned by the dedicated SOS flow.
                    const { activeZone, toastMessage } = geofenceManager.evaluateLocation(currentLocation, zones);
                    if (activeZone && toastMessage) {
                        setJourneyWarning(toastMessage);
                    }
                }
            }

            // Check active journey status
            const res = await journeyService.getActive();
            if (res.success && res.journey) {
                setActiveJourney(res.journey);
            } else {
                setActiveJourney(null);
            }
        } catch (err) {
            console.error('Error loading live journey state:', err);
            setErrorMessage('Could not load journey status.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartJourney = async () => {
        setIsSubmitting(true);
        setErrorMessage(null);

        const currentLat = userLocation?.latitude || 18.9220;
        const currentLng = userLocation?.longitude || 72.8347;

        const targetLat = Number(destLat) || 18.9320;
        const targetLng = Number(destLng) || 72.8340;

        const minutes = Number(etaMinutes) || 25;
        const expectedArrivalTime = new Date(Date.now() + minutes * 60000).toISOString();

        const payload = {
            startLocation: [currentLng, currentLat], // GeoJSON standard [lng, lat]
            destination: [targetLng, targetLat],
            expectedArrivalTime,
        };

        const res = await journeyService.start(payload);
        setIsSubmitting(false);

        if (res.success && res.journey) {
            setActiveJourney(res.journey);
            setShowStartModal(false);
            Alert.alert('Journey Started', res.message || 'Your journey is now being monitored.');
        } else {
            setErrorMessage(res.error?.message || 'Failed to start journey.');
        }
    };

    const handleEndJourney = async (status = 'COMPLETED') => {
        if (!activeJourney?._id) return;
        
        Alert.alert(
            status === 'COMPLETED' ? 'End Journey' : 'Cancel Journey',
            `Are you sure you want to mark this journey as ${status.toLowerCase()}?`,
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes',
                    style: status === 'COMPLETED' ? 'default' : 'destructive',
                    onPress: async () => {
                        setIsSubmitting(true);
                        const res = await journeyService.end(activeJourney._id, status);
                        setIsSubmitting(false);
                        if (res.success) {
                            setActiveJourney(null);
                            Alert.alert('Journey Updated', res.message || 'Your journey status has been saved.');
                        } else {
                            Alert.alert('Error', res.error?.message || 'Failed to end journey.');
                        }
                    }
                }
            ]
        );
    };

    const handleUpdateJourney = async () => {
        if (!activeJourney?._id) return;

        const minutes = Number(etaMinutes);
        if (!Number.isFinite(minutes) || minutes <= 0) {
            setErrorMessage('Enter a valid ETA in minutes before updating the journey.');
            return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);
        const res = await journeyService.update(activeJourney._id, {
            expectedArrivalTime: new Date(Date.now() + minutes * 60000).toISOString(),
        });
        setIsSubmitting(false);

        if (res.success && res.journey) {
            setActiveJourney(res.journey);
            Alert.alert('Journey Updated', res.message || 'Your expected arrival time has been updated.');
        } else {
            setErrorMessage(res.error?.message || 'Failed to update journey.');
        }
    };

    const handleTriggerSOS = async () => {
        Alert.alert(
            'Emergency SOS',
            'Trigger emergency alert for your current journey location?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Trigger SOS',
                    style: 'destructive',
                    onPress: async () => {
                        const currentLat = userLocation?.latitude || 18.9220;
                        const currentLng = userLocation?.longitude || 72.8347;

                        // The SOS API accepts a saved location ID, not raw map coordinates.
                        const locationResult = await locationService.syncLocation({
                            latitude: currentLat,
                            longitude: currentLng,
                            accuracy: 10,
                        });
                        if (!locationResult.success || !locationResult.data?._id) {
                            Alert.alert('SOS Failure', locationResult.error?.message || 'Could not sync your location for SOS.');
                            return;
                        }

                        const res = await sosService.triggerManual({
                            locationId: locationResult.data._id,
                            journeyId: activeJourney?._id,
                            reason: 'SOS triggered during an active journey.',
                        });

                        if (res.success) {
                            navigation.navigate('SOS');
                        } else {
                            Alert.alert('SOS Failure', res.error?.message || 'Could not trigger SOS.');
                        }
                    }
                }
            ]
        );
    };

    // Calculate arrival time string
    const etaFormatted = activeJourney?.expectedArrivalTime
        ? new Date(activeJourney.expectedArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '18:45';

    return (
        <Screen style={styles.container} isSafe={false}>
            {/* Map View */}
            <MapComponent 
                region={{
                    latitude: userLocation?.latitude || 18.9220,
                    longitude: userLocation?.longitude || 72.8347,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                }}
                userLocation={userLocation}
                dangerZones={dangerZones}
            />

            {/* Top Navigation Header */}
            <View style={styles.topHeader}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={24} color={colors['on-surface']} />
                </TouchableOpacity>
                <View style={styles.destinationBox}>
                    <Text variant="labelMd" color={colors['on-surface-variant']} style={{ textTransform: 'uppercase' }}>
                        {activeJourney ? "Active Journey To" : "Destination"}
                    </Text>
                    <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>
                        {activeJourney ? destinationName : "No Active Journey"}
                    </Text>
                </View>
                {activeJourney ? (
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => handleEndJourney('CANCELLED')}>
                        <Text variant="labelLg" color={colors.error} style={{ fontWeight: 'bold' }}>Cancel</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={styles.startHeaderBtn} onPress={() => setShowStartModal(true)}>
                        <Text variant="labelLg" color={colors.primary} style={{ fontWeight: 'bold' }}>Start</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Floating SOS Button */}
            <TouchableOpacity style={styles.sosFab} onPress={handleTriggerSOS}>
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

                {errorMessage && (
                    <View style={styles.errorBox}>
                        <Ionicons name="alert-circle" size={20} color={colors.error} />
                        <Text variant="labelMd" style={{ color: colors.error, flex: 1 }}>{errorMessage}</Text>
                        <TouchableOpacity onPress={loadInitialState}>
                            <Text variant="labelMd" style={{ color: colors.primary, fontWeight: 'bold' }}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {journeyWarning && activeJourney && (
                    <View style={styles.warningBox}>
                        <Ionicons name="shield-outline" size={20} color={colors.error} />
                        <Text variant="labelMd" style={{ color: colors.error, flex: 1 }}>{journeyWarning}</Text>
                    </View>
                )}

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text variant="labelLg" color={colors['on-surface-variant']} style={{ marginTop: 8 }}>
                            Syncing journey status...
                        </Text>
                    </View>
                ) : activeJourney ? (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
                        {/* Progress Header */}
                        <View style={styles.progressHeader}>
                            <View>
                                <Text variant="headlineMd" style={{ fontWeight: 'bold' }}>Journey Active</Text>
                                <Text variant="bodyMd" color={colors['on-surface-variant']}>ETA: {etaFormatted}</Text>
                            </View>
                            <View style={styles.safeRouteBadge}>
                                <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
                                <Text variant="labelLg" color={colors.primary} style={{ fontWeight: 'bold' }}>
                                    {activeJourney.status || 'ACTIVE'}
                                </Text>
                            </View>
                        </View>

                        {/* Progress Bar */}
                        <View style={styles.progressBarBg}>
                            <View style={styles.progressBarFill} />
                        </View>

                        {/* Stats Bento Grid */}
                        <View style={styles.statsGrid}>
                            <View style={styles.statBox}>
                                <Text variant="labelSm" color={colors.outline} style={styles.statLabel}>Status</Text>
                                <Text variant="headlineSm" style={{ fontWeight: 'bold', color: colors.primary }}>
                                    {activeJourney.status}
                                </Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text variant="labelSm" color={colors.outline} style={styles.statLabel}>Target ETA</Text>
                                <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>{etaFormatted}</Text>
                            </View>
                        </View>

                        {/* The existing journey endpoint supports ETA changes while ACTIVE. */}
                        <View style={styles.updateEtaRow}>
                            <TextInput
                                style={styles.etaInput}
                                value={etaMinutes}
                                onChangeText={setEtaMinutes}
                                keyboardType="numeric"
                                placeholder="ETA minutes"
                            />
                            <TouchableOpacity
                                style={styles.updateEtaButton}
                                onPress={handleUpdateJourney}
                                disabled={isSubmitting}
                            >
                                <Text variant="labelMd" color={colors.white} style={{ fontWeight: 'bold' }}>Update ETA</Text>
                            </TouchableOpacity>
                        </View>

                        {/* AI Recommendation */}
                        <View style={styles.aiBox}>
                            <View style={styles.aiIconWrapper}>
                                <Ionicons name="sparkles" size={24} color={colors.secondary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text variant="labelLg" style={{ fontWeight: 'bold', color: colors['on-secondary-container'] }}>AI Safety Assistant</Text>
                                <Text variant="labelMd" style={{ color: colors['on-secondary-container'], opacity: 0.8, marginTop: 4 }}>
                                    "Route monitoring active. Keep location enabled for continuous safety tracking."
                                </Text>
                            </View>
                        </View>

                        {/* Action Buttons Row */}
                        <View style={styles.actionRow}>
                            <TouchableOpacity 
                                style={styles.completeBtn} 
                                onPress={() => handleEndJourney('COMPLETED')}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator size="small" color={colors.white} />
                                ) : (
                                    <>
                                        <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                                        <Text variant="labelLg" color={colors.white} style={{ fontWeight: 'bold' }}>
                                            Complete Journey
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                ) : (
                    <View style={styles.noJourneyContainer}>
                        <Ionicons name="navigate-circle-outline" size={64} color={colors.primary} />
                        <Text variant="headlineSm" style={{ fontWeight: 'bold', marginTop: 12 }}>No Active Journey</Text>
                        <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ textAlign: 'center', marginVertical: 8 }}>
                            Start a journey to enable live tracking, ETA monitoring, and safety alerts.
                        </Text>

                        <TouchableOpacity 
                            style={styles.startNewBtn}
                            onPress={() => setShowStartModal(true)}
                        >
                            <Ionicons name="play" size={20} color={colors.white} />
                            <Text variant="labelLg" color={colors.white} style={{ fontWeight: 'bold' }}>
                                Start New Journey
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Start Journey Modal */}
            <Modal visible={showStartModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>Start New Journey</Text>
                            <TouchableOpacity onPress={() => setShowStartModal(false)}>
                                <Ionicons name="close" size={24} color={colors['on-surface-variant']} />
                            </TouchableOpacity>
                        </View>

                        <Text variant="labelLg" style={{ marginBottom: 4 }}>Destination Name</Text>
                        <TextInput 
                            style={styles.input}
                            value={destinationName}
                            onChangeText={setDestinationName}
                            placeholder="e.g. Victoria Station"
                        />

                        <Text variant="labelLg" style={{ marginBottom: 4 }}>ETA (Minutes)</Text>
                        <TextInput 
                            style={styles.input}
                            value={etaMinutes}
                            onChangeText={setEtaMinutes}
                            keyboardType="numeric"
                            placeholder="25"
                        />

                        <TouchableOpacity 
                            style={styles.modalSubmitBtn}
                            onPress={handleStartJourney}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator size="small" color={colors.white} />
                            ) : (
                                <Text variant="labelLg" color={colors.white} style={{ fontWeight: 'bold' }}>
                                    Confirm & Start Journey
                                </Text>
                            )}
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
        backgroundColor: colors.background,
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
    startHeaderBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    sosFab: {
        position: 'absolute',
        bottom: 260,
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
        maxHeight: 460,
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
    },
    bottomSheetExpanded: {},
    sheetHandleContainer: {
        alignItems: 'center',
        paddingVertical: spacing.md,
    },
    sheetHandle: {
        width: 48,
        height: 6,
        backgroundColor: colors['outline-variant'],
        borderRadius: 3,
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xl,
    },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors['error-container'] || '#ffdad6',
        padding: spacing.md,
        borderRadius: shapes.roundedSm,
        marginBottom: spacing.md,
    },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors['error-container'] || '#ffdad6',
        padding: spacing.md,
        borderRadius: shapes.roundedSm,
        marginBottom: spacing.md,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
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
        height: 10,
        backgroundColor: colors['surface-container-high'],
        borderRadius: 5,
        marginBottom: spacing.md,
        overflow: 'hidden',
    },
    progressBarFill: {
        width: '75%',
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: 5,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: spacing.md,
        marginBottom: spacing.md,
    },
    updateEtaRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    etaInput: {
        flex: 1,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors['outline-variant'],
        borderRadius: shapes.roundedMd,
        paddingHorizontal: spacing.md,
        color: colors['on-surface'],
    },
    updateEtaButton: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        borderRadius: shapes.roundedMd,
        paddingHorizontal: spacing.md,
    },
    statBox: {
        flex: 1,
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
        padding: spacing.md,
        borderRadius: shapes.roundedLg,
        marginBottom: spacing.md,
    },
    aiIconWrapper: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionRow: {
        marginTop: spacing.sm,
    },
    completeBtn: {
        height: 52,
        backgroundColor: colors.primary,
        borderRadius: shapes.roundedPill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    noJourneyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xl,
    },
    startNewBtn: {
        height: 52,
        paddingHorizontal: spacing.xl,
        backgroundColor: colors.primary,
        borderRadius: shapes.roundedPill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: spacing.md,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: spacing.lg,
    },
    modalContent: {
        backgroundColor: colors.surface,
        borderRadius: shapes.roundedLg,
        padding: spacing.lg,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.outline,
        borderRadius: shapes.roundedSm,
        padding: spacing.md,
        fontSize: typography.sizes.bodyLg,
        color: colors['on-surface'],
        marginBottom: spacing.lg,
    },
    modalSubmitBtn: {
        height: 52,
        backgroundColor: colors.primary,
        borderRadius: shapes.roundedPill,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
