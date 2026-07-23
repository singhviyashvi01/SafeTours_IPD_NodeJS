import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button } from '../../components/Button';
import { DataState } from '../../components/DataState';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Toast } from '../../components/Toast';
import { communityService } from '../../services/community';
import { colors, shapes, spacing } from '../../theme/theme';

const categories = ['Street Light Failure', 'Road Block', 'Waterlogging', 'Accident', 'Medical Emergency', 'Suspicious Activity', 'Harassment', 'Theft', 'Assault', 'Fire', 'Other'];
const idOf = item => item?._id || item?.id;

export const CommunityScreen = () => {
  const navigation = useNavigation();
  const [latitude, setLatitude] = useState(''); const [longitude, setLongitude] = useState(''); const [radius, setRadius] = useState('5000');
  const [incidentType, setIncidentType] = useState(categories[0]); const [description, setDescription] = useState('');
  const [items, setItems] = useState(null); const [isLoading, setIsLoading] = useState(false); const [isSubmitting, setIsSubmitting] = useState(false); const [error, setError] = useState(''); const [toast, setToast] = useState('');

  const coordinates = () => {
    const lat = Number(latitude); const lng = Number(longitude); const searchRadius = Number(radius);
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Enter valid latitude and longitude values.');
    if (!Number.isFinite(searchRadius) || searchRadius < 0) throw new Error('Radius must be zero or greater.');
    return { latitude: lat, longitude: lng, radius: searchRadius };
  };

  // GET /community/nearby fetches only active incidents; this module renders them in a list, never on a map.
  const loadNearby = useCallback(async () => {
    let query; try { query = coordinates(); } catch (validationError) { setError(validationError.message); setItems(null); return; }
    setIsLoading(true); setError('');
    try { setItems(await communityService.nearby(query)); } catch (requestError) { setError(requestError.message); } finally { setIsLoading(false); }
  }, [latitude, longitude, radius]);

  useFocusEffect(useCallback(() => { if (latitude && longitude) loadNearby(); }, [latitude, longitude, loadNearby]));

  const reportIncident = async () => {
    let location; try { location = coordinates(); if (description.trim().length < 5) throw new Error('Description must have at least 5 characters.'); } catch (validationError) { setError(validationError.message); return; }
    setIsSubmitting(true); setError('');
    try {
      // POST /community/report sends this report; successful reports refresh the nearby list immediately.
      await communityService.report({ incidentType, description: description.trim(), latitude: location.latitude, longitude: location.longitude });
      setDescription(''); setToast('Incident reported. Nearby incidents were refreshed.');
      await loadNearby();
    } catch (requestError) { setError(requestError.message); } finally { setIsSubmitting(false); }
  };

  const reactToIncident = async (incident, action) => {
    setIsSubmitting(true); setError('');
    try {
      // Confirm is the backend-supported upvote equivalent; report-false is the downvote equivalent.
      const updated = action === 'confirm' ? await communityService.confirm(idOf(incident)) : await communityService.reportFalse(idOf(incident));
      setItems(current => current?.map(item => idOf(item) === idOf(updated) ? { ...item, ...updated } : item) || []);
      setToast(action === 'confirm' ? 'Incident confirmed.' : 'Incident marked as a possible false report.');
    } catch (requestError) { setError(requestError.message); } finally { setIsSubmitting(false); }
  };

  return <Screen style={styles.container}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={colors.primary} /></TouchableOpacity><Text variant="headlineMd" style={styles.title}>Community</Text><View style={{ width: 24 }} /></View><Text variant="bodyMd" color={colors['on-surface-variant']} style={styles.help}>List-only community reports. Enter coordinates manually; this screen does not access Maps or GPS.</Text><Field label="Latitude" value={latitude} onChangeText={setLatitude} placeholder="19.0760" /><Field label="Longitude" value={longitude} onChangeText={setLongitude} placeholder="72.8777" /><Field label="Search radius (metres)" value={radius} onChangeText={setRadius} placeholder="5000" /><Button title="Refresh nearby incidents" variant="secondary" onPress={loadNearby} isLoading={isLoading} style={styles.button} /><Text variant="headlineSm" style={styles.section}>Report an incident</Text><Text variant="labelLg" style={styles.label}>Incident type</Text><View style={styles.categoryList}>{categories.map(type => <TouchableOpacity key={type} style={[styles.category, incidentType === type && styles.categorySelected]} onPress={() => setIncidentType(type)}><Text variant="labelMd" color={incidentType === type ? colors.white : colors.primary}>{type}</Text></TouchableOpacity>)}</View><Field label="Description" value={description} onChangeText={setDescription} placeholder="Describe what happened" multiline />{error ? <Text variant="bodyMd" color={colors.error} style={styles.error}>{error}</Text> : null}<Button title="Report incident" onPress={reportIncident} isLoading={isSubmitting} style={styles.button} /><Text variant="headlineSm" style={styles.section}>Nearby incidents</Text>{isLoading && items === null ? <DataState loading /> : items === null ? <DataState empty emptyText="Enter coordinates, then refresh the list." /> : items.length === 0 ? <DataState empty emptyText="No active incidents found nearby." /> : items.map(item => <IncidentCard key={idOf(item)} item={item} onConfirm={() => reactToIncident(item, 'confirm')} onFalse={() => Alert.alert('Mark as false?', 'This sends a false-report vote to the backend.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', style: 'destructive', onPress: () => reactToIncident(item, 'false') }])} disabled={isSubmitting} />)}</ScrollView><Toast message={toast} type="success" onDismiss={() => setToast('')} /></Screen>;
};

