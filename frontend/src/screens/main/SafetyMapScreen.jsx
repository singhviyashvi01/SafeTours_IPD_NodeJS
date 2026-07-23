import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Image, Dimensions } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

export const SafetyMapScreen = () => {
    const navigation = useNavigation();
    const [searchQuery, setSearchQuery] = useState('');
    const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);

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
                        <Ionicons name="cloud-offline" size={16} color="green" />
                        <Text variant="labelMd" style={{ color: colors['on-surface'] }}>Offline Maps</Text>
                    </View>
                    <View style={styles.statusChip}>
                        <Ionicons name="cellular" size={16} color="green" />
                        <Text variant="labelMd" style={{ color: colors['on-surface'] }}>Strong Signal</Text>
                    </View>
                </View>
            </View>

            {/* Right Floating Actions */}
            <View style={styles.floatingActionsRight}>
                <TouchableOpacity style={styles.fabSmall}>
                    <Ionicons name="locate" size={24} color={colors['on-surface-variant']} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.fabSmall}>
                    <Ionicons name="refresh" size={24} color={colors['on-surface-variant']} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.fabSmall}>
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
    mapPlaceholder: {
        ...StyleSheet.absoluteFillObject,
        width: width,
        height: height,
        opacity: 0.6,
    },
    mapOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 248, 246, 0.2)', // light overlay
    },
    topSearchContainer: {
        position: 'absolute',
        top: spacing.xl,
        left: spacing.md,
        right: spacing.md,
        zIndex: 10,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
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
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    floatingActionsRight: {
        position: 'absolute',
        top: 140,
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
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
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
});
