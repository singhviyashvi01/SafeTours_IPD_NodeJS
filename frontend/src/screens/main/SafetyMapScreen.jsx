import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Dimensions, ActivityIndicator, Linking } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { MapComponent } from '../../components/MapComponent';

const { width, height } = Dimensions.get('window');

// Default fallback region centered on Plaza Mayor
const DEFAULT_REGION = {
    latitude: 40.416775,
    longitude: -3.703790,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
};

export const SafetyMapScreen = () => {
    const navigation = useNavigation();
    const [searchQuery, setSearchQuery] = useState('');
    const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
    
    // Map states
    const [userLocation, setUserLocation] = useState(null);
    const [mapRegion, setMapRegion] = useState(DEFAULT_REGION);
    const [mapType, setMapType] = useState('standard');
    
    // Location and permission states
    const [permissionStatus, setPermissionStatus] = useState('checking'); // checking, granted, denied, permanently_denied, disabled, error
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

    const mapRef = useRef(null);

    // Initial check/request on mount
    useEffect(() => {
        requestLocationPermission();
    }, []);

    const requestLocationPermission = async () => {
        try {
            setPermissionStatus('checking');
            setErrorMessage(null);

            // Check if GPS is enabled on the device
            const servicesEnabled = await Location.hasServicesEnabledAsync();
            if (!servicesEnabled) {
                setPermissionStatus('disabled');
                setErrorMessage('GPS/location services are disabled. Please enable location services on your device.');
                return;
            }

            // Check current permission status
            const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
            
            if (existingStatus === 'granted') {
                setPermissionStatus('granted');
                await fetchCurrentLocation();
                return;
            }

            // Request permission
            const { status: requestedStatus } = await Location.requestForegroundPermissionsAsync();
            if (requestedStatus === 'granted') {
                setPermissionStatus('granted');
                await fetchCurrentLocation();
            } else {
                const { canAskAgain } = await Location.getForegroundPermissionsAsync();
                if (!canAskAgain) {
                    setPermissionStatus('permanently_denied');
                } else {
                    setPermissionStatus('denied');
                }
            }
        } catch (error) {
            console.error('Error requesting location permission:', error);
            setPermissionStatus('error');
            setErrorMessage('An unexpected error occurred while requesting location permissions.');
        }
    };

    const fetchCurrentLocation = async () => {
        setIsLoadingLocation(true);
        setErrorMessage(null);
        try {
            const servicesEnabled = await Location.hasServicesEnabledAsync();
            if (!servicesEnabled) {
                setPermissionStatus('disabled');
                setErrorMessage('GPS/location services are disabled. Please enable location services on your device.');
                setIsLoadingLocation(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            const coords = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            };

            setUserLocation(coords);

            const newRegion = {
                ...coords,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
            };
            setMapRegion(newRegion);

            // Animate map camera to the user location
            mapRef.current?.animateToRegion(newRegion, 1000);
            
            // Set status to granted if it succeeded
            setPermissionStatus('granted');
        } catch (error) {
            console.error('Error fetching current location:', error);
            setErrorMessage('Could not retrieve your current location. Please check your signal and try again.');
        } finally {
            setIsLoadingLocation(false);
        }
    };

    const handleRecenter = async () => {
        if (permissionStatus !== 'granted') {
            await requestLocationPermission();
            return;
        }

        if (userLocation) {
            const targetRegion = {
                ...userLocation,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
            };
            mapRef.current?.animateToRegion(targetRegion, 1000);
        } else {
            await fetchCurrentLocation();
        }
    };

    const toggleMapType = () => {
        setMapType(prev => prev === 'standard' ? 'hybrid' : 'standard');
    };

    return (
        <Screen style={styles.container} isSafe={false}>
            {/* Map Component */}
            <MapComponent 
                ref={mapRef}
                region={mapRegion}
                onRegionChangeComplete={(region) => setMapRegion(region)}
                userLocation={userLocation}
                mapType={mapType}
            />

            {/* Top Search Bar */}
            <View style={styles.topSearchContainer}>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color={colors['on-surface-variant']} />
                    <TextInput 
                        style={styles.searchInput}
                        placeholder="Search nearby safe zones..."
                        placeholderTextColor={colors['on-surface-variant']}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    <TouchableOpacity style={styles.micButton}>
                        <Ionicons name="mic" size={20} color={colors.primary} />
                    </TouchableOpacity>
                </View>

                {/* Connection Status Row */}
                <View style={styles.statusRow}>
                    <View style={styles.statusChip}>
                        <Ionicons 
                            name={permissionStatus === 'granted' ? "shield-checkmark" : "warning"} 
                            size={16} 
                            color={permissionStatus === 'granted' ? "green" : colors.error} 
                        />
                        <Text variant="labelMd" style={{ color: colors['on-surface'] }}>
                            {permissionStatus === 'granted' ? "GPS Active" : "Location Required"}
                        </Text>
                    </View>
                    <View style={styles.statusChip}>
                        <Ionicons name="cellular" size={16} color="green" />
                        <Text variant="labelMd" style={{ color: colors['on-surface'] }}>Strong Signal</Text>
                    </View>
                </View>
            </View>

            {/* Right Floating Actions */}
            <View style={styles.floatingActionsRight}>
                <TouchableOpacity style={styles.fabSmall} onPress={handleRecenter}>
                    <Ionicons name="locate" size={24} color={colors['on-surface-variant']} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.fabSmall} onPress={fetchCurrentLocation}>
                    {isLoadingLocation ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                        <Ionicons name="refresh" size={24} color={colors['on-surface-variant']} />
                    )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.fabSmall} onPress={toggleMapType}>
                    <Ionicons name="layers" size={24} color={colors['on-surface-variant']} />
                </TouchableOpacity>

                {/* Risk Legend */}
                <View style={styles.legendContainer}>
                    <Text variant="labelMd" color={colors['on-surface-variant']} style={{ marginBottom: 4, textTransform: 'uppercase' }}>Risk Legend</Text>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
                        <Text variant="labelMd">Safe</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#facc15' }]} />
                        <Text variant="labelMd">Caution</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#f97316' }]} />
                        <Text variant="labelMd">Moderate</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
                        <Text variant="labelMd">High</Text>
                    </View>
                </View>
            </View>

            {/* Main SOS FAB */}
            <TouchableOpacity style={styles.sosFab} onPress={() => navigation.navigate('SOS')}>
                <Ionicons name="warning" size={32} color={colors['on-error']} />
            </TouchableOpacity>

            {/* Location Permission Fallback Banner Overlay */}
            {permissionStatus !== 'granted' && (
                <View style={styles.permissionOverlay}>
                    <View style={styles.permissionCard}>
                        <View style={styles.permissionIconContainer}>
                            <Ionicons 
                                name={permissionStatus === 'disabled' ? "location-outline" : "lock-closed-outline"} 
                                size={32} 
                                color={colors.primary} 
                            />
                        </View>
                        <Text variant="headlineSm" style={styles.permissionTitle}>
                            {permissionStatus === 'checking' && "Checking Location Status..."}
                            {permissionStatus === 'disabled' && "Location Services Disabled"}
                            {permissionStatus === 'denied' && "Location Access Required"}
                            {permissionStatus === 'permanently_denied' && "Permission Permanently Denied"}
                            {permissionStatus === 'error' && "Location Error"}
                        </Text>
                        <Text variant="bodyMd" color={colors['on-surface-variant']} style={styles.permissionMessage}>
                            {permissionStatus === 'checking' && "Please wait while we establish location permissions."}
                            {permissionStatus === 'disabled' && "GPS/Location services are disabled on your device. Please enable location to find safe zones around you."}
                            {permissionStatus === 'denied' && "SafeTours requires access to your location to display your position and navigate safely."}
                            {permissionStatus === 'permanently_denied' && "Location permission was permanently denied. Please navigate to settings to grant location access manually."}
                            {permissionStatus === 'error' && (errorMessage || "An unexpected error occurred while loading map coordinates.")}
                        </Text>
                        
                        {permissionStatus !== 'checking' && (
                            <TouchableOpacity 
                                style={styles.permissionButton} 
                                onPress={
                                    permissionStatus === 'permanently_denied' 
                                        ? () => Linking.openSettings() 
                                        : requestLocationPermission
                                }
                            >
                                <Text variant="labelLg" color={colors['on-primary']} style={{ fontWeight: 'bold' }}>
                                    {permissionStatus === 'permanently_denied' ? "Open Settings" : "Grant Permission"}
                                </Text>
                            </TouchableOpacity>
                        )}
                        {permissionStatus === 'checking' && (
                            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.md }} />
                        )}
                    </View>
                </View>
            )}

            {/* Bottom Sheet */}
            <View style={[styles.bottomSheet, bottomSheetExpanded && styles.bottomSheetExpanded]}>
                <TouchableOpacity 
                    style={styles.sheetHandleContainer}
                    onPress={() => setBottomSheetExpanded(!bottomSheetExpanded)}
                >
                    <View style={styles.sheetHandle} />
                </TouchableOpacity>

                <View style={styles.sheetHeader}>
                    <View>
                        <Text variant="labelMd" color={colors['on-surface-variant']} style={{ textTransform: 'uppercase', marginBottom: 2 }}>Current Zone</Text>
                        <Text variant="headlineMd" style={{ fontWeight: 'bold' }}>Plaza Mayor</Text>
                    </View>
                    <View style={styles.weatherBadge}>
                        <Ionicons name="cloud" size={18} color={colors.tertiary} />
                        <Text variant="labelLg" color={colors.tertiary}>24°C Sunny</Text>
                    </View>
                </View>

                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <View style={styles.statIconContainer}>
                            <Ionicons name="checkmark-circle" size={24} color="#15803d" />
                        </View>
                        <View>
                            <Text variant="labelMd" color={colors['on-surface-variant']}>Risk Level</Text>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold', color: '#15803d' }}>Low</Text>
                        </View>
                    </View>

                    <View style={styles.statCard}>
                        <View style={styles.statIconContainer}>
                            <Ionicons name="shield-checkmark" size={24} color="#15803d" />
                        </View>
                        <View>
                            <Text variant="labelMd" color={colors['on-surface-variant']}>Patrol Frequency</Text>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold', color: '#15803d' }}>High</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.actionButtonsRow}>
                    <TouchableOpacity style={styles.routeBtn} onPress={() => navigation.navigate('LiveJourney')}>
                        <Ionicons name="navigate" size={20} color={colors['on-primary']} />
                        <Text variant="labelLg" color={colors['on-primary']}>Route Home</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.shareBtn}>
                        <Ionicons name="share-social" size={20} color={colors.primary} />
                        <Text variant="labelLg" color={colors.primary}>Share Location</Text>
                    </TouchableOpacity>
                </View>
                
                {/* Space for bottom nav */}
                <View style={{ height: 60 }} />
            </View>
        </Screen>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    topSearchContainer: {
        position: 'absolute',
        top: spacing.xl + 20, // push below status bar
        left: spacing.md,
        right: spacing.md,
        zIndex: 10,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: shapes.roundedPill,
        paddingHorizontal: spacing.md,
        height: 56,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    searchInput: {
        flex: 1,
        marginLeft: spacing.sm,
        fontSize: typography.sizes.bodyLg,
        color: colors['on-surface'],
    },
    micButton: {
        padding: spacing.sm,
    },
    statusRow: {
        flexDirection: 'row',
        marginTop: spacing.sm,
        gap: spacing.sm,
    },
    statusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    floatingActionsRight: {
        position: 'absolute',
        top: 180,
        right: spacing.md,
        alignItems: 'flex-end',
        gap: spacing.sm,
        zIndex: 10,
    },
    fabSmall: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    legendContainer: {
        marginTop: spacing.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: spacing.md,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginVertical: 4,
    },
    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    sosFab: {
        position: 'absolute',
        bottom: 240,
        right: spacing.lg,
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
        backgroundColor: colors.surface,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: spacing.lg,
        paddingBottom: spacing.xxl,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 15,
        zIndex: 30,
        transform: [{ translateY: 60 }], // Partially hidden state (placeholder logic)
    },
    bottomSheetExpanded: {
        transform: [{ translateY: 0 }],
    },
    sheetHandleContainer: {
        alignItems: 'center',
        paddingVertical: spacing.sm,
        marginBottom: spacing.md,
    },
    sheetHandle: {
        width: 48,
        height: 6,
        backgroundColor: 'rgba(217, 194, 183, 0.4)',
        borderRadius: 3,
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.lg,
    },
    weatherBadge: {
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
    statsGrid: {
        flexDirection: 'row',
        gap: spacing.md,
        marginBottom: spacing.xl,
    },
    statCard: {
        flex: 1,
        backgroundColor: colors['surface-container-low'],
        padding: spacing.md,
        borderRadius: shapes.roundedLg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.2)',
    },
    statIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#dcfce7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonsRow: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    routeBtn: {
        flex: 1,
        height: 56,
        backgroundColor: colors.primary,
        borderRadius: shapes.roundedPill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    shareBtn: {
        flex: 1,
        height: 56,
        backgroundColor: colors['surface-container-high'],
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: 'rgba(113, 85, 72, 0.2)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    permissionOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(33, 26, 22, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.lg,
        zIndex: 50,
    },
    permissionCard: {
        backgroundColor: colors.surface,
        borderRadius: shapes.roundedLg,
        padding: spacing.lg,
        alignItems: 'center',
        width: '100%',
        maxWidth: 340,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 15,
        elevation: 10,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    permissionIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(182, 115, 73, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md,
    },
    permissionTitle: {
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: spacing.sm,
        color: colors.primary,
    },
    permissionMessage: {
        textAlign: 'center',
        marginBottom: spacing.lg,
        lineHeight: 20,
    },
    permissionButton: {
        backgroundColor: colors.primary,
        borderRadius: shapes.roundedPill,
        paddingVertical: 12,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
});
