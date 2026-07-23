import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { DataState } from '../../components/DataState';
import { profileService } from '../../services/profile';
import { formatApiError } from '../../services/apiClient';
import { colors, spacing, shapes } from '../../theme/theme';

export const UserProfileScreen = ({ navigation }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    setLoading(true);
    profileService
      .getProfile()
      .then(data => {
        setProfile(data);
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

  const initials = (profile?.name || profile?.username || 'ST')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text variant="headlineMd" style={styles.title}>Profile</Text>
        <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
          <Ionicons name="create-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading || error || !profile ? (
        <DataState loading={loading} error={error} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.avatar}>
            <Text variant="headlineLg" color={colors.white}>{initials}</Text>
          </View>
          <Text variant="headlineMd" style={styles.name}>
            {profile.name || profile.username || 'SafeTours User'}
          </Text>
          {profile.email ? (
            <Text variant="bodyMd" color={colors['on-surface-variant']} style={styles.email}>
              {profile.email}
            </Text>
          ) : null}

          <Row icon="call" title="Phone" value={profile.phone || 'Add phone number'} />
          <Row icon="location" title="Address" value={profile.address || 'Add address'} />
          <Row icon="globe" title="Nationality" value={profile.nationality || 'Add nationality'} />
          <Row
            icon="language"
            title="Languages"
            value={
              Array.isArray(profile.languages) && profile.languages.length
                ? profile.languages.join(', ')
                : 'Add languages'
            }
          />
          <Row
            icon="people"
            title="Emergency contacts"
            value="Manage contacts"
            onPress={() => navigation.navigate('EmergencyContacts')}
          />
          <Row
            icon="medkit"
            title="Medical ID"
            value="View medical information"
            onPress={() => navigation.navigate('MedicalId')}
          />
          <Row
            icon="time"
            title="Journey history"
            value="View completed journeys"
            onPress={() => navigation.navigate('JourneyHistory')}
          />
          <Row
            icon="warning"
            title="SOS history"
            value="View SOS events"
            onPress={() => navigation.navigate('SOSHistory')}
          />
        </ScrollView>
      )}
    </Screen>
  );
};

const Row = ({ icon, title, value, onPress }) => (
  <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}>
    <Ionicons name={icon} size={20} color={colors.primary} />
    <View style={{ flex: 1 }}>
      <Text variant="labelLg" style={{ fontWeight: 'bold' }}>{title}</Text>
      <Text variant="bodyMd" color={colors['on-surface-variant']}>{value}</Text>
    </View>
    {onPress ? <Ionicons name="chevron-forward" size={20} color={colors.outline} /> : null}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderColor: colors['surface-variant'],
  },
  title: {
    fontWeight: 'bold',
    color: colors.primary,
  },
  content: {
    padding: spacing.lg,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  name: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  email: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors['surface-container-low'],
    padding: spacing.md,
    borderRadius: shapes.roundedLg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors['surface-variant'],
  },
});
