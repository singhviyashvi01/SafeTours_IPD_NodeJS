import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Dimensions, ActivityIndicator, Linking, ScrollView, Modal } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { MapComponent, getRiskColors } from '../../components/MapComponent';
import { dangerZoneService } from '../../services/dangerZoneService';
import { locationService } from '../../services/locationService';
import { communityService } from '../../services/communityService';
import { sosService } from '../../services/sos';
import { journeyService } from '../../services/journeys';
import { profileService } from '../../services/profile';
import { geofenceManager, calculateDistanceMeters } from '../../utils/geofenceManager';
import { LocationStatusModal } from '../../components/LocationStatusModal';
import { useSidebar } from '../../context/SidebarContext';
import { smsService } from '../../services/smsService';

const { width, height } = Dimensions.get('window');

// Default fallback region
const DEFAULT_REGION = {
    latitude: 18.9220,
    longitude: 72.8347,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
};

// ── Dharavi Hardcoded VERY HIGH Risk Area ───────────────────────────────────
const DHARAVI_BOUNDS = {
    minLat: 19.034, maxLat: 19.068,
    minLng: 72.845, maxLng: 72.880,
};
const DHARAVI_RISK_TEMPLATE = {
    h3Index: '89608b1a64fffff',
    totalRiskScore: 91,
    riskLevel: 'EXTREME',
    breakdown: { crime: 95, weather: 55, news: 80, crowd: 98, community: 85, infra: 90, time: 100 },
    hotspot: { hotspotId: 'DHARAVI-001', distanceInMeters: 0, crimeTypes: 'Theft, Assault, Harassment', crimeCount: 48, averageCrimeSeverity: 8.9 },
};
const isDharaviLocation = (lat, lng) =>
    lat >= DHARAVI_BOUNDS.minLat && lat <= DHARAVI_BOUNDS.maxLat &&
    lng >= DHARAVI_BOUNDS.minLng && lng <= DHARAVI_BOUNDS.maxLng;
// ────────────────────────────────────────────────────────────────────────────

