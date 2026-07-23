import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Dimensions, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { MapComponent, getRiskColors } from '../../components/MapComponent';
import { dangerZoneService } from '../../services/dangerZoneService';

const { width, height } = Dimensions.get('window');

// Default fallback region
const DEFAULT_REGION = {
    latitude: 18.9220,
    longitude: 72.8347,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
};

export const SafetyMapScreen = () => {
    const navigation = useNavigation();
    const [searchQuery, setSearchQuery] = useState('');
    const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
    
    // Map & Location states
    const [userLocation, setUserLocation] = useState(null);
    const [mapRegion, setMapRegion] = useState(DEFAULT_REGION);
    const [mapType, setMapType] = useState('standard');
    
    // Permission and location loading states
    const [permissionStatus, setPermissionStatus] = useState('checking'); // checking, granted, denied, permanently_denied, disabled, error
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

    // Danger Zone integration states
    const [dangerZones, setDangerZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState(null);
    const [currentZone, setCurrentZone] = useState(null);
    const [isLoadingDangerZones, setIsLoadingDangerZones] = useState(false);
    const [dangerZoneError, setDangerZoneError] = useState(null);

    const mapRef = useRef(null);

    // Initial check/request on mount
    useEffect(() => {
        requestLocationPermission();
    }, []);

    // Periodic auto-refresh of danger zones (every 30 seconds)
    useEffect(() => {
        if (permissionStatus === 'granted') {
            loadDangerZones();
        }

        const autoRefreshInterval = setInterval(() => {
            if (permissionStatus === 'granted') {
                loadDangerZones(null, true); // silent background refresh
            }
        }, 30000);

        return () => clearInterval(autoRefreshInterval);
    }, [permissionStatus, userLocation?.latitude, userLocation?.longitude]);

    const requestLocationPermission = async () => {
        try {
            setPermissionStatus('checking');
            setErrorMessage(null);

            const servicesEnabled = await Location.hasServicesEnabledAsync();
            if (!servicesEnabled) {
                setPermissionStatus('disabled');
                setErrorMessage('GPS/location services are disabled. Please enable location services on your device.');
                return;
            }

            const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
            
            if (existingStatus === 'granted') {
                setPermissionStatus('granted');
                await fetchCurrentLocation();
                return;
            }

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
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            };
            setMapRegion(newRegion);
            mapRef.current?.animateToRegion(newRegion, 1000);
            
            setPermissionStatus('granted');
            loadDangerZones(coords);
        } catch (error) {
            console.error('Error fetching current location:', error);
            setErrorMessage('Could not retrieve your current location. Please check your signal and try again.');
        } finally {
            setIsLoadingLocation(false);
        }
    };

    const loadDangerZones = async (coords = null, isSilent = false) => {
        if (!isSilent) setIsLoadingDangerZones(true);
        setDangerZoneError(null);

        const lat = coords ? coords.latitude : userLocation?.latitude;
        const lng = coords ? coords.longitude : userLocation?.longitude;

        let res;
        if (lat && lng) {
            res = await dangerZoneService.getNearbyDangerZones(lat, lng, 3000);
        } else {
            res = await dangerZoneService.getDangerZones();
        }

        if (res.success) {
            const zones = res.data || [];
            setDangerZones(zones);

            if (zones.length > 0) {
                const primaryZone = zones[0];
                setCurrentZone(primaryZone);
                if (!selectedZone) {
                    setSelectedZone(primaryZone);
                }
            }
        } else {
            setDangerZoneError(res.error?.message || 'Failed to load danger zones');
        }

        if (!isSilent) setIsLoadingDangerZones(false);
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

    const handleSelectZone = (zone) => {
        setSelectedZone(zone);
        setBottomSheetExpanded(true);

        // Extract coordinates to center map
        let latitude = null;
        let longitude = null;
        if (zone.location && Array.isArray(zone.location.coordinates)) {
            longitude = zone.location.coordinates[0];
            latitude = zone.location.coordinates[1];
        } else if (zone.latitude && zone.longitude) {
            latitude = Number(zone.latitude);
            longitude = Number(zone.longitude);
        }

        if (latitude && longitude && mapRef.current) {
            mapRef.current.animateToRegion({
                latitude,
                longitude,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
            }, 800);
        }
    };

    // Filter danger zones based on search query
    const filteredDangerZones = searchQuery.trim()
        ? dangerZones.filter(z => 
            (z.hotspotId && String(z.hotspotId).includes(searchQuery)) ||
            (z.riskLevel && z.riskLevel.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (z.crimeTypes && z.crimeTypes.toLowerCase().includes(searchQuery.toLowerCase()))
          )
        : dangerZones;

    const activeZone = selectedZone || currentZone || (dangerZones.length > 0 ? dangerZones[0] : null);
    const activeRiskColors = activeZone ? getRiskColors(activeZone.riskLevel, activeZone.totalRiskScore ?? activeZone.crimeScore) : getRiskColors('SAFE');

    return (
        <Screen style={styles.container} isSafe={false}>
            {/* Map Component */}
            <MapComponent 
                ref={mapRef}
                region={mapRegion}
                onRegionChangeComplete={(region) => setMapRegion(region)}
                userLocation={userLocation}
                mapType={mapType}
                dangerZones={filteredDangerZones}
                selectedZone={activeZone}
                onSelectZone={handleSelectZone}
            />

            {/* Top Search Bar */}
            <View style={styles.topSearchContainer}>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color={colors['on-surface-variant']} />
                    <TextInput 
                        style={styles.searchInput}
                        placeholder="Search zones by ID, risk, or crime..."
                        placeholderTextColor={colors['on-surface-variant']}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery ? (
                        <TouchableOpacity style={styles.micButton} onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={20} color={colors.outline} />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.micButton}>
                            <Ionicons name="mic" size={20} color={colors.primary} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Connection & Danger Zone Count Status Row */}
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
                        <Ionicons name="radio" size={16} color={colors.primary} />
                        <Text variant="labelMd" style={{ color: colors['on-surface'] }}>
                            {isLoadingDangerZones ? "Loading Zones..." : `${dangerZones.length} Zones Active`}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Right Floating Actions */}
            <View style={styles.floatingActionsRight}>
                <TouchableOpacity style={styles.fabSmall} onPress={handleRecenter}>
                    <Ionicons name="locate" size={24} color={colors['on-surface-variant']} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.fabSmall} onPress={() => loadDangerZones()}>
                    {isLoadingLocation || isLoadingDangerZones ? (
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
                        <Text variant="labelMd">Low</Text>
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

            {/* Location Permission Fallback Overlay */}
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

                {/* Error Banner if Zone Fetch Failed */}
                {dangerZoneError && (
                    <View style={styles.errorBanner}>
                        <Ionicons name="alert-circle" size={20} color={colors.error} />
                        <Text variant="labelMd" style={{ color: colors.error, flex: 1 }}>{dangerZoneError}</Text>
                        <TouchableOpacity style={styles.retryBtn} onPress={() => loadDangerZones()}>
                            <Text variant="labelMd" style={{ color: colors.primary, fontWeight: 'bold' }}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {isLoadingDangerZones && !activeZone ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text variant="labelLg" color={colors['on-surface-variant']} style={{ marginTop: 8 }}>
                            Loading danger zone details...
                        </Text>
                    </View>
                ) : activeZone ? (
                    <>
                        <View style={styles.sheetHeader}>
                            <View style={{ flex: 1 }}>
                                <Text variant="labelMd" color={colors['on-surface-variant']} style={{ textTransform: 'uppercase', marginBottom: 2 }}>
                                    {selectedZone ? "Selected Zone" : "Current Area"}
                                </Text>
                                <Text variant="headlineMd" style={{ fontWeight: 'bold' }}>
                                    {activeZone.hotspotId 
                                        ? `Hotspot #${activeZone.hotspotId}` 
                                        : (activeZone.h3Index ? `Cell ${activeZone.h3Index.substring(0, 10)}...` : 'Zone Info')}
                                </Text>
                            </View>

                            <View style={[styles.riskLevelBadge, { backgroundColor: activeRiskColors.fill, borderColor: activeRiskColors.stroke }]}>
                                <View style={[styles.legendDot, { backgroundColor: activeRiskColors.solid }]} />
                                <Text variant="labelLg" style={{ color: activeRiskColors.stroke, fontWeight: 'bold' }}>
                                    {activeZone.riskLevel || activeRiskColors.label}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.statsGrid}>
                            <View style={styles.statCard}>
                                <View style={[styles.statIconContainer, { backgroundColor: activeRiskColors.fill }]}>
                                    <Ionicons name="warning" size={22} color={activeRiskColors.stroke} />
                                </View>
                                <View>
                                    <Text variant="labelMd" color={colors['on-surface-variant']}>Crime Score</Text>
                                    <Text variant="headlineSm" style={{ fontWeight: 'bold', color: activeRiskColors.stroke }}>
                                        {Math.round(activeZone.totalRiskScore ?? activeZone.crimeScore ?? 0)} / 100
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.statCard}>
                                <View style={styles.statIconContainer}>
                                    <Ionicons name="stats-chart" size={22} color={colors.primary} />
                                </View>
                                <View>
                                    <Text variant="labelMd" color={colors['on-surface-variant']}>Crime Incidents</Text>
                                    <Text variant="headlineSm" style={{ fontWeight: 'bold', color: colors.primary }}>
                                        {activeZone.crimeCount ?? 'N/A'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Extra Detail Rows */}
                        <View style={styles.detailsContainer}>
                            <View style={styles.detailRow}>
                                <Ionicons name="pricetag" size={16} color={colors['on-surface-variant']} />
                                <Text variant="labelLg" color={colors['on-surface-variant']}>Dominant Types:</Text>
                                <Text variant="labelLg" style={{ fontWeight: 'bold', flex: 1 }} numberOfLines={1}>
                                    {activeZone.crimeTypes || 'General Incidents'}
                                </Text>
                            </View>

                            {activeZone.averageCrimeSeverity !== undefined && (
                                <View style={styles.detailRow}>
                                    <Ionicons name="shield-outline" size={16} color={colors['on-surface-variant']} />
                                    <Text variant="labelLg" color={colors['on-surface-variant']}>Avg Severity:</Text>
                                    <Text variant="labelLg" style={{ fontWeight: 'bold' }}>
                                        {Number(activeZone.averageCrimeSeverity).toFixed(1)} / 10
                                    </Text>
                                </View>
                            )}

                            {activeZone.distanceInMeters !== undefined && (
                                <View style={styles.detailRow}>
                                    <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                                    <Text variant="labelLg" color={colors.primary}>Proximity:</Text>
                                    <Text variant="labelLg" style={{ fontWeight: 'bold', color: colors.primary }}>
                                        {Math.round(activeZone.distanceInMeters)} meters away
                                    </Text>
                                </View>
                            )}
                        </View>
                    </>
                ) : (
                    <View style={styles.loadingContainer}>
                        <Ionicons name="shield-checkmark" size={32} color="green" />
                        <Text variant="headlineSm" style={{ fontWeight: 'bold', marginTop: 8 }}>Area Safe</Text>
                        <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ textAlign: 'center', marginTop: 4 }}>
                            No active danger zones detected in your immediate radius.
                        </Text>
                    </View>
                )}

                <View style={[styles.actionButtonsRow, { marginTop: spacing.md }]}>
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
        top: spacing.xl + 20,
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
        transform: [{ translateY: 60 }],
    },
    bottomSheetExpanded: {
        transform: [{ translateY: 0 }],
    },
    sheetHandleContainer: {
        alignItems: 'center',
        paddingVertical: spacing.sm,
        marginBottom: spacing.sm,
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
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    riskLevelBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: spacing.md,
        marginBottom: spacing.md,
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
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(182, 115, 73, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailsContainer: {
        backgroundColor: colors['surface-container-low'],
        borderRadius: shapes.roundedLg,
        padding: spacing.md,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.2)',
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xl,
    },
    errorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors['error-container'] || '#ffdad6',
        padding: spacing.sm + 2,
        borderRadius: shapes.roundedSm,
        marginBottom: spacing.sm,
    },
    retryBtn: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
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
