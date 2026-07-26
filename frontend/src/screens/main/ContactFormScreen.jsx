import React, { useEffect, useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { DataState } from '../../components/DataState';
import { Toast } from '../../components/Toast';
import { contactsService } from '../../services/contacts';
import { formatApiError } from '../../services/apiClient';
import { colors, spacing, shapes } from '../../theme/theme';

export const ContactFormScreen = ({ navigation, route }) => {
  const id = route.params?.contactId;
  const [form, setForm] = useState({
    name: '',
    relationship: '',
    phone: '',
    email: '',
    priority: 1,
    isPrimary: false,
  });
  const [loading, setLoading] = useState(Boolean(id));
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState('error');

  useEffect(() => {
    if (id) {
      contactsService
        .get(id)
        .then(item => {
          if (!item) throw new Error('Contact not found');
          setForm({
            name: item.name || '',
            relationship: item.relationship || '',
            phone: item.phone || '',
            email: item.email || '',
            priority: item.priority || 1,
            isPrimary: Boolean(item.isPrimary),
          });
        })
        .catch(err => {
          const formatted = formatApiError(err);
          setError(formatted.message);
        })
        .finally(() => setLoading(false));
    }
  }, [id]);

  const save = async () => {
    setError('');
    setFieldErrors({});
    setToastMessage(null);

    // Client-side quick checks
    const errors = {};
    if (!form.name.trim()) errors.name = 'Full name is required';
    if (!form.relationship.trim()) errors.relationship = 'Relationship is required';
    if (!form.phone.trim()) errors.phone = 'Phone number is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        relationship: form.relationship.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() ? form.email.trim().toLowerCase() : undefined,
        priority: Number(form.priority) || 1,
        isPrimary: Boolean(form.isPrimary),
      };

      if (id) {
        await contactsService.update(id, payload);
      } else {
        await contactsService.create(payload);
      }

      setToastMessage(id ? 'Contact updated successfully!' : 'Contact created successfully!');
      setToastType('success');
      setTimeout(() => {
        navigation.goBack();
      }, 800);
    } catch (err) {
      const formatted = formatApiError(err);
      if (formatted.fieldErrors && Object.keys(formatted.fieldErrors).length > 0) {
        setFieldErrors(formatted.fieldErrors);
      }
      setToastMessage(formatted.message);
      setToastType('error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || (error && !form.name)) {
    return (
      <Screen style={styles.container}>
        <DataState loading={loading} error={error} onRetry={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <Toast
        message={toastMessage}
        type={toastType}
        onDismiss={() => setToastMessage(null)}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text variant="headlineMd" style={styles.title}>
          {id ? 'Edit Contact' : 'Add Contact'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Field
              label="Full name"
              value={form.name}
              onChangeText={name => setForm({ ...form, name })}
              error={fieldErrors.name}
              editable={!saving}
            />
            <Field
              label="Relationship"
              value={form.relationship}
              placeholder="e.g. Parent, Spouse, Friend"
              onChangeText={relationship => setForm({ ...form, relationship })}
              error={fieldErrors.relationship}
              editable={!saving}
            />
            <Field
              label="Phone number"
              value={form.phone}
              placeholder="+1234567890"
              keyboardType="phone-pad"
              onChangeText={phone => setForm({ ...form, phone })}
              error={fieldErrors.phone}
              editable={!saving}
            />
            <Field
              label="Email (optional)"
              value={form.email}
              placeholder="contact@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              onChangeText={email => setForm({ ...form, email })}
              error={fieldErrors.email}
              editable={!saving}
            />

            <View style={styles.toggleRow}>
              <Text variant="labelLg" style={{ fontWeight: '600', flex: 1 }}>
                Set as Primary Emergency Contact
              </Text>
              <Switch
                value={form.isPrimary}
                onValueChange={isPrimary => setForm({ ...form, isPrimary })}
                trackColor={{ false: colors.outline, true: colors.primary }}
                disabled={saving}
              />
            </View>
          </View>

          <View style={styles.footer}>
            <Button
              title={id ? 'Save Changes' : 'Add Contact'}
              onPress={save}
              isLoading={saving}
              disabled={saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const Field = ({ label, error, ...props }) => (
  <View style={styles.fieldContainer}>
    <Text variant="labelLg" style={styles.label}>{label}</Text>
    <TextInput
      {...props}
      style={[styles.input, error && styles.inputError]}
      placeholderTextColor={colors.textSecondary}
    />
    {error ? <Text variant="labelMd" style={styles.errorText}>{error}</Text> : null}
  </View>
);

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
  scrollContent: { flexGrow: 1, justifyContent: 'space-between' },
  content: { padding: spacing.lg, gap: spacing.md },
  fieldContainer: { marginBottom: spacing.xs },
  label: { marginBottom: spacing.xs },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors['outline-variant'],
    borderRadius: shapes.roundedMd,
    paddingHorizontal: spacing.md,
    color: colors['on-surface'],
  },
  inputError: { borderColor: colors.emergency },
  errorText: { color: colors.emergency, marginTop: 4 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  footer: { marginTop: 'auto', padding: spacing.lg },
});
