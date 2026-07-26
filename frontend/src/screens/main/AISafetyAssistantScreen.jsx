import React from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSidebar } from '../../context/SidebarContext';

export const AISafetyAssistantScreen = () => {
    const { toggleDrawer } = useSidebar();
    return (
        <Screen style={styles.container}>
            {/* Top Navigation */}
            <View style={styles.header}>
                <View style={styles.headerTitleContainer}>
                    <TouchableOpacity onPress={toggleDrawer} accessibilityLabel="Open menu" style={{ marginRight: 4 }}>
                        <Ionicons name="menu" size={28} color={colors.primary} />
                    </TouchableOpacity>
                    <Text variant="headlineSm" style={{ fontWeight: 'bold', color: colors.primary }}>AI Assistant</Text>
                    <View style={styles.liveIndicator}>
                        <View style={styles.liveDot} />
                        <Text variant="labelSm" color={colors.primary}>Active</Text>
                    </View>
                </View>
                <TouchableOpacity style={styles.iconBtn}>
                    <Ionicons name="ellipsis-vertical" size={20} color={colors['on-surface-variant']} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* Intro Section */}
                <View style={styles.introSection}>
                    <View style={styles.aiAvatar}>
                        <Ionicons name="sparkles" size={24} color={colors.white} />
                    </View>
                    <Text variant="headlineMd" style={{ fontWeight: 'bold', marginTop: spacing.md }}>Hello, I'm your AI Safety Assistant</Text>
                    <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ textAlign: 'center', marginTop: spacing.xs }}>
                        I monitor your surroundings in real-time. How can I help you today?
                    </Text>
                </View>

                {/* Suggested Prompts Grid */}
                <View style={styles.suggestionsGrid}>
                    <TouchableOpacity style={styles.suggestionBtn}>
                        <Ionicons name="navigate" size={18} color={colors.tertiary} />
                        <Text variant="labelMd" style={{ flex: 1 }}>Safest route to hotel?</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.suggestionBtn}>
                        <Ionicons name="warning" size={18} color={colors.error} />
                        <Text variant="labelMd" style={{ flex: 1 }}>Any danger zones near me?</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.suggestionBtn}>
                        <Ionicons name="partly-sunny" size={18} color={colors.secondary} />
                        <Text variant="labelMd" style={{ flex: 1 }}>Weather impact on travel?</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.suggestionBtn}>
                        <Ionicons name="call" size={18} color={colors.primary} />
                        <Text variant="labelMd" style={{ flex: 1 }}>Local emergency numbers</Text>
                    </TouchableOpacity>
                </View>

                {/* Date Header */}
                <Text variant="labelSm" color={colors.outline} style={styles.dateDivider}>Today, 18:24</Text>

                {/* User Message */}
                <View style={styles.userMessageRow}>
                    <View style={styles.userBubble}>
                        <Text variant="bodyMd" color={colors.white}>What's the safest route to Harbor District from here?</Text>
                    </View>
                </View>

                {/* AI Response Block */}
                <View style={styles.aiMessageRow}>
                    
                    {/* Context Contexts */}
                    <View style={styles.contextChipsRow}>
                        <View style={styles.contextChip}>
                            <Ionicons name="time" size={14} color={colors['on-surface-variant']} />
                            <Text variant="labelSm" color={colors['on-surface-variant']}>Evening</Text>
                        </View>
                        <View style={styles.contextChip}>
                            <Ionicons name="rainy" size={14} color={colors['on-surface-variant']} />
                            <Text variant="labelSm" color={colors['on-surface-variant']}>Clear</Text>
                        </View>
                        <View style={[styles.contextChip, { borderColor: colors.primary }]}>
                            <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
                            <Text variant="labelSm" color={colors.primary}>Safe Route</Text>
                        </View>
                    </View>

                    {/* Route Info */}
                    <View style={styles.routeCard}>
                        <View>
                            <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Route to Harbor District</Text>
                            <Text variant="labelMd" color={colors['on-surface-variant']}>2.4 km • 28 mins walking</Text>
                        </View>
                        <Ionicons name="walk" size={24} color={colors.primary} />
                    </View>

                    {/* Text Response */}
                    <View style={styles.aiBubble}>
                        <Text variant="bodyMd" color={colors['on-surface-variant']}>
                            Based on current data, your route is mostly safe. However, there is a minor localized alert for the next 2 blocks.
                        </Text>
                    </View>

                    {/* Safety Alert Card */}
                    <View style={styles.alertCard}>
                        <View style={styles.alertHeader}>
                            <Ionicons name="warning" size={20} color={colors.error} />
                            <Text variant="labelLg" color={colors['on-error-container']} style={{ fontWeight: 'bold' }}>Safety Alert: High Traffic Area</Text>
                        </View>
                        <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ marginVertical: spacing.sm }}>
                            Construction on Aker Brygge has caused crowded sidewalks. Stay alert for pickpockets in this high-density zone.
                        </Text>
                        <View style={styles.alertActionsRow}>
                            <TouchableOpacity style={styles.alertActionBtn}>
                                <Ionicons name="git-merge" size={16} color={colors.primary} />
                                <Text variant="labelMd" color={colors.primary}>Find detour</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.alertActionBtn}>
                                <Ionicons name="share-outline" size={16} color={colors.primary} />
                                <Text variant="labelMd" color={colors.primary}>Share route</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Weather Card */}
                    <View style={styles.weatherCard}>
                        <View style={styles.weatherIconBox}>
                            <Ionicons name="cloud-done" size={32} color={colors.white} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={styles.weatherHeader}>
                                <Text variant="labelLg" style={{ fontWeight: 'bold' }}>Weather Forecast</Text>
                                <Text variant="headlineSm" color={colors.primary} style={{ fontWeight: 'bold' }}>12°C</Text>
                            </View>
                            <Text variant="labelMd" color={colors['on-surface-variant']}>No rain expected for the next 3 hours. Visibility is excellent.</Text>
                        </View>
                    </View>

                </View>

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Bottom Input Area */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.bottomInputContainer}>
                    <View style={styles.inputWrapper}>
                        <TouchableOpacity style={styles.micBtn}>
                            <Ionicons name="mic" size={20} color={colors.primary} />
                        </TouchableOpacity>
                        <TextInput 
                            style={styles.chatInput}
                            placeholder="Ask about safety, weather, or routes..."
                            placeholderTextColor="rgba(134, 115, 106, 0.5)"
                        />
                        <TouchableOpacity style={styles.sendBtn}>
                            <Ionicons name="send" size={18} color={colors.white} />
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
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
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    liveIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors['primary-container'],
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: shapes.roundedPill,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.primary,
    },
    iconBtn: {
        padding: spacing.sm,
    },
    scrollContent: {
        padding: spacing.lg,
    },
    introSection: {
        alignItems: 'center',
        marginBottom: spacing.xl,
        paddingTop: spacing.md,
    },
    aiAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.secondary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    suggestionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginBottom: spacing.xl,
    },
    suggestionBtn: {
        flex: 1,
        minWidth: '45%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors['surface-container-low'],
        padding: spacing.md,
        borderRadius: shapes.roundedLg,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    dateDivider: {
        textAlign: 'center',
        marginBottom: spacing.lg,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    userMessageRow: {
        alignItems: 'flex-end',
        marginBottom: spacing.xl,
    },
    userBubble: {
        maxWidth: '85%',
        backgroundColor: colors.tertiary,
        padding: spacing.md,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 4,
    },
    aiMessageRow: {
        alignItems: 'flex-start',
        marginBottom: spacing.xl,
        maxWidth: '95%',
        gap: spacing.md,
    },
    contextChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginBottom: spacing.xs,
    },
    contextChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: colors.outline,
        backgroundColor: colors['surface-container-lowest'],
    },
    routeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        backgroundColor: colors['surface-container-low'],
        padding: spacing.md,
        borderRadius: shapes.roundedLg,
    },
    aiBubble: {
        backgroundColor: colors['surface-container-high'],
        padding: spacing.md,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    alertCard: {
        width: '100%',
        backgroundColor: 'rgba(255, 235, 238, 0.3)', // error-container/30
        borderLeftWidth: 4,
        borderLeftColor: colors.error,
        padding: spacing.md,
        borderRadius: shapes.roundedMd,
    },
    alertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    alertActionsRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    alertActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.5)',
    },
    weatherCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        width: '100%',
        backgroundColor: colors['surface-container-high'],
        padding: spacing.md,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.3)',
    },
    weatherIconBox: {
        width: 64,
        height: 64,
        borderRadius: 16,
        backgroundColor: '#60a5fa', // tertiary-fixed equivalent
        alignItems: 'center',
        justifyContent: 'center',
    },
    weatherHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    bottomInputContainer: {
        position: 'absolute',
        bottom: 80, // slightly above bottom nav
        left: 0,
        right: 0,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.lg,
        backgroundColor: 'rgba(255, 248, 246, 0.9)', // surface/90
        borderTopWidth: 1,
        borderTopColor: 'rgba(217, 194, 183, 0.2)',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors['surface-container-low'],
        borderRadius: shapes.roundedPill,
        borderWidth: 1,
        borderColor: 'rgba(217, 194, 183, 0.4)',
        height: 56,
        paddingHorizontal: spacing.xs,
    },
    micBtn: {
        padding: spacing.sm,
    },
    chatInput: {
        flex: 1,
        fontSize: typography.sizes.bodyMd,
        color: colors['on-surface'],
        paddingHorizontal: spacing.sm,
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
