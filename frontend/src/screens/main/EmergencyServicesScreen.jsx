import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { InfoCard } from '../../components/ReusableCards';
import { FilterChips, NearbyStatusLine, PlaceRow } from '../../components/NearbyParts';
import { colors, spacing, shapes } from '../../theme/theme';
import { useSidebar } from '../../context/SidebarContext';
import { useNearbyServices } from '../../context/NearbyContext';
import { EMERGENCY_NUMBERS } from '../../constants/emergencyNumbers';
import { callNumber } from '../../utils/placeActions';

/**
 * Nearby Services: real places near the user (backend /api/nearby, cached on the device), filterable by
 * type and searchable by name, plus India's national emergency numbers.
 */
export const EmergencyServicesScreen = () => {
    const { toggleDrawer } = useSidebar();
    const n = useNearbyServices();
    const [query, setQuery] = useState('');

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (n?.visible || []).filter((p) => !q || (p.name || '').toLowerCase().includes(q) || (p.address || '').toLowerCase().includes(q));
    }, [n?.visible, query]);

    if (!n) return null;
    const empty = !n.loading && rows.length === 0;

    return (
        <Screen style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <TouchableOpacity onPress={toggleDrawer} accessibilityLabel="Open menu">
                        <Ionicons name="menu" size={28} color={colors.primary} />
                    </TouchableOpacity>
                    <Text variant="headlineMd" style={styles.headerTitle}>Nearby Services</Text>
                </View>
                {n.loading ? (
                    <ActivityIndicator color={colors.primary} />
                ) : (
                    <TouchableOpacity onPress={n.refresh} accessibilityLabel="Refresh">
                        <Ionicons name="refresh" size={24} color={colors.primary} />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.searchSection}>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color={colors['on-surface-variant']} />
                    <TextInput
                        placeholder="Search by name or address"
                        placeholderTextColor={colors['on-surface-variant']}
                        style={styles.searchInput}
                        value={query}
                        onChangeText={setQuery}
                    />
                </View>
                <FilterChips types={n.types} value={n.filter} onChange={n.setFilter} />
                <NearbyStatusLine nearby={n} />
            </View>

            <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
                {empty ? (
                    <InfoCard>
                        <Text variant="bodyMd" color={colors['on-surface-variant']}>
                            {n.places.length === 0 ? 'No data for this area yet.' : 'Nothing matches your filter.'}
                        </Text>
                    </InfoCard>
                ) : (
                    <InfoCard style={{ paddingVertical: spacing.xs }}>
                        {rows.map((p) => <PlaceRow key={p.id} place={p} />)}
                    </InfoCard>
                )}

                <InfoCard style={styles.numbersCard}>
                    <Text variant="headlineSm" color={colors.tertiary} style={{ marginBottom: spacing.sm }}>National emergency numbers</Text>
                    {EMERGENCY_NUMBERS.map((e) => (
                        <TouchableOpacity key={e.key} style={styles.numberRow} onPress={() => callNumber(e.number)} accessibilityLabel={`Call ${e.label} ${e.number}`}>
                            <Ionicons name={e.icon} size={20} color={colors.primary} />
                            <Text variant="labelLg" style={{ flex: 1 }}>{e.label}</Text>
                            <Text variant="headlineSm" color={colors.primary}>{e.number}</Text>
                            <Ionicons name="call" size={18} color={colors.primary} />
                        </TouchableOpacity>
                    ))}
                </InfoCard>
            </ScrollView>
        </Screen>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
        backgroundColor: 'rgba(255, 248, 246, 0.9)', borderBottomWidth: 1, borderBottomColor: colors['surface-variant'], zIndex: 10,
    },
    headerTitle: { color: colors.primary, fontWeight: 'bold', flexShrink: 1 },
    searchSection: { padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors['surface-variant'] },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: colors['surface-container-highest'],
        borderRadius: shapes.roundedPill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    searchInput: { flex: 1, marginLeft: spacing.sm, color: colors['on-surface'] },
    listContainer: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 100 },
    numbersCard: { borderWidth: 1, borderColor: colors['surface-variant'] },
    numberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
});