const IncidentCard = ({ item, onConfirm, onFalse, disabled }) => <View style={styles.card}><View style={styles.cardTop}><Text variant="labelLg" style={{ fontWeight: 'bold', flex: 1 }}>{item.incidentType}</Text><Text variant="labelMd" color={colors.error}>{item.severity}</Text></View><Text variant="bodyMd" color={colors['on-surface-variant']} style={styles.cardDescription}>{item.description}</Text><Text variant="labelMd" color={colors.outline}>{item.distanceInMeters != null ? `${Math.round(item.distanceInMeters)} m away • ` : ''}{new Date(item.createdAt).toLocaleString()}</Text><View style={styles.voteRow}><TouchableOpacity disabled={disabled} onPress={onConfirm} style={styles.vote}><Ionicons name="thumbs-up-outline" size={18} color={colors.primary} /><Text variant="labelMd" color={colors.primary}>Confirm {item.confirmationCount || 0}</Text></TouchableOpacity><TouchableOpacity disabled={disabled} onPress={onFalse} style={styles.vote}><Ionicons name="thumbs-down-outline" size={18} color={colors.error} /><Text variant="labelMd" color={colors.error}>False {item.falseReportCount || 0}</Text></TouchableOpacity></View></View>;
const Field = ({ label, ...props }) => <View style={styles.field}><Text variant="labelLg" style={styles.label}>{label}</Text><TextInput keyboardType={props.multiline ? 'default' : 'decimal-pad'} style={[styles.input, props.multiline && styles.multiline]} placeholderTextColor={colors.outline} {...props} /></View>;
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.surface }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: colors.primary, fontWeight: 'bold' }, help: { marginVertical: spacing.md, lineHeight: 20 }, field: { marginTop: spacing.md }, label: { marginBottom: spacing.xs }, input: { minHeight: 48, borderWidth: 1, borderColor: colors['outline-variant'], borderRadius: shapes.roundedMd, padding: spacing.md, color: colors['on-surface'], backgroundColor: colors['surface-container-lowest'] }, multiline: { height: 90, textAlignVertical: 'top' }, button: { marginTop: spacing.md }, section: { marginTop: spacing.xl, fontWeight: 'bold' }, categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, category: { borderWidth: 1, borderColor: colors.primary, borderRadius: shapes.roundedPill, paddingHorizontal: spacing.sm, paddingVertical: 6 }, categorySelected: { backgroundColor: colors.primary }, error: { marginTop: spacing.md }, card: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors['surface-container-low'], borderRadius: shapes.roundedLg, borderWidth: 1, borderColor: colors['outline-variant'] }, cardTop: { flexDirection: 'row', gap: spacing.sm }, cardDescription: { marginVertical: spacing.xs }, voteRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md }, vote: { flexDirection: 'row', alignItems: 'center', gap: 4 }, });
