import React, { useCallback, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button } from '../../components/Button';
import { DataState } from '../../components/DataState';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Toast } from '../../components/Toast';
import { journeyService } from '../../services/journeys';
import { sosService } from '../../services/sos';
import { colors, shapes, spacing } from '../../theme/theme';

const idOf = item => item?._id || item?.id;

export const SOSWorkspaceScreen = () => {
  const navigation = useNavigation();
  const [history, setHistory] = useState([]);
  const [journey, setJourney] = useState(null);
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('I need assistance.');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmingManual, setConfirmingManual] = useState(false);
  const [toast, setToast] = useState('');

  // History is the available backend source for both SOS history and active SOS state.
  const loadSOSState = useCallback(async () => {
    setIsLoading(true); setLoadError('');
    try {
      const [records, activeJourney] = await Promise.all([sosService.history(), journeyService.getActive()]);
      setHistory(records); setJourney(activeJourney);
    } catch (error) { setLoadError(error.message); } finally { setIsLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadSOSState(); }, [loadSOSState]));
  const activeSOS = history.find(record => record.status === 'active');

  const requireLocation = () => {
    if (!/^[0-9a-fA-F]{24}$/.test(locationId.trim())) {
      throw new Error('Enter a valid 24-character backend Location ID before sending SOS.');
    }
  };

  const sendManualSOS = async () => {
    try { requireLocation(); } catch (error) { setConfirmingManual(false); setActionError(error.message); return; }
    setConfirmingManual(false); setIsSubmitting(true); setActionError('');
    try {
      // POST /sos/manual uses the supplied persisted location and, if present, the active journey.
      const created = await sosService.triggerManual({ locationId: locationId.trim(), journeyId: idOf(journey) || undefined, reason: reason.trim() || undefined });
      setHistory(current => [created, ...current]);
      Alert.alert('SOS sent', 'Your SOS alert is active. Emergency contacts have been notified by the backend.');
    } catch (error) { setActionError(error.message); } finally { setIsSubmitting(false); }
  };

  const sendAutomaticSOS = async () => {
    try { requireLocation(); if (!idOf(journey)) throw new Error('An active journey is required for automatic SOS.'); }
    catch (error) { setActionError(error.message); return; }
    setIsSubmitting(true); setActionError('');
    try {
      // POST /sos/automatic is backend integration only; no geofence or GPS trigger is implemented here.
      const created = await sosService.triggerAutomatic({ locationId: locationId.trim(), journeyId: idOf(journey), reason: reason.trim() || undefined });
      setHistory(current => [created, ...current]);
      Alert.alert('Automatic SOS sent', 'The backend recorded an automatic SOS for the active journey.');
    } catch (error) { setActionError(error.message); } finally { setIsSubmitting(false); }
  };

  const cancelSOS = () => Alert.alert('Cancel active SOS?', 'This informs the backend that this emergency alert is cancelled.', [
    { text: 'Keep active', style: 'cancel' },
    { text: 'Cancel SOS', style: 'destructive', onPress: submitCancelSOS },
  ]);

  const submitCancelSOS = async () => {
    setIsSubmitting(true); setActionError('');
    try {
      // POST /sos/cancel updates only the selected active SOS record.
      const cancelled = await sosService.cancel(idOf(activeSOS), 'Cancelled by user in SafeTours app.');
      setHistory(current => current.map(record => idOf(record) === idOf(cancelled) ? cancelled : record));
      setToast('SOS cancelled successfully.');
    } catch (error) { setActionError(error.message); } finally { setIsSubmitting(false); }
  };

  if (isLoading) return <Screen><DataState loading /></Screen>;
  if (loadError) return <Screen><DataState error={loadError} onRetry={loadSOSState} /></Screen>;

  return <Screen style={styles.container}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Text variant="headlineMd" style={styles.title}>SOS</Text><TouchableOpacity onPress={() => navigation.navigate('SOSHistory')}><Ionicons name="time-outline" size={26} color={colors.primary} /></TouchableOpacity></View>
      <View style={[styles.statusCard, activeSOS ? styles.activeCard : null]}><Ionicons name={activeSOS ? 'warning' : 'shield-checkmark'} size={32} color={activeSOS ? colors.error : colors.primary} /><View style={{ flex: 1 }}><Text variant="headlineSm" style={styles.sectionTitle}>{activeSOS ? 'SOS is active' : 'SOS ready'}</Text><Text variant="bodyMd" color={colors['on-surface-variant']}>{activeSOS ? `Triggered ${new Date(activeSOS.triggeredAt).toLocaleString()}` : journey ? 'Active journey detected. Automatic SOS backend test is available.' : 'Start a journey to enable automatic SOS testing.'}</Text></View></View>
      {actionError ? <Text variant="bodyMd" color={colors.error} style={styles.error}>{actionError}</Text> : null}
      {activeSOS ? <Button title="Cancel active SOS" variant="secondary" onPress={cancelSOS} isLoading={isSubmitting} style={styles.button} /> : <>
        <Text variant="bodyMd" color={colors['on-surface-variant']} style={styles.help}>SOS requires a Location document already saved by the existing location feature. This screen does not access GPS or maps.</Text>
        <Field label="Backend Location ID" value={locationId} onChangeText={setLocationId} placeholder="24-character Location ID" />
        <Field label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Describe the emergency" multiline />
        <Button title="Send manual SOS" variant="sos" onPress={() => setConfirmingManual(true)} isLoading={isSubmitting} style={styles.button} />
        <Button title="Test automatic SOS backend" variant="secondary" onPress={sendAutomaticSOS} disabled={!journey} isLoading={isSubmitting} style={styles.button} />
      </>}
      <Button title="View SOS history" variant="secondary" onPress={() => navigation.navigate('SOSHistory')} style={styles.button} />
      <Button title="Community incident reports" variant="secondary" onPress={() => navigation.navigate('Community')} style={styles.button} />
    </ScrollView>
    <Modal visible={confirmingManual} transparent animationType="fade" onRequestClose={() => setConfirmingManual(false)}><View style={styles.overlay}><View style={styles.modal}><Ionicons name="warning" size={40} color={colors.error} /><Text variant="headlineSm" style={styles.modalTitle}>Send SOS now?</Text><Text variant="bodyMd" color={colors['on-surface-variant']} style={styles.modalCopy}>The backend will create an active SOS and notify configured emergency contacts.</Text><Button title="Send SOS" variant="sos" onPress={sendManualSOS} isLoading={isSubmitting} style={styles.button} /><Button title="Go back" variant="secondary" onPress={() => setConfirmingManual(false)} style={styles.button} /></View></View></Modal>
    <Toast message={toast} type="success" onDismiss={() => setToast('')} />
  </Screen>;
};