export const SafetyMapScreen = ({ route }) => {
    const navigation = useNavigation();
    const { toggleDrawer } = useSidebar();
    const [searchQuery, setSearchQuery] = useState('');

    // ── Destination Search States ──────────────────────────────────────────────
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
    const [destination, setDestination] = useState(null); // { latitude, longitude, name, address }
    const [destinationRisk, setDestinationRisk] = useState(null); // nearby danger zones for destination
    const [destinationDistance, setDestinationDistance] = useState(null); // meters from user
    const [showDestinationPanel, setShowDestinationPanel] = useState(false);
    const autocompleteTimerRef = useRef(null);
    
    // ── Single-Source-Of-Truth Location Risk States (Python Score Engine) ──────
    const [destinationRiskData, setDestinationRiskData] = useState(null);
    const [isDestinationRiskLoading, setIsDestinationRiskLoading] = useState(false);
    const [destinationRiskError, setDestinationRiskError] = useState(null);

    const [currentLocationRiskData, setCurrentLocationRiskData] = useState(null);
    const [isCurrentRiskLoading, setIsCurrentRiskLoading] = useState(false);
    const [currentRiskError, setCurrentRiskError] = useState(null);
    // Panel visibility: user must tap "View Location Risk" to see current risk details
    const [showCurrentRiskPanel, setShowCurrentRiskPanel] = useState(false);
    // ─────────────────────────────────────────────────────────────────────────
    const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
    
    // Map & Location states
    const [userLocation, setUserLocation] = useState(null);
    const [locationAccuracy, setLocationAccuracy] = useState(10);
    const [lastUpdateTime, setLastUpdateTime] = useState(null);
    const [mapRegion, setMapRegion] = useState(DEFAULT_REGION);
    const [mapType, setMapType] = useState('standard');
    
    // Tracking & Permission states
    const [permissionStatus, setPermissionStatus] = useState('checking'); // checking, granted, denied, permanently_denied, disabled, error
    const [trackingActive, setTrackingActive] = useState(false);
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

    // Danger Zone integration states
    const [dangerZones, setDangerZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState(null);
    const [currentZone, setCurrentZone] = useState(null);
    const [isLoadingDangerZones, setIsLoadingDangerZones] = useState(false);
    const [dangerZoneError, setDangerZoneError] = useState(null);

    // Geofencing UI Feedback Toast
    const [geofenceToast, setGeofenceToast] = useState(null);

    // Diagnostics Status Modal State
    const [showStatusModal, setShowStatusModal] = useState(false);

    // Community Incidents states
    const [communityIncidents, setCommunityIncidents] = useState([]);
    const [showCommunityFeed, setShowCommunityFeed] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [selectedIncidentType, setSelectedIncidentType] = useState('Harassment');
    const [incidentDescription, setIncidentDescription] = useState('');
    const [isSubmittingIncident, setIsSubmittingIncident] = useState(false);
    const [incidentMessage, setIncidentMessage] = useState(null);
    const [isLoadingCommunity, setIsLoadingCommunity] = useState(false);
    const [communityError, setCommunityError] = useState(null);

    const mapRef = useRef(null);
    const locationSubscription = useRef(null);
    const lastSyncedCoords = useRef(null);
    const automaticSosZoneId = useRef(null);
    const dangerZonesRef = useRef([]);
    const autoSosEnabledRef = useRef(false);
    const autocompleteTimerRef2 = autocompleteTimerRef; // alias for clarity in cleanup

    // ── Destination Search Handlers ────────────────────────────────────────────

    // ── Single Source of Truth Risk Fetching Helpers ───────────────────────────
    const fetchDestinationRiskData = async (latitude, longitude) => {
        setIsDestinationRiskLoading(true);
        setDestinationRiskError(null);

        // Hardcoded Dharavi override — always EXTREME / Very High risk
        if (isDharaviLocation(latitude, longitude)) {
            setDestinationRiskData({
                ...DHARAVI_RISK_TEMPLATE,
                location: { latitude, longitude },
                updatedAt: new Date().toISOString(),
            });
            setIsDestinationRiskLoading(false);
            return;
        }

        const res = await dangerZoneService.getLocationRisk(latitude, longitude);
        if (res.success && res.data) {
            setDestinationRiskData(res.data);
        } else {
            setDestinationRiskError(res.error?.message || 'Unable to retrieve location risk score from Risk Score Engine.');
        }
        setIsDestinationRiskLoading(false);
    };

    const fetchCurrentLocationRiskData = async (latitude, longitude) => {
        setIsCurrentRiskLoading(true);
        setCurrentRiskError(null);
        const res = await dangerZoneService.getLocationRisk(latitude, longitude);
        if (res.success && res.data) {
            setCurrentLocationRiskData(res.data);
        } else {
            setCurrentRiskError(res.error?.message || 'Unable to retrieve current location risk score from Risk Score Engine.');
        }
        setIsCurrentRiskLoading(false);
    };

    /**
     * Debounced autocomplete: fires geocode suggestions ~500ms after user stops typing.
     * Uses expo-location geocodeAsync which is available without an extra API key.
     */
    const handleSearchTextChange = (text) => {
        setSearchQuery(text);
        setSearchError(null);

        // Clear destination when user edits the query
        if (destination) {
            setDestination(null);
            setDestinationRisk(null);
            setDestinationRiskData(null);
            setDestinationRiskError(null);
            setDestinationDistance(null);
            setShowDestinationPanel(false);
        }

        if (autocompleteTimerRef.current) {
            clearTimeout(autocompleteTimerRef.current);
        }

        if (!text || text.trim().length < 2) {
            setSuggestions([]);
            return;
        }

        setIsSuggestionsLoading(true);
        autocompleteTimerRef.current = setTimeout(async () => {
            try {
                const results = await Location.geocodeAsync(text.trim());
                if (results && results.length > 0) {
                    // Reverse-geocode each candidate to get a readable address
                    const enriched = await Promise.all(
                        results.slice(0, 5).map(async (r) => {
                            try {
                                const [place] = await Location.reverseGeocodeAsync({
                                    latitude: r.latitude,
                                    longitude: r.longitude,
                                });
                                const name = place
                                    ? [place.name, place.district, place.city, place.region, place.country]
                                          .filter(Boolean)
                                          .join(', ')
                                    : `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`;
                                return { latitude: r.latitude, longitude: r.longitude, name };
                            } catch {
                                return {
                                    latitude: r.latitude,
                                    longitude: r.longitude,
                                    name: `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`,
                                };
                            }
                        })
                    );
                    // Deduplicate by rounded coordinate
                    const seen = new Set();
                    const unique = enriched.filter((s) => {
                        const key = `${s.latitude.toFixed(4)}_${s.longitude.toFixed(4)}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                    setSuggestions(unique);
                } else {
                    setSuggestions([]);
                }
            } catch (err) {
                console.warn('[Autocomplete] geocode error:', err);
                setSuggestions([]);
            } finally {
                setIsSuggestionsLoading(false);
            }
        }, 500);
    };

    /**
     * Called when user taps a suggestion or submits the search bar.
     * Geocodes the query, moves the camera, places a destination marker,
     * and fetches calculated location risk score from backend score-service.
     */
    const handleSearchDestination = async (overrideQuery = null) => {
        const query = (overrideQuery || searchQuery).trim();
        if (!query) return;

        // Dismiss suggestions & keyboard
        setSuggestions([]);
        setIsSearchFocused(false);
        setIsSearching(true);
        setSearchError(null);
        setShowDestinationPanel(false);

        try {
            const results = await Location.geocodeAsync(query);
            if (!results || results.length === 0) {
                setSearchError(`No location found for "${query}". Please try a different search.`);
                setIsSearching(false);
                return;
            }

            const { latitude, longitude } = results[0];

            // Reverse-geocode for display
            let placeName = query;
            let fullAddress = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            try {
                const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
                if (place) {
                    placeName = place.name || place.district || place.city || query;
                    fullAddress = [
                        place.streetNumber,
                        place.street,
                        place.district,
                        place.city,
                        place.region,
                        place.postalCode,
                        place.country,
                    ]
                        .filter(Boolean)
                        .join(', ');
                }
            } catch {}

            const dest = { latitude, longitude, name: placeName, address: fullAddress };
            setDestination(dest);
            setSearchQuery(placeName);

            // Animate camera to destination
            const destRegion = {
                latitude,
                longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            };
            setMapRegion(destRegion);
            mapRef.current?.animateToRegion(destRegion, 1000);

            // Distance from user's current location
            if (userLocation) {
                const dist = calculateDistanceMeters(
                    userLocation.latitude,
                    userLocation.longitude,
                    latitude,
                    longitude
                );
                setDestinationDistance(dist);
            }

            // Fetch calculated single-source-of-truth location risk score from backend score-service
            fetchDestinationRiskData(latitude, longitude);

            // Fetch nearby danger zones for the destination
            const riskRes = await dangerZoneService.getNearbyDangerZones(latitude, longitude, 3000);
            if (riskRes.success) {
                setDestinationRisk(riskRes.data || []);
            } else {
                setDestinationRisk([]);
            }

            // Do not show location details automatically upon search.
            // Display them only when the user taps the marker or selects "View Details".
            setShowDestinationPanel(false);
        } catch (err) {
            console.error('[Destination Search] Error:', err);
            setSearchError('An error occurred while searching. Please try again.');
        } finally {
            setIsSearching(false);
        }
    };

    /**
     * Triggered when user taps destination marker or "View Details" chip
     */
    const handleOpenDestinationDetails = () => {
        setShowDestinationPanel(true);
        setBottomSheetExpanded(true);
    };

    /**
     * Tap a suggestion chip → set query and immediately geocode
     */
    const handleSelectSuggestion = (suggestion) => {
        setSearchQuery(suggestion.name);
        setSuggestions([]);
        setIsSearchFocused(false);
        handleSearchDestination(suggestion.name);
    };

    /**
     * Clear the destination and reset search state
     */
    const handleClearDestination = () => {
        setDestination(null);
        setDestinationRisk(null);
        setDestinationRiskData(null);
        setDestinationRiskError(null);
        setIsDestinationRiskLoading(false);
        setDestinationDistance(null);
        setShowDestinationPanel(false);
        setSearchQuery('');
        setSuggestions([]);
        setSearchError(null);
        // Restore camera to user location if available
        if (userLocation) {
            const userRegion = {
                ...userLocation,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            };
            setMapRegion(userRegion);
            mapRef.current?.animateToRegion(userRegion, 800);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────

    const loadCommunityIncidents = async (coordinates = null) => {
        setIsLoadingCommunity(true);
        setCommunityError(null);
        const lat = coordinates?.latitude || userLocation?.latitude || 18.9220;
        const lng = coordinates?.longitude || userLocation?.longitude || 72.8347;
        const res = await communityService.getNearbyIncidents(lat, lng, 5000);
        if (res.success) {
            setCommunityIncidents(res.data || []);
        } else {
            setCommunityError(res.error?.message || 'Could not load nearby community reports.');
        }
        setIsLoadingCommunity(false);
    };

    // Auto SOS is opt-in. This reads the user's existing Person 1 profile setting
    // and never changes it from the map screen.
    const loadAutoSosSetting = async () => {
        try {
            const profile = await profileService.getProfile();
            const enabled = Boolean(profile?.emergencySettings?.autoSOS);
            autoSosEnabledRef.current = enabled;
        } catch (error) {
            // A profile read failure must not stop map tracking or trigger SOS unexpectedly.
            console.warn('Could not read Auto SOS setting:', error);
        }
    };

    const handleReportIncidentSubmit = async () => {
        if (!incidentDescription || incidentDescription.trim().length < 5) {
            setIncidentMessage('Please enter a description of at least 5 characters.');
            return;
        }

        setIsSubmittingIncident(true);
        setIncidentMessage(null);

        const lat = userLocation?.latitude || 18.9220;
        const lng = userLocation?.longitude || 72.8347;

        const res = await communityService.reportIncident({
            incidentType: selectedIncidentType,
            description: incidentDescription.trim(),
            latitude: lat,
            longitude: lng,
        });

        setIsSubmittingIncident(false);

        if (res.success) {
            setIncidentDescription('');
            setShowReportModal(false);
            loadCommunityIncidents();
            setGeofenceToast(`Incident reported: ${selectedIncidentType}`);
            setTimeout(() => setGeofenceToast(null), 4000);
        } else {
            setIncidentMessage(res.error?.message || 'Failed to report incident.');
        }
    };

    const handleConfirmIncident = async (incidentId) => {
        setIsLoadingCommunity(true);
        setCommunityError(null);
        const res = await communityService.confirmIncident(incidentId);
        if (res.success) {
            loadCommunityIncidents();
        } else {
            setCommunityError(res.error?.message || 'Could not confirm this incident.');
            setIsLoadingCommunity(false);
        }
    };

    const handleReportFalse = async (incidentId) => {
        setIsLoadingCommunity(true);
        setCommunityError(null);
        const res = await communityService.reportFalse(incidentId);
        if (res.success) {
            loadCommunityIncidents();
        } else {
            setCommunityError(res.error?.message || 'Could not flag this incident.');
            setIsLoadingCommunity(false);
        }
    };

    // Initial check/request on mount
    useEffect(() => {
        requestLocationPermission();
        loadAutoSosSetting();

        return () => {
            if (locationSubscription.current) {
                locationSubscription.current.remove();
            }
        };
    }, []);

    useEffect(() => {
        // Community Feed is an existing map feature. A sidebar navigation
        // request simply opens this UI instead of creating another screen.
        if (route?.params?.communityRequestId) {
            loadCommunityIncidents();
            setShowCommunityFeed(true);
        }
    }, [route?.params?.communityRequestId]);

    // Periodic background refresh for danger zone data (every 30 seconds)
    useEffect(() => {
        if (permissionStatus === 'granted') {
            loadDangerZones();
        }

        const autoRefreshInterval = setInterval(() => {
            if (permissionStatus === 'granted') {
                loadDangerZones(null, true);
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
                await startLiveTracking();
                return;
            }

            const { status: requestedStatus } = await Location.requestForegroundPermissionsAsync();
            if (requestedStatus === 'granted') {
                setPermissionStatus('granted');
                await startLiveTracking();
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

    /**
     * Start continuous live GPS position watching
     */
    const startLiveTracking = async () => {
        setIsLoadingLocation(true);
        try {
            // Get initial location snapshot
            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            handleNewLocationFix(location);

            // Center initial map camera
            const initialCoords = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            };
            const newRegion = {
                ...initialCoords,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            };
            setMapRegion(newRegion);
            mapRef.current?.animateToRegion(newRegion, 1000);

            // Subscribe to continuous live location updates
            if (locationSubscription.current) {
                locationSubscription.current.remove();
            }

            locationSubscription.current = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Balanced,
                    timeInterval: 5000, // update every 5 seconds
                    distanceInterval: 10, // update every 10 meters
                },
                (loc) => handleNewLocationFix(loc)
            );

            setTrackingActive(true);
            setPermissionStatus('granted');
            fetchCurrentLocationRiskData(initialCoords.latitude, initialCoords.longitude);
            loadDangerZones(initialCoords);
            loadCommunityIncidents(initialCoords);
        } catch (error) {
            console.error('Error starting live tracking:', error);
            setErrorMessage('Could not establish continuous live tracking. Retrying...');
        } finally {
            setIsLoadingLocation(false);
        }
    };

    /**
     * Handle incoming GPS location fixes smoothly
     */
    const handleNewLocationFix = (location) => {
        if (!location || !location.coords) return;

        const coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
        };

        setUserLocation(coords);
        setLocationAccuracy(location.coords.accuracy || 10);
        const isoTime = new Date(location.timestamp || Date.now()).toISOString();
        setLastUpdateTime(isoTime);

        // Geofence check against active danger zones
        if (dangerZonesRef.current.length > 0) {
            const { activeZone, toastMessage } = geofenceManager.evaluateLocation(coords, dangerZonesRef.current);
            if (activeZone) {
                setCurrentZone(activeZone);
            }
            if (toastMessage) {
                setGeofenceToast(toastMessage);
                setTimeout(() => setGeofenceToast(null), 4000);
            }

            // An automatic alert is only considered once per zone entry, and only
            // when the user explicitly enabled Auto SOS in their existing settings.
            if (activeZone && toastMessage?.startsWith('Entering')) {
                triggerAutomaticSosForZone(activeZone, coords);
            } else if (!activeZone && toastMessage?.startsWith('Leaving')) {
                // Permit a fresh automatic-SOS decision if the user later re-enters a zone.
                automaticSosZoneId.current = null;
            }
        }

        // Send location update to backend if moved significantly (> 20 meters)
        if (
            !lastSyncedCoords.current ||
            calculateDistanceMeters(
                lastSyncedCoords.current.latitude,
                lastSyncedCoords.current.longitude,
                coords.latitude,
                coords.longitude
            ) > 20
        ) {
            lastSyncedCoords.current = coords;
            locationService.syncLocation({
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: location.coords.accuracy,
                speed: location.coords.speed,
                heading: location.coords.heading,
                timestamp: isoTime,
            });
        }
    };

    const triggerAutomaticSosForZone = async (zone, coords) => {
        const zoneId = zone._id || zone.hotspotId || zone.h3Index;
        if (!autoSosEnabledRef.current || !zoneId || automaticSosZoneId.current === zoneId) return;

        automaticSosZoneId.current = zoneId;
        const [journeyResult, locationResult] = await Promise.all([
            journeyService.getActive(),
            locationService.syncLocation({
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: locationAccuracy,
            }),
        ]);

        if (!journeyResult.success || !journeyResult.journey?._id || !locationResult.success || !locationResult.data?._id) {
            setGeofenceToast('Danger-zone warning: Auto SOS needs an active journey and synced location.');
            return;
        }

        const sosResult = await sosService.triggerAutomatic({
            locationId: locationResult.data._id,
            journeyId: journeyResult.journey._id,
            reason: `Entered ${(zone.riskLevel || 'high').toUpperCase()} risk danger zone.`,
        });

        if (sosResult.success) {
            setGeofenceToast('Automatic SOS sent. Opening SMS Composer...');
            smsService.sendSOSTriggerSMS(coords).then((smsRes) => {
                if (smsRes.success) {
                    setGeofenceToast('Automatic SOS sent & SMS Composer opened.');
                } else {
                    setGeofenceToast(`Automatic SOS sent. SMS Alert status: ${smsRes.message}`);
                }
            }).catch((err) => {
                console.error('[SafetyMapScreen] SMS error:', err);
                setGeofenceToast('Automatic SOS sent. SMS failed to open.');
            });
        } else {
            setGeofenceToast(sosResult.error?.message || 'Could not send automatic SOS. Open SOS to retry.');
        }
        setTimeout(() => setGeofenceToast(null), 5000);
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
            dangerZonesRef.current = zones;

            if (zones.length > 0 && lat && lng) {
                const { activeZone } = geofenceManager.evaluateLocation({ latitude: lat, longitude: lng }, zones);
                if (activeZone) {
                    setCurrentZone(activeZone);
                } else {
                    setCurrentZone(zones[0]);
                }
                if (!selectedZone) {
                    setSelectedZone(activeZone || zones[0]);
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
            await startLiveTracking();
        }
    };

    const toggleMapType = () => {
        setMapType(prev => prev === 'standard' ? 'hybrid' : 'standard');
    };

    const handleSelectZone = (zone) => {
        setSelectedZone(zone);
        setBottomSheetExpanded(true);

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
    const locationChatName = activeZone?.hotspotId ? `Near safety zone #${activeZone.hotspotId}` : 'Your current location';
    // Keep the UI data shaped as location groups so real chat messages can be
    // connected later without adding a new API or changing this layout.
    const locationChatGroups = [{ location: locationChatName, preview: 'Local chat will appear here when community chat data is available.' }];

    // Single Source of Truth Risk Information Helpers (Python Score Engine)
    const destinationRiskInfo = (() => {
        if (!destinationRiskData) return null;
        const score = destinationRiskData.totalRiskScore ?? 0;
        const level = destinationRiskData.riskLevel || 'LOW';
        const colors = getRiskColors(level, score);
        return {
            score,
            level,
            label: colors.label,
            colors,
            breakdown: destinationRiskData.breakdown || {},
            hotspot: destinationRiskData.hotspot || null,
        };
    })();

    const currentLocationRiskInfo = (() => {
        if (!currentLocationRiskData) return null;
        const score = currentLocationRiskData.totalRiskScore ?? 0;
        const level = currentLocationRiskData.riskLevel || 'LOW';
        const colors = getRiskColors(level, score);
        return {
            score,
            level,
            label: colors.label,
            colors,
            breakdown: currentLocationRiskData.breakdown || {},
            hotspot: currentLocationRiskData.hotspot || null,
        };
    })();

    return (
        <Screen style={styles.container} isSafe={false}>
            {/* Map Component */}
            <MapComponent 
                ref={mapRef}
                region={mapRegion}
                onRegionChangeComplete={(region) => setMapRegion(region)}
                userLocation={userLocation}
                destinationMarker={destination}
                onSelectDestination={handleOpenDestinationDetails}
                mapType={mapType}
                dangerZones={filteredDangerZones}
                communityIncidents={communityIncidents}
                selectedZone={activeZone}
                onSelectZone={handleSelectZone}
            />

            {/* Top Search & Diagnostics Bar */}
            <View style={styles.topSearchContainer}>
                <View style={styles.searchHeaderRow}>
                    <TouchableOpacity style={styles.menuButton} onPress={toggleDrawer} accessibilityLabel="Open menu">
                        <Ionicons name="menu" size={26} color={colors.primary} />
                    </TouchableOpacity>
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={20} color={colors['on-surface-variant']} />
                        <TextInput 
                            style={styles.searchInput}
                            placeholder="Search destination, address, or zones..."
                            placeholderTextColor={colors['on-surface-variant']}
                            value={searchQuery}
                            onChangeText={handleSearchTextChange}
                            onFocus={() => {
                                setIsSearchFocused(true);
                                // Collapse and hide bottom sheet so keyboard doesn't overlap search
                                setBottomSheetExpanded(false);
                                setShowDestinationPanel(false);
                            }}
                            onBlur={() => setIsSearchFocused(false)}
                            onSubmitEditing={() => handleSearchDestination()}
                            returnKeyType="search"
                            blurOnSubmit={false}
                        />
                        {isSearching ? (
                            <ActivityIndicator size="small" color={colors.primary} style={{ padding: spacing.xs }} />
                        ) : searchQuery ? (
                            <TouchableOpacity style={styles.micButton} onPress={handleClearDestination}>
                                <Ionicons name="close-circle" size={20} color={colors.outline} />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.micButton} onPress={() => handleSearchDestination()}>
                                <Ionicons name="arrow-forward-circle" size={22} color={colors.primary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Floating Searched Location Chip with "View Details" action */}
                {destination && !showDestinationPanel && (
                    <TouchableOpacity style={styles.destinationMarkerChip} onPress={handleOpenDestinationDetails}>
                        <Ionicons name="location-sharp" size={18} color="#e11d48" />
                        <Text variant="labelLg" style={{ flex: 1, fontWeight: 'bold' }} numberOfLines={1}>
                            {destination.name}
                        </Text>
                        <View style={styles.viewDetailsBtnChip}>
                            <Text variant="labelMd" style={{ color: colors.white, fontWeight: 'bold' }}>View Details</Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* Autocomplete Suggestions Dropdown */}
                {isSearchFocused && (suggestions.length > 0 || isSuggestionsLoading) && (
                    <View style={styles.autocompleteDropdown}>
                        {isSuggestionsLoading ? (
                            <View style={styles.autocompleteItem}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ marginLeft: 10 }}>
                                    Finding locations...
                                </Text>
                            </View>
                        ) : (
                            <ScrollView
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                                bounces={false}
                                style={{ maxHeight: 200 }}
                            >
                                {suggestions.map((item, idx) => (
                                    <TouchableOpacity
                                        key={`${item.latitude}_${item.longitude}_${idx}`}
                                        style={styles.autocompleteItem}
                                        onPress={() => handleSelectSuggestion(item)}
                                    >
                                        <Ionicons name="location-outline" size={18} color={colors.primary} />
                                        <Text variant="bodyMd" style={{ flex: 1, color: colors['on-surface'] }} numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                )}

                {/* Search Error Banner */}
                {searchError && (
                    <View style={styles.searchErrorBanner}>
                        <Ionicons name="alert-circle" size={18} color={colors.error} />
                        <Text variant="bodyMd" style={{ color: colors.error, flex: 1 }}>
                            {searchError}
                        </Text>
                        <TouchableOpacity onPress={() => setSearchError(null)}>
                            <Ionicons name="close" size={16} color={colors.error} />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Connection, Live Tracking & Diagnostics Trigger Status Row */}
                <View style={styles.statusRow}>
                    <TouchableOpacity style={styles.statusChip} onPress={() => setShowStatusModal(true)}>
                        <Ionicons 
                            name={trackingActive ? "radio" : "warning"} 
                            size={16} 
                            color={trackingActive ? "green" : colors.error} 
                        />
                        <Text variant="labelMd" style={{ color: colors['on-surface'], fontWeight: 'bold' }}>
                            {trackingActive ? "LIVE TRACKING" : "GPS Required"}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.statusChip} onPress={() => { loadCommunityIncidents(); setShowCommunityFeed(true); }}>
                        <Ionicons name="people-outline" size={16} color={colors.primary} />
                        <Text variant="labelMd" style={{ color: colors['on-surface'] }}>
                            Incidents ({communityIncidents.length})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.statusChip} onPress={() => setShowStatusModal(true)}>
                        <Ionicons name="hardware-chip-outline" size={16} color={colors.primary} />
                        <Text variant="labelMd" style={{ color: colors['on-surface'] }}>
                            Diagnostics
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Geofence Event Alert Toast Banner */}
                {geofenceToast && (
                    <View style={styles.geofenceToastBanner}>
                        <Ionicons name="notifications-outline" size={18} color={colors['on-primary']} />
                        <Text variant="labelLg" style={{ color: colors['on-primary'], fontWeight: 'bold', flex: 1 }}>
                            {geofenceToast}
                        </Text>
                    </View>
                )}
            </View>

            {/* Right Floating Actions */}
            <View style={styles.floatingActionsRight}>
                <TouchableOpacity style={styles.fabSmall} onPress={handleRecenter}>
                    <Ionicons name="locate" size={24} color={colors['on-surface-variant']} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.fabSmall} onPress={() => { loadDangerZones(); loadCommunityIncidents(); }}>
                    {isLoadingLocation || isLoadingDangerZones ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                        <Ionicons name="refresh" size={24} color={colors['on-surface-variant']} />
                    )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.fabSmall} onPress={() => setShowReportModal(true)}>
                    <Ionicons name="megaphone-outline" size={24} color={colors.primary} />
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

            {/* Bottom Sheet Drawer — hidden while search is focused */}
            {!isSearchFocused && (
            <View style={[styles.bottomSheet, bottomSheetExpanded && styles.bottomSheetExpanded]}>
                <TouchableOpacity 
                    style={styles.sheetHandleContainer}
                    onPress={() => setBottomSheetExpanded(!bottomSheetExpanded)}
                >
                    <View style={styles.sheetHandle} />
                </TouchableOpacity>

                {/* Destination Details Card (Shown when a destination is searched) */}
                {destination && showDestinationPanel && (
                    <View style={styles.destinationCard}>
                        {/* Fixed header with place name and close button */}
                        <View style={styles.destinationCardHeader}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                    <Ionicons name="location-sharp" size={16} color="#e11d48" />
                                    <Text variant="labelMd" color={colors.primary} style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>
                                        Searched Destination
                                    </Text>
                                </View>
                                <Text variant="headlineSm" style={{ fontWeight: 'bold' }} numberOfLines={1}>
                                    {destination.name}
                                </Text>
                            </View>
                            <TouchableOpacity style={styles.clearDestBtn} onPress={handleClearDestination}>
                                <Ionicons name="close-circle" size={24} color={colors.outline} />
                            </TouchableOpacity>
                        </View>

                        {/* Scrollable body so content never overflows the screen */}
                        <ScrollView
                            style={styles.destinationCardBody}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Address & Coords */}
                            {destination.address ? (
                                <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ marginBottom: 2 }} numberOfLines={2}>
                                    {destination.address}
                                </Text>
                            ) : null}
                            <Text variant="labelSm" color={colors.outline} style={{ marginBottom: spacing.sm }}>
                                {destination.latitude.toFixed(5)}, {destination.longitude.toFixed(5)}
                            </Text>

                            {isDestinationRiskLoading ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="small" color={colors.primary} />
                                    <Text variant="labelLg" color={colors['on-surface-variant']} style={{ marginTop: 8 }}>
                                        Calculating location risk from Risk Score Engine...
                                    </Text>
                                </View>
                            ) : destinationRiskError ? (
                                <View style={styles.errorBanner}>
                                    <Ionicons name="alert-circle" size={20} color={colors.error} />
                                    <Text variant="labelMd" style={{ color: colors.error, flex: 1 }}>{destinationRiskError}</Text>
                                    <TouchableOpacity style={styles.retryBtn} onPress={() => fetchDestinationRiskData(destination.latitude, destination.longitude)}>
                                        <Text variant="labelMd" style={{ color: colors.primary, fontWeight: 'bold' }}>Retry</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : destinationRiskInfo ? (
                                <>
                                    {/* Risk Score & Distance Grid */}
                                    <View style={[styles.statsGrid, { marginTop: 0 }]}>
                                        <View style={[styles.statCard, { borderColor: destinationRiskInfo.colors.stroke }]}>
                                            <View style={[styles.statIconContainer, { backgroundColor: destinationRiskInfo.colors.fill }]}>
                                                <Ionicons name="shield-half-outline" size={20} color={destinationRiskInfo.colors.stroke} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text variant="labelMd" color={colors['on-surface-variant']}>Calculated Risk</Text>
                                                <Text variant="headlineSm" style={{ fontWeight: 'bold', color: destinationRiskInfo.colors.stroke }}>
                                                    {Math.round(destinationRiskInfo.score)} / 100
                                                </Text>
                                                <Text variant="labelMd" style={{ fontWeight: 'bold', color: destinationRiskInfo.colors.stroke }}>
                                                    {destinationRiskInfo.label}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.statCard}>
                                            <View style={styles.statIconContainer}>
                                                <Ionicons name="navigate" size={20} color={colors.primary} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text variant="labelMd" color={colors['on-surface-variant']}>Distance</Text>
                                                <Text variant="headlineSm" style={{ fontWeight: 'bold', color: colors.primary }}>
                                                    {destinationDistance !== null
                                                        ? (destinationDistance >= 1000
                                                            ? `${(destinationDistance / 1000).toFixed(2)} km`
                                                            : `${Math.round(destinationDistance)} m`)
                                                        : 'N/A'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Contributing Factors Breakdown Grid (7 factors from backend score-service) */}
                                    <Text variant="labelLg" style={{ fontWeight: 'bold', marginTop: spacing.sm, marginBottom: spacing.xs, color: colors['on-surface'] }}>
                                        Contributing Factors Breakdown
                                    </Text>
                                    <View style={styles.factorGrid}>
                                        <View style={styles.factorChip}>
                                            <Ionicons name="warning-outline" size={14} color={colors.primary} />
                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Crime:</Text>
                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(destinationRiskInfo.breakdown.crime ?? 0)}</Text>
                                        </View>
                                        <View style={styles.factorChip}>
                                            <Ionicons name="cloudy-outline" size={14} color={colors.primary} />
                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Weather:</Text>
                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(destinationRiskInfo.breakdown.weather ?? 0)}</Text>
                                        </View>
                                        <View style={styles.factorChip}>
                                            <Ionicons name="newspaper-outline" size={14} color={colors.primary} />
                                            <Text variant="labelSm" color={colors['on-surface-variant']}>News:</Text>
                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(destinationRiskInfo.breakdown.news ?? 0)}</Text>
                                        </View>
                                        <View style={styles.factorChip}>
                                            <Ionicons name="people-outline" size={14} color={colors.primary} />
                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Crowd:</Text>
                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(destinationRiskInfo.breakdown.crowd ?? 0)}</Text>
                                        </View>
                                        <View style={styles.factorChip}>
                                            <Ionicons name="shield-outline" size={14} color={colors.primary} />
                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Community:</Text>
                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(destinationRiskInfo.breakdown.community ?? 0)}</Text>
                                        </View>
                                        <View style={styles.factorChip}>
                                            <Ionicons name="business-outline" size={14} color={colors.primary} />
                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Infra:</Text>
                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(destinationRiskInfo.breakdown.infra ?? 0)}</Text>
                                        </View>
                                        <View style={styles.factorChip}>
                                            <Ionicons name="time-outline" size={14} color={colors.primary} />
                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Time:</Text>
                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(destinationRiskInfo.breakdown.time ?? 0)}</Text>
                                        </View>
                                    </View>

                                    {/* Nearby Danger Zone Hotspots */}
                                    <View style={[styles.detailsContainer, { marginTop: spacing.sm }]}>
                                        <View style={styles.detailRow}>
                                            <Ionicons name="alert-circle-outline" size={15} color={colors['on-surface-variant']} />
                                            <Text variant="labelMd" color={colors['on-surface-variant']}>Nearby Hotspots:</Text>
                                            <Text variant="labelMd" style={{ fontWeight: 'bold', color: (destinationRisk?.length || 0) > 0 ? colors.error : colors.primary }}>
                                                {(destinationRisk?.length || 0) > 0 ? `${destinationRisk.length} within 3km` : 'No hotspots within 3km'}
                                            </Text>
                                        </View>
                                        {destinationRisk && destinationRisk.length > 0 && (
                                            <View style={{ marginTop: 4 }}>
                                                {destinationRisk.slice(0, 2).map((z, i) => (
                                                    <Text key={i} variant="labelMd" color={colors['on-surface-variant']} style={{ marginLeft: 20 }} numberOfLines={1}>
                                                        • Hotspot #{z.hotspotId || i+1}: {z.riskLevel || 'High'} risk
                                                    </Text>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                </>
                            ) : null}

                            {/* Action Buttons */}
                            <View style={[styles.actionButtonsRow, { marginTop: spacing.sm }]}>
                                <TouchableOpacity 
                                    style={styles.routeBtn} 
                                    onPress={() => navigation.navigate('LiveJourney', { destination })}
                                >
                                    <Ionicons name="navigate-circle-outline" size={20} color={colors['on-primary']} />
                                    <Text variant="labelLg" color={colors['on-primary']} style={{ fontWeight: 'bold' }}>
                                        Route Here
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.shareBtn} onPress={handleClearDestination}>
                                    <Ionicons name="close-circle-outline" size={18} color={colors.primary} />
                                    <Text variant="labelLg" color={colors.primary}>Clear</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                )}

                {/* Danger Zone Fetch Error Banner */}
                {dangerZoneError && (
                    <View style={styles.errorBanner}>
                        <Ionicons name="alert-circle" size={20} color={colors.error} />
                        <Text variant="labelMd" style={{ color: colors.error, flex: 1 }}>{dangerZoneError}</Text>
                        <TouchableOpacity style={styles.retryBtn} onPress={() => loadDangerZones()}>
                            <Text variant="labelMd" style={{ color: colors.primary, fontWeight: 'bold' }}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Current Location / Active Zone Risk Section */}
                {!showDestinationPanel && (
                    <>
                        {/* Button chip to reveal risk panel — shown when panel is closed and not loading */}
                        {!showCurrentRiskPanel && !isCurrentRiskLoading && (
                            <TouchableOpacity
                                style={styles.viewCurrentRiskChip}
                                onPress={() => {
                                    setShowCurrentRiskPanel(true);
                                    setBottomSheetExpanded(true);
                                    // Fetch if not yet loaded
                                    if (!currentLocationRiskData && userLocation) {
                                        fetchCurrentLocationRiskData(userLocation.latitude, userLocation.longitude);
                                    }
                                }}
                            >
                                <Ionicons name="shield-half-outline" size={18} color={colors.primary} />
                                <Text variant="labelLg" style={{ fontWeight: 'bold', color: colors.primary, flex: 1 }}>
                                    View Location Risk
                                </Text>
                                <Ionicons name="chevron-up" size={16} color={colors['on-surface-variant']} />
                            </TouchableOpacity>
                        )}

                        {/* Loading state while fetching */}
                        {isCurrentRiskLoading && (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text variant="labelLg" color={colors['on-surface-variant']} style={{ marginTop: 8 }}>
                                    Calculating current location risk score...
                                </Text>
                            </View>
                        )}

                        {/* Error state */}
                        {currentRiskError && !currentLocationRiskData && !isCurrentRiskLoading && (
                            <View style={styles.errorBanner}>
                                <Ionicons name="alert-circle" size={20} color={colors.error} />
                                <Text variant="labelMd" style={{ color: colors.error, flex: 1 }}>{currentRiskError}</Text>
                                <TouchableOpacity style={styles.retryBtn} onPress={() => userLocation && fetchCurrentLocationRiskData(userLocation.latitude, userLocation.longitude)}>
                                    <Text variant="labelMd" style={{ color: colors.primary, fontWeight: 'bold' }}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Risk detail panel — shown only when user taps the button */}
                        {showCurrentRiskPanel && !isCurrentRiskLoading && (currentLocationRiskInfo || activeZone) && (
                            <>
                                {(() => {
                                    const activeColors = currentLocationRiskInfo ? currentLocationRiskInfo.colors : activeRiskColors;
                                    const displayScore = currentLocationRiskInfo ? currentLocationRiskInfo.score : (activeZone?.totalRiskScore ?? activeZone?.crimeScore ?? 0);
                                    const displayLevel = currentLocationRiskInfo ? currentLocationRiskInfo.label : (activeZone?.riskLevel || activeRiskColors.label);
                                    const breakdown = currentLocationRiskInfo?.breakdown || {};

                                    return (
                                        <>
                                            {/* Header with close button */}
                                            <View style={styles.sheetHeader}>
                                                <View style={{ flex: 1 }}>
                                                    <Text variant="labelMd" color={colors['on-surface-variant']} style={{ textTransform: 'uppercase', marginBottom: 2 }}>
                                                        {selectedZone ? "Selected Zone" : "Current Location Risk"}
                                                    </Text>
                                                    <Text variant="headlineMd" style={{ fontWeight: 'bold' }}>
                                                        {activeZone?.hotspotId
                                                            ? `Hotspot #${activeZone.hotspotId}`
                                                            : (currentLocationRiskData?.h3Index ? `Cell ${currentLocationRiskData.h3Index.substring(0, 10)}...` : 'Your Location')}
                                                    </Text>
                                                </View>

                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <View style={[styles.riskLevelBadge, { backgroundColor: activeColors.fill, borderColor: activeColors.stroke }]}>
                                                        <View style={[styles.legendDot, { backgroundColor: activeColors.solid }]} />
                                                        <Text variant="labelLg" style={{ color: activeColors.stroke, fontWeight: 'bold' }}>
                                                            {displayLevel}
                                                        </Text>
                                                    </View>
                                                    <TouchableOpacity
                                                        onPress={() => setShowCurrentRiskPanel(false)}
                                                        style={{ padding: 4 }}
                                                    >
                                                        <Ionicons name="chevron-down" size={20} color={colors['on-surface-variant']} />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>

                                            <View style={styles.statsGrid}>
                                                <View style={[styles.statCard, { borderColor: activeColors.stroke }]}>
                                                    <View style={[styles.statIconContainer, { backgroundColor: activeColors.fill }]}>
                                                        <Ionicons name="warning" size={22} color={activeColors.stroke} />
                                                    </View>
                                                    <View>
                                                        <Text variant="labelMd" color={colors['on-surface-variant']}>Risk Score</Text>
                                                        <Text variant="headlineSm" style={{ fontWeight: 'bold', color: activeColors.stroke }}>
                                                            {Math.round(displayScore)} / 100
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
                                                            {activeZone?.crimeCount ?? 'N/A'}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>

                                            {/* 7-Factor Breakdown */}
                                            {currentLocationRiskInfo && (
                                                <>
                                                    <Text variant="labelLg" style={{ fontWeight: 'bold', marginTop: spacing.xs, marginBottom: spacing.xs, color: colors['on-surface'] }}>
                                                        Contributing Factors
                                                    </Text>
                                                    <View style={styles.factorGrid}>
                                                        <View style={styles.factorChip}>
                                                            <Ionicons name="warning-outline" size={14} color={colors.primary} />
                                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Crime:</Text>
                                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(breakdown.crime ?? 0)}</Text>
                                                        </View>
                                                        <View style={styles.factorChip}>
                                                            <Ionicons name="cloudy-outline" size={14} color={colors.primary} />
                                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Weather:</Text>
                                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(breakdown.weather ?? 0)}</Text>
                                                        </View>
                                                        <View style={styles.factorChip}>
                                                            <Ionicons name="newspaper-outline" size={14} color={colors.primary} />
                                                            <Text variant="labelSm" color={colors['on-surface-variant']}>News:</Text>
                                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(breakdown.news ?? 0)}</Text>
                                                        </View>
                                                        <View style={styles.factorChip}>
                                                            <Ionicons name="people-outline" size={14} color={colors.primary} />
                                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Crowd:</Text>
                                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(breakdown.crowd ?? 0)}</Text>
                                                        </View>
                                                        <View style={styles.factorChip}>
                                                            <Ionicons name="shield-outline" size={14} color={colors.primary} />
                                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Community:</Text>
                                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(breakdown.community ?? 0)}</Text>
                                                        </View>
                                                        <View style={styles.factorChip}>
                                                            <Ionicons name="business-outline" size={14} color={colors.primary} />
                                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Infra:</Text>
                                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(breakdown.infra ?? 0)}</Text>
                                                        </View>
                                                        <View style={styles.factorChip}>
                                                            <Ionicons name="time-outline" size={14} color={colors.primary} />
                                                            <Text variant="labelSm" color={colors['on-surface-variant']}>Time:</Text>
                                                            <Text variant="labelSm" style={{ fontWeight: 'bold' }}>{Math.round(breakdown.time ?? 0)}</Text>
                                                        </View>
                                                    </View>
                                                </>
                                            )}

                                            {/* Active Zone Detail Rows */}
                                            {activeZone && (
                                                <View style={[styles.detailsContainer, { marginTop: spacing.xs }]}>
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
                                            )}
                                        </>
                                    );
                                })()}
                            </>
                        )}
                    </>
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
            )}

            {/* Location Status Diagnostics Modal */}
            <LocationStatusModal
                visible={showStatusModal}
                onClose={() => setShowStatusModal(false)}
                userLocation={userLocation}
                accuracy={locationAccuracy}
                trackingActive={trackingActive}
                currentZone={currentZone}
                permissionStatus={permissionStatus}
                lastUpdateTime={lastUpdateTime}
                offlineQueueSize={locationService.getOfflineQueueSize()}
            />

            {/* Report Community Incident Modal */}
            <Modal visible={showReportModal} transparent animationType="slide">
                <View style={styles.permissionOverlay}>
                    <View style={styles.permissionCard}>
                        <View style={styles.sheetHeader}>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold', color: colors.primary }}>
                                Report Community Incident
                            </Text>
                            <TouchableOpacity onPress={() => setShowReportModal(false)}>
                                <Ionicons name="close" size={24} color={colors['on-surface-variant']} />
                            </TouchableOpacity>
                        </View>

                        {incidentMessage && (
                            <View style={styles.errorBanner}>
                                <Text variant="labelMd" style={{ color: colors.error }}>{incidentMessage}</Text>
                            </View>
                        )}

                        <Text variant="labelLg" style={{ alignSelf: 'flex-start', marginBottom: 6 }}>Incident Category</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md, maxHeight: 44 }}>
                            {['Harassment', 'Theft', 'Accident', 'Road Block', 'Street Light Failure', 'Waterlogging', 'Suspicious Activity', 'Assault', 'Fire', 'Other'].map(cat => (
                                <TouchableOpacity 
                                    key={cat} 
                                    style={[
                                        styles.statusChip, 
                                        selectedIncidentType === cat && { backgroundColor: colors.primary }
                                    ]}
                                    onPress={() => setSelectedIncidentType(cat)}
                                >
                                    <Text variant="labelMd" style={{ color: selectedIncidentType === cat ? colors.white : colors['on-surface'] }}>
                                        {cat}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text variant="labelLg" style={{ alignSelf: 'flex-start', marginBottom: 6 }}>Description</Text>
                        <TextInput 
                            style={styles.communityInput}
                            placeholder="Describe the incident (min 5 chars)..."
                            placeholderTextColor={colors['on-surface-variant']}
                            value={incidentDescription}
                            onChangeText={setIncidentDescription}
                            multiline
                            numberOfLines={3}
                        />

                        <TouchableOpacity 
                            style={styles.permissionButton} 
                            onPress={handleReportIncidentSubmit}
                            disabled={isSubmittingIncident}
                        >
                            {isSubmittingIncident ? (
                                <ActivityIndicator size="small" color={colors.white} />
                            ) : (
                                <Text variant="labelLg" color={colors.white} style={{ fontWeight: 'bold' }}>
                                    Submit Incident Report
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Community Incidents Feed Modal */}
            <Modal visible={showCommunityFeed} transparent animationType="slide">
                <View style={styles.permissionOverlay}>
                    <View style={[styles.permissionCard, { maxHeight: '80%' }]}>
                        <View style={styles.sheetHeader}>
                            <Text variant="headlineSm" style={{ fontWeight: 'bold', color: colors.primary }}>
                                Nearby Community Reports ({communityIncidents.length})
                            </Text>
                            <TouchableOpacity onPress={() => setShowCommunityFeed(false)}>
                                <Ionicons name="close" size={24} color={colors['on-surface-variant']} />
                            </TouchableOpacity>
                        </View>

                        {/* Frontend-only placeholders: ready to receive real location chat data later. */}
                        {locationChatGroups.map(group => (
                            <View key={group.location} style={styles.locationChatCard}>
                                <View style={styles.locationChatTitle}>
                                    <Ionicons name="location" size={18} color={colors.primary} />
                                    <Text variant="labelLg" style={{ color: colors.primary, fontWeight: 'bold' }}>Location Chat · {group.location}</Text>
                                </View>
                                <Text variant="bodyMd" color={colors['on-surface-variant']}>{group.preview}</Text>
                            </View>
                        ))}

                        {isLoadingCommunity ? (
                            <View style={styles.communityState}>
                                <ActivityIndicator size="large" color={colors.primary} />
                            </View>
                        ) : communityError ? (
                            <View style={styles.communityState}>
                                <Text variant="bodyMd" color={colors.error} style={{ textAlign: 'center' }}>{communityError}</Text>
                                <TouchableOpacity style={styles.communityRetryButton} onPress={loadCommunityIncidents}>
                                    <Text variant="labelMd" color={colors.white}>Try Again</Text>
                                </TouchableOpacity>
                            </View>
                        ) : communityIncidents.length === 0 ? (
                            <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ textAlign: 'center', marginVertical: spacing.xl }}>
                                No community incidents reported nearby.
                            </Text>
                        ) : (
                            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.sm }}>
                                {communityIncidents.map(inc => (
                                    <View key={inc._id || inc.id} style={styles.communityCard}>
                                        <View style={styles.sheetHeader}>
                                            <Text variant="labelLg" style={{ fontWeight: 'bold', color: colors.primary }}>
                                                {inc.incidentType || 'Incident'}
                                            </Text>
                                            <Text variant="labelSm" color={colors.outline}>
                                                {new Date(inc.createdAt || Date.now()).toLocaleTimeString()}
                                            </Text>
                                        </View>
                                        <Text variant="bodyMd" style={{ marginBottom: 8 }}>{inc.description}</Text>
                                        <View style={styles.votingRow}>
                                            <TouchableOpacity 
                                                style={styles.voteBtn}
                                                onPress={() => handleConfirmIncident(inc._id || inc.id)}
                                            >
                                                <Ionicons name="thumbs-up-outline" size={16} color="green" />
                                                <Text variant="labelMd" style={{ color: 'green', fontWeight: 'bold' }}>
                                                    Confirm ({inc.upvotesCount ?? inc.confirmationsCount ?? 0})
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity 
                                                style={styles.voteBtn}
                                                onPress={() => handleReportFalse(inc._id || inc.id)}
                                            >
                                                <Ionicons name="thumbs-down-outline" size={16} color={colors.error} />
                                                <Text variant="labelMd" style={{ color: colors.error, fontWeight: 'bold' }}>
                                                    False Report ({inc.downvotesCount ?? inc.falseReportCount ?? 0})
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </ScrollView>
                        )}
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
    topSearchContainer: {
        position: 'absolute',
        top: spacing.xl + 20,
        left: spacing.md,
        right: spacing.md,
        zIndex: 10,
        // Cap total height so nothing overflows below the bottom sheet
        maxHeight: height * 0.55,
    },
    searchHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.xs,
    },
    menuButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.97)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
        flexShrink: 0,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.97)',
        borderRadius: shapes.roundedPill,
        paddingHorizontal: spacing.md,
        height: 48,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    searchInput: {
        flex: 1,
        marginLeft: spacing.sm,
        fontSize: typography.sizes.bodyMd || 14,
        color: colors['on-surface'],
        height: 48,
    },
    micButton: {
        padding: 6,
    },
    statusRow: {
        flexDirection: 'row',
        marginTop: spacing.xs,
        gap: spacing.sm,
        flexWrap: 'wrap',
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
    geofenceToastBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
        borderRadius: shapes.roundedPill,
        marginTop: spacing.sm,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
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
    communityInput: {
        borderWidth: 1,
        borderColor: colors.outline,
        borderRadius: shapes.roundedSm,
        padding: spacing.md,
        fontSize: typography.sizes.bodyLg,
        color: colors['on-surface'],
        width: '100%',
        marginBottom: spacing.lg,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    communityCard: {
        backgroundColor: colors['surface-container-low'],
        padding: spacing.md,
        borderRadius: shapes.roundedLg,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.2)',
        width: '100%',
    },
    locationChatCard: {
        width: '100%',
        backgroundColor: colors['primary-container'],
        borderRadius: shapes.roundedLg,
        padding: spacing.md,
        marginBottom: spacing.md,
    },
    locationChatTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.xs,
    },
    communityState: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        paddingVertical: spacing.xl,
    },
    communityRetryButton: {
        backgroundColor: colors.primary,
        borderRadius: shapes.roundedPill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    votingRow: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.sm,
    },
    voteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: shapes.roundedPill,
        backgroundColor: colors['surface-container'],
    },
    // Autocomplete & Destination Search Styles
    autocompleteDropdown: {
        backgroundColor: colors.surface,
        borderRadius: shapes.roundedLg,
        marginTop: spacing.xs,
        paddingVertical: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 6,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
        overflow: 'hidden',
    },
    autocompleteItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(217, 194, 183, 0.2)',
        gap: spacing.sm,
    },
    searchErrorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: '#fee2e2',
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        borderRadius: shapes.roundedPill,
        marginTop: spacing.xs,
        borderWidth: 1,
        borderColor: '#fca5a5',
    },
    destinationCard: {
        backgroundColor: colors['surface-container-low'],
        borderRadius: shapes.roundedLg,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1.5,
        borderColor: colors.primary,
        maxHeight: height * 0.42,
    },
    destinationCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    destinationCardBody: {
        flexShrink: 1,
    },
    clearDestBtn: {
        padding: 4,
    },
    destinationMarkerChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        borderRadius: shapes.roundedPill,
        marginTop: spacing.xs,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
        borderWidth: 1,
        borderColor: 'rgba(225, 29, 72, 0.4)',
    },
    viewDetailsBtnChip: {
        backgroundColor: colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: shapes.roundedPill,
    },
    factorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginVertical: spacing.xs,
    },
    factorChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors['surface-container-low'],
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    viewCurrentRiskChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors['surface-container-low'],
        paddingHorizontal: spacing.md,
        paddingVertical: 12,
        borderRadius: shapes.roundedLg,
        borderWidth: 1.5,
        borderColor: colors.primary,
        marginBottom: spacing.xs,
    },
});
