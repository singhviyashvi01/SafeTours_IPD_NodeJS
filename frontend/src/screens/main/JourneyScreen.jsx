import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button } from '../../components/Button';
import { DataState } from '../../components/DataState';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Toast } from '../../components/Toast';
import { journeyService } from '../../services/journeys';
import { colors, shapes, spacing } from '../../theme/theme';

const initialForm = {
  startLongitude: '', startLatitude: '', destinationLongitude: '', destinationLatitude: '', arrivalMinutes: '30',
};

const journeyIdOf = journey => journey?._id || journey?.id;
const formatDate = value => (value ? new Date(value).toLocaleString() : 'Not available');

export const JourneyScreen = () => {
  const navigation = useNavigation();
  const [journey, setJourney] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [toast, setToast] = useState('');

  // GET /journey/status restores the backend-persisted state whenever this screen opens.
  const loadActiveJourney = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      setJourney(await journeyService.getActive());
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadActiveJourney(); }, [loadActiveJourney]));

  const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const validStartPayload = () => {
    const startLocation = [Number(form.startLongitude), Number(form.startLatitude)];
    const destination = [Number(form.destinationLongitude), Number(form.destinationLatitude)];
    const minutes = Number(form.arrivalMinutes);
    const isLongitude = value => Number.isFinite(value) && value >= -180 && value <= 180;
    const isLatitude = value => Number.isFinite(value) && value >= -90 && value <= 90;

    if ([form.startLongitude, form.startLatitude, form.destinationLongitude, form.destinationLatitude].some(value => !value.trim()) || !isLongitude(startLocation[0]) || !isLatitude(startLocation[1]) || !isLongitude(destination[0]) || !isLatitude(destination[1])) {
      throw new Error('Enter valid longitude (-180 to 180) and latitude (-90 to 90) values.');
    }
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error('Expected arrival must be a positive number of minutes.');
    }
    return { startLocation, destination, expectedArrivalTime: new Date(Date.now() + minutes * 60000).toISOString() };
  };

  const startJourney = async () => {
    let payload;
    try { payload = validStartPayload(); } catch (validationError) { setActionError(validationError.message); return; }
    setIsSubmitting(true); setActionError('');
    try {
      // POST /journey/start creates one ACTIVE journey and returns it for the active-state UI.
      setJourney(await journeyService.start(payload));
      setToast('Journey started successfully.');
    } catch (requestError) { setActionError(requestError.message); } finally { setIsSubmitting(false); }
  };

  const updateArrival = async () => {
    const minutes = Number(form.arrivalMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) { setActionError('Expected arrival must be a positive number of minutes.'); return; }
    setIsSubmitting(true); setActionError('');
    try {
      // POST /journey/update/:id changes this active journey's ETA on the backend.
      setJourney(await journeyService.update(journeyIdOf(journey), { expectedArrivalTime: new Date(Date.now() + minutes * 60000).toISOString() }));
      setToast('Arrival time updated.');
    } catch (requestError) { setActionError(requestError.message); } finally { setIsSubmitting(false); }
  };

  const endJourney = status => Alert.alert(
    status === 'COMPLETED' ? 'Complete journey?' : 'Cancel journey?',
    status === 'COMPLETED' ? 'This will mark the journey as completed.' : 'This will end the active journey as cancelled.',
    [
      { text: 'Keep journey', style: 'cancel' },
      { text: status === 'COMPLETED' ? 'Complete' : 'Cancel journey', style: status === 'COMPLETED' ? 'default' : 'destructive', onPress: () => submitEndJourney(status) },
    ]
  );

  const submitEndJourney = async status => {
    setIsSubmitting(true); setActionError('');
    try {
      // POST /journey/end/:id transitions this active journey to COMPLETED or CANCELLED.
      await journeyService.end(journeyIdOf(journey), status);
      setJourney(null); setForm(initialForm);
      setToast(status === 'COMPLETED' ? 'Journey completed.' : 'Journey cancelled.');
    } catch (requestError) { setActionError(requestError.message); } finally { setIsSubmitting(false); }
  };

  if (isLoading) return <Screen><DataState loading /></Screen>;
  if (loadError) return <Screen><DataState error={loadError} onRetry={loadActiveJourney} /></Screen>;

  return <Screen style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityLabel="Go back" onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={colors.primary} /></TouchableOpacity>
      <Text variant="headlineMd" style={styles.title}>Journey</Text><View style={styles.headerSpacer} />
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {journey ? <ActiveJourney journey={journey} form={form} setField={setField} onUpdate={updateArrival} onEnd={endJourney} onSOS={() => navigation.navigate('Tabs', { screen: 'SOS' })} onCommunity={() => navigation.navigate('Community')} isSubmitting={isSubmitting} error={actionError} /> : <StartJourney form={form} setField={setField} onStart={startJourney} isSubmitting={isSubmitting} error={actionError} />}
    </ScrollView>
    <Toast message={toast} type="success" onDismiss={() => setToast('')} />
  </Screen>;
};

