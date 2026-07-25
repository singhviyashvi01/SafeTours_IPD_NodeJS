import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { DataState } from '../../components/DataState';
import { Toast } from '../../components/Toast';
import { contactsService } from '../../services/contacts';
import { formatApiError } from '../../services/apiClient';
import { colors, spacing, shapes } from '../../theme/theme';

export const EmergencyContactsScreen = ({ navigation }) => {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState('error');

  const load = useCallback(() => {
    setError('');
    setLoading(true);
    contactsService
      .list()
      .then(res => {
        setItems(res || []);
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
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  const remove = id => {
    const executeDelete = () => {
      contactsService
        .remove(id)
        .then(() => {
          setToastMessage('Contact deleted successfully');
          setToastType('success');
          load();
        })
        .catch(err => {
          const formatted = formatApiError(err);
          setToastMessage(formatted.message);
          setToastType('error');
        });
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Remove this emergency contact?')) {
        executeDelete();
      }
    } else {
      Alert.alert('Delete contact', 'Remove this emergency contact?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: executeDelete,
        },
      ]);
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text variant="headlineMd" style={styles.title}>Emergency Contacts</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('ContactForm')}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading || error ? (
        <DataState loading={loading} error={error} onRetry={load} />
      ) : !items || items.length === 0 ? (
        <DataState empty emptyText="No emergency contacts added yet. Add someone you trust for emergencies." />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.map(item => {
            const contactId = item._id || item.id;
            return (
              <View style={styles.card} key={contactId}>
                <Ionicons name="person-circle" size={44} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text variant="labelLg" style={{ fontWeight: 'bold' }}>
                      {item.name}
                    </Text>
                    {item.isPrimary && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryText}>Primary</Text>
                      </View>
                    )}
                  </View>
                  <Text color={colors['on-surface-variant']}>
                    {item.relationship} · {item.phone}
                  </Text>
                  {item.email ? (
                    <Text variant="labelMd" color={colors['on-surface-variant']}>
                      {item.email}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate('ContactForm', { contactId })}
                >
                  <Ionicons name="create-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(contactId)}>
                  <Ionicons name="trash-outline" size={22} color={colors.error} />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
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
  title: { fontWeight: 'bold', color: colors.primary },
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors['surface-container-low'],
    borderRadius: shapes.roundedLg,
    borderWidth: 1,
    borderColor: colors['surface-variant'],
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  primaryBadge: {
    backgroundColor: colors['secondary-container'],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  primaryText: { fontSize: 10, fontWeight: 'bold', color: colors['on-secondary-container'] },
});
