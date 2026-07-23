import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { colors } from '../theme/theme';

export const MapComponent = forwardRef(({
    region,
    onRegionChangeComplete,
    userLocation,
    mapType = 'standard',
    ...props
}, ref) => {
    return (
        <MapView
            ref={ref}
            style={styles.map}
            initialRegion={region}
            onRegionChangeComplete={onRegionChangeComplete}
            mapType={mapType}
            showsUserLocation={false} // Disable default dot since we render custom marker
            showsMyLocationButton={false} // Disable default native button, we use our own FAB
            {...props}
        >
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
});