const StartJourney = ({ form, setField, onStart, isSubmitting, error }) => <View>
  <Text variant="headlineSm" style={styles.sectionTitle}>Start a journey</Text>
  <Text variant="bodyMd" color={colors['on-surface-variant']} style={styles.description}>Enter coordinates to begin. Map, GPS, live tracking, and geofencing remain outside this Journey module.</Text>
  <JourneyInput label="Start longitude" value={form.startLongitude} onChangeText={value => setField('startLongitude', value)} />
  <JourneyInput label="Start latitude" value={form.startLatitude} onChangeText={value => setField('startLatitude', value)} />
  <JourneyInput label="Destination longitude" value={form.destinationLongitude} onChangeText={value => setField('destinationLongitude', value)} />
  <JourneyInput label="Destination latitude" value={form.destinationLatitude} onChangeText={value => setField('destinationLatitude', value)} />
  <JourneyInput label="Expected arrival (minutes from now)" value={form.arrivalMinutes} onChangeText={value => setField('arrivalMinutes', value)} />
  {error ? <ErrorMessage message={error} /> : null}
  <Button title="Start journey" onPress={onStart} isLoading={isSubmitting} style={styles.button} />
</View>;

const ActiveJourney = ({ journey, form, setField, onUpdate, onEnd, onSOS, onCommunity, isSubmitting, error }) => <View>
  <View style={styles.statusCard}><Ionicons name="navigate-circle" size={40} color={colors.primary} /><View style={styles.statusCopy}><Text variant="headlineSm" style={styles.sectionTitle}>Journey active</Text><Text variant="bodyMd" color={colors['on-surface-variant']}>This state is stored on the SafeTours backend.</Text></View></View>
  <JourneyDetail label="Started" value={formatDate(journey.startTime || journey.createdAt)} />
  <JourneyDetail label="Expected arrival" value={formatDate(journey.expectedArrivalTime)} />
  <JourneyDetail label="Start coordinates" value={journey.startLocation?.coordinates?.join(', ') || 'Not available'} />
  <JourneyDetail label="Destination coordinates" value={journey.destination?.coordinates?.join(', ') || 'Not available'} />
  <JourneyInput label="New expected arrival (minutes from now)" value={form.arrivalMinutes} onChangeText={value => setField('arrivalMinutes', value)} />
  {error ? <ErrorMessage message={error} /> : null}
  <Button title="Update arrival time" variant="secondary" onPress={onUpdate} isLoading={isSubmitting} style={styles.button} />
  <Button title="Complete journey" onPress={() => onEnd('COMPLETED')} isLoading={isSubmitting} style={styles.button} />
  <Button title="Cancel journey" variant="secondary" onPress={() => onEnd('CANCELLED')} disabled={isSubmitting} style={styles.button} />
  <Button title="Open SOS" variant="sos" onPress={onSOS} disabled={isSubmitting} style={styles.button} />
  <Button title="View community reports" variant="secondary" onPress={onCommunity} disabled={isSubmitting} style={styles.button} />
</View>;

const JourneyInput = ({ label, ...props }) => <View style={styles.field}><Text variant="labelLg" style={styles.fieldLabel}>{label}</Text><TextInput keyboardType="decimal-pad" style={styles.input} placeholder="0.000000" placeholderTextColor={colors.outline} {...props} /></View>;
const JourneyDetail = ({ label, value }) => <View style={styles.detail}><Text variant="labelLg">{label}</Text><Text variant="bodyMd" color={colors['on-surface-variant']} style={styles.detailValue}>{value}</Text></View>;
const ErrorMessage = ({ message }) => <Text variant="bodyMd" color={colors.error} style={styles.error}>{message}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderColor: colors['surface-variant'] }, headerSpacer: { width: 24 }, title: { color: colors.primary, fontWeight: 'bold' }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, sectionTitle: { fontWeight: 'bold' }, description: { marginTop: spacing.xs, marginBottom: spacing.xl, lineHeight: 20 }, field: { marginBottom: spacing.md }, fieldLabel: { marginBottom: spacing.xs }, input: { height: 48, borderWidth: 1, borderColor: colors['outline-variant'], borderRadius: shapes.roundedMd, paddingHorizontal: spacing.md, color: colors['on-surface'], backgroundColor: colors['surface-container-lowest'] }, button: { marginTop: spacing.md }, error: { marginTop: spacing.sm, lineHeight: 20 }, statusCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: shapes.roundedLg, backgroundColor: colors['primary-container'], marginBottom: spacing.lg }, statusCopy: { flex: 1 }, detail: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors['outline-variant'] }, detailValue: { marginTop: 4 },
});
