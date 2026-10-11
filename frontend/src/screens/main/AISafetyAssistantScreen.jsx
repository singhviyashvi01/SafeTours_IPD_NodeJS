import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, KeyboardAvoidingView, ActivityIndicator, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { useSidebar } from '../../context/SidebarContext';
import { useConnectivity } from '../../context/ConnectivityContext';
import { askAssistant } from '../../services/assistant';
import { communityService } from '../../services/communityService';
import { chatStore } from '../../storage/chatStore';
import { currentPosition } from '../../utils/assistantContext';
import * as flow from '../../offline/proposalFlow';
import { capHistory } from '../../offline/chatLogic';

/**
 * Safety assistant.
 *   - Online: answers come from the server (Gemini, grounded in your real location, risk, weather, nearby
 *     places and community reports). Each reply is labelled "AI" or "Offline assistant" (rule-based).
 *   - Offline: no request is made; the rule-based answer uses the data saved on the phone, and says so.
 *   - A report suggested from your message is only a CARD. Nothing is filed until you tap Confirm.
 *   - History is stored on this phone only (Clear removes it).
 */

const QUICK_PROMPTS = [
    { icon: 'shield-checkmark', text: 'Is this area safe?' },
    { icon: 'medkit', text: 'Nearest hospital' },
    { icon: 'alert-circle', text: 'What should I do now?' },
    { icon: 'people', text: 'Any incidents reported near me?' },
];