const Field = ({ label, ...props }) => <View style={styles.field}><Text variant="labelLg" style={styles.label}>{label}</Text><TextInput style={[styles.input, props.multiline ? styles.multiline : null]} placeholderTextColor={colors.outline} {...props} /></View>;
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.surface }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }, title: { color: colors.primary, fontWeight: 'bold' }, statusCard: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: shapes.roundedLg, backgroundColor: colors['primary-container'] }, activeCard: { backgroundColor: colors['error-container'] }, sectionTitle: { fontWeight: 'bold' }, help: { marginVertical: spacing.lg, lineHeight: 20 }, field: { marginTop: spacing.md }, label: { marginBottom: spacing.xs }, input: { minHeight: 48, borderWidth: 1, borderColor: colors['outline-variant'], borderRadius: shapes.roundedMd, padding: spacing.md, color: colors['on-surface'], backgroundColor: colors['surface-container-lowest'] }, multiline: { height: 90, textAlignVertical: 'top' }, button: { marginTop: spacing.md }, error: { marginTop: spacing.md }, overlay: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(0,0,0,0.55)' }, modal: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: shapes.roundedXl, padding: spacing.xl }, modalTitle: { fontWeight: 'bold', marginTop: spacing.md }, modalCopy: { textAlign: 'center', marginTop: spacing.sm }, });
