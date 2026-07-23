import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, TextInput, TouchableOpacity, Image } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { InfoCard } from '../../components/ReusableCards';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { emergencyService } from '../../services/emergency';
import { Ionicons } from '@expo/vector-icons';

export const EmergencyServicesScreen = () => {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('All');

    const filters = ['All', 'Hospital', 'Police', 'Fire', 'Shelter'];

    useEffect(() => {
        emergencyService.getNearbyServices().then(data => {
            setServices(data);
            setLoading(false);
        });
    }, []);

    const getIconForType = (type) => {
        switch(type) {
            case 'Hospital': return 'medkit';
            case 'Police': return 'shield';
            case 'Fire': return 'flame';
            default: return 'help-circle';
        }
    };

    return (
        <Screen style={styles.container}>
            {/* Top Navigation */}
            <View style={styles.header}>
                <Text variant="headlineMd" style={styles.headerTitle}>Nearby Services</Text>
                <TouchableOpacity>
                    <Ionicons name="refresh" size={24} color={colors.primary} />
                </TouchableOpacity>
            </View>

            {/* Search and Filters */}
            <View style={styles.searchSection}>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color={colors['on-surface-variant']} />
                    <TextInput 
                        placeholder="Search hospitals, police..." 
                        placeholderTextColor={colors['on-surface-variant']} 
                        style={styles.searchInput}
                    />
                </View>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterList} contentContainerStyle={styles.filterContainer}>
                    {filters.map(f => (
                        <TouchableOpacity 
                            key={f} 
                            style={[
                                styles.filterChip, 
                                activeFilter === f && styles.filterChipActive
                            ]}
                            onPress={() => setActiveFilter(f)}
                        >
                            <Text 
                                variant="labelMd" 
                                color={activeFilter === f ? colors['on-primary'] : colors['on-surface-variant']}
                            >
                                {f}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={styles.loader}/>
            ) : (
                <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
                    {services.map(service => (
                        <InfoCard key={service.id} style={styles.serviceCard}>
                            <View style={styles.serviceHeader}>
                                <View style={styles.serviceHeaderLeft}>
                                    <View style={styles.serviceIconContainer}>
                                        <Ionicons name={getIconForType(service.type)} size={24} color={colors['on-surface-variant']} />
                                    </View>
                                    <View>
                                        <Text variant="headlineSm" color={colors['on-surface']}>{service.name}</Text>
                                        <View style={styles.distanceRow}>
                                            <Ionicons name="location" size={14} color={colors.primary} />
                                            <Text variant="labelMd" color={colors['on-surface-variant']}>{service.distance} • {service.type}</Text>
                                        </View>
                                    </View>
                                </View>
                                <View style={styles.statusBadge}>
                                    <Text variant="labelMd" color={colors['on-surface-variant']}>Open</Text>
                                </View>
                            </View>
                            
                            <View style={styles.serviceBody}>
                                <View style={styles.mapPreview}>
                                    <View style={styles.mapPlaceholder}>
                                        <Ionicons name="map" size={32} color={colors['outline-variant']} />
                                    </View>
                                </View>
                                <View style={styles.serviceDetails}>
                                    <Text variant="bodyMd" color={colors['on-surface-variant']} style={styles.address}>{service.address}</Text>
                                    <View style={styles.contactRow}>
                                        <Ionicons name="call" size={16} color={colors.primary} />
                                        <Text variant="labelMd" color={colors.primary}>+1 (555) 911-0012</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.actionRow}>
                                <TouchableOpacity style={styles.secondaryBtn}>
                                    <Text variant="labelMd" color={colors.primary} style={styles.btnText}>Call</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.primaryBtn}>
                                    <Ionicons name="navigate" size={18} color={colors['on-primary']} />
                                    <Text variant="labelMd" color={colors['on-primary']} style={styles.btnText}>Navigate</Text>
                                </TouchableOpacity>
                            </View>
                        </InfoCard>
                    ))}

                    {/* Additional Helpline Card */}
                    <View style={styles.helplineCard}>
                        <View style={styles.helplineHeader}>
                            <View style={styles.helplineIcon}>
                                <Ionicons name="headset" size={24} color={colors['on-tertiary']} />
                            </View>
                            <View>
                                <Text variant="headlineSm" color={colors.tertiary}>24/7 Crisis Helpline</Text>
                                <Text variant="labelMd" color={colors['on-tertiary-container']}>Immediate support for any emergency</Text>
                            </View>
                        </View>
                        
                        <View style={styles.helplineInfo}>
                            <Text variant="bodyMd" color={colors['on-surface']} style={styles.helplineDesc}>Free, confidential support available instantly. Available in 12 languages.</Text>
                            <View style={styles.tags}>
                                <Text style={styles.tag}>MULTILINGUAL</Text>
                                <Text style={styles.tag}>VOICE/TEXT</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.helplineBtn}>
                            <Ionicons name="call" size={20} color={colors['on-tertiary']} />
                            <Text variant="headlineSm" color={colors['on-tertiary']} style={styles.btnText}>Call Hotline Now</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            )}
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
    headerTitle: {
        color: colors.primary,
        fontWeight: 'bold',
    },
    searchSection: {
        padding: spacing.lg,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors['surface-variant'],
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors['surface-container-highest'],
        borderRadius: shapes.roundedPill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        marginBottom: spacing.md,
    },
    searchInput: {
        flex: 1,
        marginLeft: spacing.sm,
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.bodyMd,
        color: colors['on-surface'],
        padding: 0,
        height: 36,
    },
    filterList: {
        maxHeight: 40,
    },
    filterContainer: {
        gap: spacing.sm,
        alignItems: 'center',
    },
    filterChip: {
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        borderRadius: shapes.roundedPill,
        backgroundColor: colors['surface-container-high'],
    },
    filterChipActive: {
        backgroundColor: colors.primary,
        elevation: 2,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    loader: {
        flex: 1,
    },
    listContainer: {
        padding: spacing.lg,
        paddingBottom: 120, // space for nav bar
        gap: spacing.lg,
    },
    serviceCard: {
        backgroundColor: colors['surface-container-lowest'],
        borderWidth: 1,
        borderColor: colors['outline-variant'],
        padding: spacing.lg,
    },
    serviceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.md,
    },
    serviceHeaderLeft: {
        flexDirection: 'row',
        gap: spacing.md,
        flex: 1,
    },
    serviceIconContainer: {
        width: 48,
        height: 48,
        borderRadius: shapes.roundedMd,
        backgroundColor: 'rgba(84, 67, 59, 0.1)', // on-surface-variant / 10
        justifyContent: 'center',
        alignItems: 'center',
    },
    distanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 4,
    },
    statusBadge: {
        backgroundColor: colors['surface-variant'],
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: shapes.roundedPill,
    },
    serviceBody: {
        flexDirection: 'row',
        gap: spacing.md,
        marginBottom: spacing.lg,
        alignItems: 'center',
    },
    mapPreview: {
        width: 96,
        height: 96,
        borderRadius: shapes.roundedMd,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.2)', // outline-variant / 20
    },
    mapPlaceholder: {
        flex: 1,
        backgroundColor: colors['surface-container-high'],
        justifyContent: 'center',
        alignItems: 'center',
    },
    serviceDetails: {
        flex: 1,
    },
    address: {
        lineHeight: 20,
        marginBottom: spacing.sm,
    },
    contactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    actionRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    secondaryBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: shapes.roundedPill,
        borderWidth: 1.5,
        borderColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryBtn: {
        flex: 1,
        flexDirection: 'row',
        paddingVertical: 12,
        borderRadius: shapes.roundedPill,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    btnText: {
        fontWeight: 'bold',
    },
    helplineCard: {
        backgroundColor: 'rgba(70, 174, 180, 0.1)', // tertiary-container / 10
        borderWidth: 2,
        borderColor: 'rgba(0, 105, 110, 0.2)', // tertiary / 20
        borderRadius: shapes.roundedLg,
        padding: spacing.lg,
    },
    helplineHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.md,
    },
    helplineIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.tertiary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    helplineInfo: {
        backgroundColor: 'rgba(255, 255, 255, 0.6)', // surface-container-lowest / 60
        borderRadius: shapes.roundedMd,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(0, 105, 110, 0.1)', // tertiary / 10
        marginBottom: spacing.lg,
    },
    helplineDesc: {
        fontWeight: '500',
    },
    tags: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.sm,
    },
    tag: {
        backgroundColor: 'rgba(0, 105, 110, 0.1)',
        color: colors.tertiary,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 'bold',
    },
    helplineBtn: {
        flexDirection: 'row',
        paddingVertical: 16,
        borderRadius: shapes.roundedPill,
        backgroundColor: colors.tertiary,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        elevation: 4,
        shadowColor: colors.tertiary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    }
});
