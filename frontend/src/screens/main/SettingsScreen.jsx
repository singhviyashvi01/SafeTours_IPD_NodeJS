import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { profileService } from '../../services/profile';

export const SettingsScreen = () => {
    const navigation = useNavigation();
    const { logout } = useAuth();
    const [offlineMode, setOfflineMode] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [locationPermissions, setLocationPermissions] = useState(true);
    const [profile, setProfile] = useState(null);
    useEffect(() => { profileService.getProfile().then(setProfile); }, []);

    const SettingsRow = ({ icon, title, subtitle, rightElement, onPress }) => (
        <TouchableOpacity 
            style={styles.settingsRow} 
            onPress={onPress}
            activeOpacity={onPress ? 0.7 : 1}
        >
            <View style={styles.iconBox}>
                <Ionicons name={icon} size={20} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
                <Text variant="labelLg" style={{ fontWeight: 'bold' }}>{title}</Text>
                {subtitle && <Text variant="bodyMd" color={colors['on-surface-variant']}>{subtitle}</Text>}
            </View>
            <View style={styles.rightElement}>
                {rightElement || (onPress && <Ionicons name="chevron-forward" size={20} color={colors.outline} />)}
            </View>
        </TouchableOpacity>
    );

    const SectionHeader = ({ title }) => (
        <Text variant="labelSm" color={colors.primary} style={styles.sectionHeader}>{title}</Text>
    );

    return (
        <Screen style={styles.container}>
            <View style={styles.header}>
                <Text variant="headlineMd" style={{ fontWeight: 'bold' }}>Settings</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* Profile Card Summary */}
                <TouchableOpacity style={styles.profileCard} onPress={() => navigation.navigate('Profile')}>
                    <View style={styles.avatar}>
                        <Text variant="headlineSm" color={colors.white}>{(profile?.name || 'ST').slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={styles.profileInfo}>
                        <Text variant="headlineSm" style={{ fontWeight: 'bold' }}>{profile?.name || 'SafeTours User'}</Text>
                        <Text variant="bodyMd" color={colors['on-surface-variant']}>Manage account & safety profile</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.outline} />
                </TouchableOpacity>

                <SectionHeader title="NETWORK & CONNECTION" />
                <View style={styles.sectionCard}>
                    <SettingsRow 
                        icon="cellular" 
                        title="Connectivity Status" 
                        subtitle="Connected to 5G network"
                        rightElement={<Text variant="labelMd" color="#166534">Excellent</Text>}
                    />
                    <View style={styles.divider} />
                    <SettingsRow 
                        icon="cloud-offline" 
                        title="Offline Mode" 
                        subtitle="Download maps for use without data"
                        rightElement={
                            <Switch 
                                value={offlineMode} 
                                onValueChange={setOfflineMode} 
                                trackColor={{ false: colors.outline, true: colors.primary }}
                            />
                        }
                    />
                </View>

                <SectionHeader title="PREFERENCES" />
                <View style={styles.sectionCard}>
                    <SettingsRow 
                        icon="notifications" 
                        title="Notifications" 
                        subtitle="Alerts, warnings, and system updates"
                        onPress={() => navigation.navigate('Notifications')}
                        rightElement={
                            <Switch 
                                value={notificationsEnabled} 
                                onValueChange={setNotificationsEnabled} 
                                trackColor={{ false: colors.outline, true: colors.primary }}
                            />
                        }
                    />
                    <View style={styles.divider} />
                    <SettingsRow 
                        icon="location" 
                        title="Location Permissions" 
                        subtitle="Required for live tracking and SOS"
                        rightElement={
                            <Switch 
                                value={locationPermissions} 
                                onValueChange={setLocationPermissions} 
                                trackColor={{ false: colors.outline, true: colors.primary }}
                            />
                        }
                    />
                </View>

                <SectionHeader title="DATA & STORAGE" />
                <View style={styles.sectionCard}>
                    <SettingsRow 
                        icon="server" 
                        title="Storage Usage" 
                        subtitle="Manage downloaded offline maps"
                        rightElement={<Text variant="labelMd" color={colors['on-surface-variant']}>1.2 GB</Text>}
                        onPress={() => {}}
                    />
                    <View style={styles.divider} />
                    <SettingsRow 
                        icon="trash-bin" 
                        title="Clear Cache" 
                        subtitle="Free up space by removing temp data"
                        rightElement={<Text variant="labelMd" color={colors['on-surface-variant']}>342 MB</Text>}
                        onPress={() => {}}
                    />
                </View>

                <SectionHeader title="ABOUT" />
                <View style={styles.sectionCard}>
                    <SettingsRow 
                        icon="information-circle" 
                        title="App Version" 
                        rightElement={<Text variant="labelMd" color={colors['on-surface-variant']}>v1.0.4 (Build 42)</Text>}
                    />
                    <View style={styles.divider} />
                    <SettingsRow 
                        icon="document-text" 
                        title="Terms of Service & Privacy" 
                        onPress={() => {}}
                    />
                </View>

                <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
                    <Text variant="labelLg" color={colors.error} style={{ fontWeight: 'bold' }}>Log Out</Text>
                </TouchableOpacity>

                <View style={{ height: 100 }} />
            </ScrollView>
        </Screen>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        paddingBottom: spacing.md,
        backgroundColor: colors.surface,
    },
    scrollContent: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
    },
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors['surface-container-low'],
        padding: spacing.md,
        borderRadius: shapes.roundedXl,
        marginBottom: spacing.xl,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.tertiary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    profileInfo: {
        flex: 1,
        marginLeft: spacing.md,
    },
    sectionHeader: {
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: spacing.sm,
        marginLeft: spacing.sm,
        fontWeight: 'bold',
    },
    sectionCard: {
        backgroundColor: colors.white,
        borderRadius: shapes.roundedLg,
        marginBottom: spacing.xl,
        borderWidth: 1,
        borderColor: colors['outline-variant'],
        overflow: 'hidden',
    },
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors['surface-container-high'],
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
    },
    rowText: {
        flex: 1,
    },
    rightElement: {
        marginLeft: spacing.sm,
        justifyContent: 'center',
        alignItems: 'flex-end',
    },
    divider: {
        height: 1,
        backgroundColor: colors['outline-variant'],
        marginLeft: 72,
    },
    logoutBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.md,
        backgroundColor: 'rgba(255, 235, 238, 0.5)',
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: 'rgba(186, 26, 26, 0.2)',
        marginTop: spacing.md,
    }
});
