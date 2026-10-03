import React, { forwardRef } from 'react';
import { StyleSheet, View, Platform, TouchableOpacity } from 'react-native';
import { colors } from '../theme/theme';
import { Text } from './Text';

let MapView, Marker, Circle, Polygon;
if (Platform.OS !== 'web') {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
    Circle = Maps.Circle;
    Polygon = Maps.Polygon;
}

const PALETTE = {
    SAFE: { fill: 'rgba(34, 197, 94, 0.3)', stroke: '#15803d', solid: '#22c55e', label: 'Safe' },
    LOW: { fill: 'rgba(250, 204, 21, 0.35)', stroke: '#ca8a04', solid: '#facc15', label: 'Low Risk' },
    MODERATE: { fill: 'rgba(249, 115, 22, 0.4)', stroke: '#c2410c', solid: '#f97316', label: 'Moderate Risk' },
    HIGH: { fill: 'rgba(225, 29, 72, 0.45)', stroke: '#be123c', solid: colors.error || '#e11d48', label: 'High Risk' },
    EXTREME: { fill: 'rgba(186, 26, 26, 0.55)', stroke: '#7f1d1d', solid: '#991b1b', label: 'Extreme Risk' },
    UNKNOWN: { fill: 'rgba(148, 163, 184, 0.25)', stroke: '#64748b', solid: '#94a3b8', label: 'Not enough data' },
};

/**
 * Colours for a backend risk level (SAFE | LOW | MODERATE | HIGH | EXTREME | UNKNOWN).
 * A missing/unrecognised level is UNKNOWN, never SAFE.
 */
export const getRiskColors = (riskLevel) => {
    const level = String(riskLevel || '').toUpperCase();
    return PALETTE[level] || PALETTE.UNKNOWN;
};

