import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { DataState } from '../../components/DataState';
import { Toast } from '../../components/Toast';
import { medicalService } from '../../services/medical';
import { formatApiError } from '../../services/apiClient';

import { colors, spacing, shapes } from '../../theme/theme';

const fields = [
  'bloodGroup',
  'allergies',
  'medicalConditions',
  'currentMedications',
  'doctorName',
  'doctorPhone',
  'additionalNotes',
];

const readable = key =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, char => char.toUpperCase());

export const MedicalIdScreen = ({ navigation }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState('error');

  const load = useCallback(() => {
    setError('');
    setLoading(true);
    medicalService
      .get()
      .then(res => {
        setData(res || {});
      })
      .catch(err => {
        const formatted = formatApiError(err);
        setError(formatted.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setToastMessage(null);
    try {
      await medicalService.update(data);
      setToastMessage('Medical ID saved successfully!');
      setToastType('success');
      setTimeout(() => {
        if (navigation.canGoBack()) navigation.goBack();
      }, 1000);
    } catch (err) {
      const formatted = formatApiError(err);
      setToastMessage(formatted.message);
      setToastType('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <Toast
        message={toastMessage}
        type={toastType}
        onDismiss={() => setToastMessage(null)}
      />

      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>

          <Text variant="headlineMd" style={styles.title}>Medical ID</Text>
        </View>
        <Ionicons name="medkit" size={24} color={colors.primary} />
      </View>

      {loading || error || !data ? (
        <DataState loading={loading} error={error} onRetry={load} />
      ) : (
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text color={colors['on-surface-variant']}>
              This information can be shared with emergency responders during an SOS event.
            </Text>

            {fields.map(key => (
              <View key={key}>
                <Text variant="labelLg" style={styles.label}>
                  {readable(key)}
                </Text>
                <TextInput
                  value={data[key] || ''}
                  onChangeText={value => setData({ ...data, [key]: value })}
                  multiline={['allergies', 'medicalConditions', 'currentMedications', 'additionalNotes'].includes(key)}
                  keyboardType={key === 'doctorPhone' ? 'phone-pad' : 'default'}
                  style={styles.input}
                  placeholderTextColor={colors.textSecondary}
                  editable={!saving}
                />
              </View>
            ))}

            {[
              ['organDonor', 'Organ Donor'],
              ['wheelchairRequired', 'Wheelchair Required'],
            ].map(([key, label]) => (
              <View key={key} style={styles.toggle}>
                <Text variant="labelLg">{label}</Text>
                <Switch
                  value={Boolean(data[key])}
                  onValueChange={value => setData({ ...data, [key]: value })}
                  trackColor={{ false: colors.outline, true: colors.primary }}
                  disabled={saving}
                />
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Button
              title="Save Medical ID"
              onPress={save}
              isLoading={saving}
              disabled={saving}
            />
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: colors['surface-variant'],
  },
  title: { fontWeight: 'bold', color: colors.primary, flexShrink: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  label: { marginBottom: spacing.sm },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors['outline-variant'],
    borderRadius: shapes.roundedMd,
    padding: spacing.md,
    color: colors['on-surface'],
    textAlignVertical: 'top',
  },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer: { padding: spacing.lg },
});