const DEGRADED_TEXT = {
    offline: 'No connection: answered from data saved on your phone.',
    forced_offline: 'Offline mode is on: answered from data saved on your phone.',
    server_unreachable: 'Could not reach the server: answered from data saved on your phone.',
    rate_limited: 'You are asking too fast: answered from saved data.',
    no_key: 'The AI is not configured on the server: rule-based answer.',
};
const degradedText = (code) => DEGRADED_TEXT[code] || (code && String(code).startsWith('server_') ? 'The server had a problem: answered from data saved on your phone.' : code ? 'The AI was unavailable: rule-based answer.' : null);

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const AISafetyAssistantScreen = () => {
    const { toggleDrawer } = useSidebar();
    const route = useRoute();
    const conn = useConnectivity();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const scrollRef = useRef(null);
    const sendingProposals = useRef(new Set());
    const handledPrompt = useRef(null);

    // history from this phone
    useEffect(() => {
        chatStore.load().then((m) => {
            setMessages(m);
            setLoaded(true);
        });
    }, []);

    const persist = useCallback((next) => {
        chatStore.save(next).catch(() => {});
        return next;
    }, []);

    useEffect(() => {
        const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
        return () => clearTimeout(t);
    }, [messages, busy]);

    const send = useCallback(
        async (text) => {
            const message = String(text || '').trim();
            if (!message || busy) return;
            setInput('');
            const userMsg = { id: newId(), role: 'user', text: message, ts: Date.now() };
            const history = [...messages, userMsg];
            setMessages(persist(capHistory(history)));
            setBusy(true);
            try {
                const out = await askAssistant({ message, history: messages });
                const reply = {
                    id: newId(),
                    role: 'assistant',
                    text: out.reply,
                    label: out.label,
                    source: out.source,
                    degraded: out.degraded,
                    proposal: out.reportProposal ? flow.create(out.reportProposal) : null,
                    ts: Date.now(),
                };
                setMessages((cur) => persist(capHistory([...cur, reply])));
            } catch (e) {
                const err = { id: newId(), role: 'assistant', text: 'Something went wrong. Please try again.', error: true, retryText: message, ts: Date.now() };
                setMessages((cur) => [...cur, err]);
            } finally {
                setBusy(false);
            }
        },
        [busy, messages, persist]
    );

    // A prompt handed over from Home (tip tapped): sent once.
    useEffect(() => {
        const p = route.params?.initialPrompt;
        if (loaded && p && handledPrompt.current !== route.params?.promptId) {
            handledPrompt.current = route.params?.promptId;
            send(p);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded, route.params?.promptId]);

    const setProposal = (id, proposal) => setMessages((cur) => persist(cur.map((m) => (m.id === id ? { ...m, proposal } : m))));

    const confirmProposal = async (msg) => {
        if (sendingProposals.current.has(msg.id)) return; // double tap
        const confirmed = flow.confirm(msg.proposal);
        setProposal(msg.id, confirmed);
        sendingProposals.current.add(msg.id);
        try {
            const position = await currentPosition();
            const out = await flow.submit(confirmed, async (p) => {
                if (!position) return { success: false, error: { message: 'Your location is not available. Turn on location and try again.' } };
                return communityService.reportIncident({ incidentType: p.incidentType, description: p.description, latitude: position.latitude, longitude: position.longitude });
            });
            setProposal(msg.id, out.state);
        } finally {
            sendingProposals.current.delete(msg.id);
        }
    };

    const clearChat = () =>
        Alert.alert('Clear chat', 'Delete this conversation from your phone?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: async () => { await chatStore.clear(); setMessages([]); } },
        ]);

    const pill = conn.isOffline ? { text: 'Offline: saved data', color: colors.error } : conn.state === 'WEAK' ? { text: 'Weak connection', color: '#b26a00' } : { text: 'Online', color: colors.tertiary };

    return (
        <Screen style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerTitleContainer}>
                    <TouchableOpacity onPress={toggleDrawer} accessibilityLabel="Open menu" style={{ marginRight: 4 }}>
                        <Ionicons name="menu" size={28} color={colors.primary} />
                    </TouchableOpacity>
                    <Text variant="headlineSm" style={{ fontWeight: 'bold', color: colors.primary }}>Safety Assistant</Text>
                    <View style={[styles.statusPill, { borderColor: pill.color }]}>
                        <View style={[styles.liveDot, { backgroundColor: pill.color }]} />
                        <Text variant="labelSm" style={{ color: pill.color }}>{pill.text}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={clearChat} accessibilityLabel="Clear chat" disabled={messages.length === 0} style={{ opacity: messages.length ? 1 : 0.3 }}>
                    <Ionicons name="trash-outline" size={22} color={colors['on-surface-variant']} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
                <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                    {messages.length === 0 && loaded && (
                        <View style={styles.intro}>
                            <View style={styles.aiAvatar}>
                                <Ionicons name="shield-checkmark" size={26} color={colors.white} />
                            </View>
                            <Text variant="headlineMd" style={{ fontWeight: 'bold', marginTop: spacing.md, textAlign: 'center' }}>Ask about your safety</Text>
                            <Text variant="bodyMd" color={colors['on-surface-variant']} style={{ textAlign: 'center', marginTop: spacing.xs }}>
                                I answer from your real location, the area's risk data, nearby hospitals and police, and community reports. When data is missing, old or sample data, I say so.
                                {'\n'}In an emergency call 112 or press SOS.
                            </Text>
                        </View>
                    )}

                    {messages.map((m) =>
                        m.role === 'user' ? (
                            <View key={m.id} style={styles.userRow}>
                                <View style={styles.userBubble}>
                                    <Text variant="bodyMd" color={colors.white}>{m.text}</Text>
                                </View>
                            </View>
                        ) : (
                            <View key={m.id} style={styles.aiRow}>
                                <View style={[styles.aiBubble, m.error && { borderColor: colors.error }]}>
                                    {!m.error && (
                                        <View style={[styles.labelChip, m.source === 'gemini' ? styles.labelAi : styles.labelRules]}>
                                            <Ionicons name={m.source === 'gemini' ? 'sparkles' : 'hardware-chip-outline'} size={12} color={m.source === 'gemini' ? colors.white : colors['on-surface-variant']} />
                                            <Text variant="labelSm" style={{ color: m.source === 'gemini' ? colors.white : colors['on-surface-variant'], fontWeight: '700' }}>
                                                {m.label === 'AI' ? 'AI' : 'Offline assistant'}
                                            </Text>
                                        </View>
                                    )}
                                    <Text variant="bodyMd">{m.text}</Text>
                                    {degradedText(m.degraded) && !m.error && (
                                        <Text variant="labelSm" color={colors['on-surface-variant']} style={{ marginTop: 6 }}>{degradedText(m.degraded)}</Text>
                                    )}
                                    {m.error && m.retryText && (
                                        <TouchableOpacity onPress={() => send(m.retryText)} style={styles.retryBtn}>
                                            <Text variant="labelMd" style={{ color: colors.primary, fontWeight: 'bold' }}>Try again</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {m.proposal && m.proposal.status !== 'dismissed' && (
                                    <ProposalCard state={m.proposal} onConfirm={() => confirmProposal(m)} onDismiss={() => setProposal(m.id, flow.dismiss(m.proposal))} />
                                )}
                            </View>
                        )
                    )}

                    {busy && (
                        <View style={styles.aiRow}>
                            <View style={[styles.aiBubble, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text variant="bodyMd" color={colors['on-surface-variant']}>{conn.isOffline ? 'Checking saved data...' : 'Thinking...'}</Text>
                            </View>
                        </View>
                    )}
                </ScrollView>

                <View style={styles.chipsRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {QUICK_PROMPTS.map((q) => (
                            <TouchableOpacity key={q.text} style={styles.quickChip} onPress={() => send(q.text)} disabled={busy}>
                                <Ionicons name={q.icon} size={14} color={colors.primary} />
                                <Text variant="labelMd">{q.text}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <View style={styles.inputBar}>
                    <TextInput
                        style={styles.chatInput}
                        placeholder="Ask about safety, or describe an incident to report"
                        placeholderTextColor={colors['on-surface-variant']}
                        value={input}
                        onChangeText={setInput}
                        maxLength={500}
                        multiline
                        editable={!busy}
                        returnKeyType="send"
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.4 }]}
                        onPress={() => send(input)}
                        disabled={!input.trim() || busy}
                        accessibilityRole="button"
                        accessibilityLabel="Send message"
                    >
                        <Ionicons name="send" size={20} color={colors.white} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </Screen>
    );
};

/** The suggested report. Nothing is filed until Confirm. */
const ProposalCard = ({ state, onConfirm, onDismiss }) => {
    const p = state.proposal;
    const done = state.status === 'submitted' || state.status === 'queued';
    return (
        <View style={styles.proposal}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={done ? 'checkmark-circle' : 'flag'} size={18} color={done ? '#2E7D32' : colors.primary} />
                <Text variant="labelLg" style={{ fontWeight: 'bold', flex: 1 }}>
                    {state.status === 'submitted' ? 'Report filed' : state.status === 'queued' ? 'Saved: it will be filed when you are online' : 'Report this incident?'}
                </Text>
            </View>
            <Text variant="labelMd" style={{ fontWeight: 'bold' }}>{p.incidentType}</Text>
            <Text variant="bodyMd">{p.description}</Text>
            {!done && (
                <>
                    <Text variant="labelSm" color={colors['on-surface-variant']}>
                        It will be filed at your current location and shown to other users nearby. Nothing is sent until you confirm.
                    </Text>
                    {state.error && <Text variant="labelMd" style={{ color: colors.error }}>{state.error}</Text>}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                        <TouchableOpacity style={[styles.pBtn, styles.pConfirm]} onPress={onConfirm} disabled={state.status === 'confirming' || state.status === 'sending'}>
                            {state.status === 'confirming' || state.status === 'sending' ? <ActivityIndicator size="small" color={colors.white} /> : <Text variant="labelMd" style={{ color: colors.white, fontWeight: 'bold' }}>Confirm and report</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.pBtn} onPress={onDismiss} disabled={state.status === 'confirming' || state.status === 'sending'}>
                            <Text variant="labelMd" style={{ color: colors.primary, fontWeight: 'bold' }}>Not now</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface },
    headerTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: shapes.roundedPill, borderWidth: 1 },
    liveDot: { width: 8, height: 8, borderRadius: 4 },
    scrollContent: { padding: spacing.lg, paddingBottom: spacing.md, flexGrow: 1 },
    intro: { alignItems: 'center', paddingVertical: spacing.xl },
    aiAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    userRow: { alignItems: 'flex-end', marginBottom: spacing.md },
    userBubble: { maxWidth: '85%', backgroundColor: colors.tertiary, padding: spacing.md, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 4 },
    aiRow: { alignItems: 'flex-start', marginBottom: spacing.md, maxWidth: '95%', gap: spacing.sm },
    aiBubble: { backgroundColor: colors['surface-container-high'], padding: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(217, 194, 183, 0.3)' },
    labelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginBottom: 6 },
    labelAi: { backgroundColor: colors.primary },
    labelRules: { backgroundColor: 'rgba(0,0,0,0.08)' },
    retryBtn: { marginTop: 8, alignSelf: 'flex-start' },
    proposal: { backgroundColor: colors['surface-container-low'], borderRadius: shapes.roundedLg, borderWidth: 1, borderColor: colors.primary, padding: spacing.md, gap: 4, width: '100%' },
    pBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', minWidth: 90 },
    pConfirm: { backgroundColor: colors.primary },
    chipsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    quickChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(217, 194, 183, 0.6)', backgroundColor: colors['surface-container-lowest'], marginRight: 8 },
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(217, 194, 183, 0.3)', backgroundColor: colors.surface },
    chatInput: { flex: 1, maxHeight: 110, minHeight: 44, fontSize: typography.sizes.bodyMd, color: colors['on-surface'], backgroundColor: colors['surface-container-low'], borderRadius: 22, paddingHorizontal: spacing.md, paddingVertical: 10 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