export const MapComponent = forwardRef(({
    region,
    onRegionChangeComplete,
    userLocation,
    mapType = 'standard',
    dangerZones = [],
    communityIncidents = [],
    selectedZone = null,
    onSelectZone,
    destinationMarker = null,
    onSelectDestination = null,
    ...props
}, ref) => {

    // Render Web Fallback View if running on Web browser target
    if (Platform.OS === 'web') {
        return (
            <View style={styles.webContainer}>
                <View style={styles.webGridOverlay} />
                <Text variant="headlineSm" style={{ color: colors.primary, fontWeight: 'bold', marginBottom: 6 }}>
                    Interactive Safety Map
                </Text>
                <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ textAlign: 'center', marginBottom: 16 }}>
                    Rendering {dangerZones.length} risk cells around your region.
                </Text>

                {/* Render Zone Cards on Web */}
                <View style={styles.webZonesContainer}>
                    {dangerZones.map((zone, idx) => {
                        const riskColors = getRiskColors(zone.riskLevel);
                        const isSelected = selectedZone && (selectedZone.hotspotId === zone.hotspotId || selectedZone._id === zone._id);
                        return (
                            <TouchableOpacity
                                key={zone.hotspotId || zone._id || idx}
                                style={[
                                    styles.webZoneChip,
                                    { backgroundColor: riskColors.fill, borderColor: isSelected ? '#000' : riskColors.stroke }
                                ]}
                                onPress={() => onSelectZone && onSelectZone(zone)}
                            >
                                <View style={[styles.markerDot, { backgroundColor: riskColors.solid }]} />
                                <Text variant="labelLg" style={{ fontWeight: 'bold', color: riskColors.stroke }}>
                                    Cell {String(zone.h3Index || idx + 1).slice(-6)} ({zone.riskLevel || 'UNKNOWN'})
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        );
    }

    // Native Platform Map View (Android & iOS)
    return (
        <MapView
            ref={ref}
            style={styles.map}
            initialRegion={region}
            onRegionChangeComplete={onRegionChangeComplete}
            mapType={mapType}
            showsUserLocation={false}
            showsMyLocationButton={false}
            {...props}
        >
            {/* Render Danger Zones */}
            {dangerZones.map((zone, index) => {
                const zoneId = zone._id || zone.hotspotId || zone.h3Index || `zone-${index}`;
                const isSelected = selectedZone && (
                    selectedZone._id === zone._id || 
                    selectedZone.hotspotId === zone.hotspotId || 
                    selectedZone.h3Index === zone.h3Index
                );

                const riskColors = getRiskColors(zone.riskLevel);

                let latitude = null;
                let longitude = null;

                if (zone.location && Array.isArray(zone.location.coordinates)) {
                    longitude = zone.location.coordinates[0];
                    latitude = zone.location.coordinates[1];
                } else if (zone.latitude !== undefined && zone.longitude !== undefined) {
                    latitude = Number(zone.latitude);
                    longitude = Number(zone.longitude);
                } else if (zone.lat !== undefined && zone.lng !== undefined) {
                    latitude = Number(zone.lat);
                    longitude = Number(zone.lng);
                }

                if (latitude === null || longitude === null || isNaN(latitude) || isNaN(longitude)) {
                    return null;
                }

                const hasPolygon = Array.isArray(zone.polygon) && zone.polygon.length >= 3;
                const polygonCoords = hasPolygon ? zone.polygon.map(pt => {
                    if (Array.isArray(pt)) return { latitude: pt[0], longitude: pt[1] };
                    return { latitude: pt.latitude || pt.lat, longitude: pt.longitude || pt.lng };
                }) : null;

                const circleRadius = zone.radius || 200;

                return (
                    <React.Fragment key={zoneId}>
                        {hasPolygon ? (
                            <Polygon
                                coordinates={polygonCoords}
                                fillColor={isSelected ? riskColors.fill.replace('0.3', '0.6') : riskColors.fill}
                                strokeColor={isSelected ? '#000000' : riskColors.stroke}
                                strokeWidth={isSelected ? 3 : 1.5}
                                tappable={true}
                                onPress={() => onSelectZone && onSelectZone(zone)}
                            />
                        ) : (
                            <Circle
                                center={{ latitude, longitude }}
                                radius={circleRadius}
                                fillColor={isSelected ? riskColors.fill.replace('0.3', '0.6') : riskColors.fill}
                                strokeColor={isSelected ? '#000000' : riskColors.stroke}
                                strokeWidth={isSelected ? 3 : 1.5}
                                onPress={() => onSelectZone && onSelectZone(zone)}
                            />
                        )}
                    </React.Fragment>
                );
            })}

            {/* Current User Location Marker */}
            {userLocation && (
                <Marker
                    coordinate={userLocation}
                    title="Your Location"
                    description="You are here"
                    anchor={{ x: 0.5, y: 0.5 }}
                >
                    <View style={styles.markerContainer}>
                        <View style={styles.pulseRing} />
                        <View style={styles.markerDot} />
                    </View>
                </Marker>
            )}

            {/* Destination Marker */}
            {destinationMarker && destinationMarker.latitude && destinationMarker.longitude && (
                <Marker
                    coordinate={{
                        latitude: destinationMarker.latitude,
                        longitude: destinationMarker.longitude,
                    }}
                    title={destinationMarker.name || 'Searched Destination'}
                    description="Tap marker or 'View Details' to inspect safety metrics"
                    anchor={{ x: 0.5, y: 0.5 }}
                    onPress={() => onSelectDestination && onSelectDestination(destinationMarker)}
                >
                    <View style={styles.markerContainer}>
                        <View style={[styles.pulseRing, { backgroundColor: '#e11d48', opacity: 0.3 }]} />
                        <View style={[styles.markerDot, { backgroundColor: '#e11d48', borderColor: '#ffffff' }]} />
                    </View>
                </Marker>
            )}

            {/* Community reports stay visually separate from Person 2 danger zones. */}
            {communityIncidents.map((incident, index) => {
                const latitude = Number(incident.latitude ?? incident.location?.coordinates?.[1]);
                const longitude = Number(incident.longitude ?? incident.location?.coordinates?.[0]);
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

                return (
                    <Marker
                        key={incident._id || incident.id || `incident-${index}`}
                        coordinate={{ latitude, longitude }}
                        title={incident.incidentType || 'Community incident'}
                        description={incident.description || 'Reported by the community'}
                        pinColor={incident.severity === 'CRITICAL' || incident.severity === 'HIGH' ? colors.error : '#f97316'}
                    />
                );
            })}
        </MapView>
    );
});

MapComponent.displayName = 'MapComponent';

const styles = StyleSheet.create({
    map: {
        ...StyleSheet.absoluteFillObject,
    },
    markerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
    },
    pulseRing: {
        position: 'absolute',
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: colors.primary,
        opacity: 0.25,
    },
    markerDot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: colors.primary,
        borderWidth: 2,
        borderColor: colors.white,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
    },
    webContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors['surface-container'],
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    webGridOverlay: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.05,
        backgroundColor: colors.primary,
    },
    webZonesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'center',
        maxWidth: 600,
    },
    webZoneChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 2,
    },
});
