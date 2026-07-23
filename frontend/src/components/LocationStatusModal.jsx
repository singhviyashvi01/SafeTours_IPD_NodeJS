import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from './Text';
import { colors, spacing, shapes } from '../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { getRiskColors } from './MapComponent';

export const LocationStatusModal = ({
  visible,
  onClose,
  userLocation,
  accuracy,
  trackingActive,
  currentZone,
  permissionStatus,
  lastUpdateTime,
  offlineQueueSize = 0,
}) => {
  if (!visible) return null;

  const lat = userLocation ? userLocation.latitude.toFixed(6) : 'N/A';
  const lng = userLocation ? userLocation.longitude.toFixed(6) : 'N/A';
  const accuracyText = accuracy ? `±${Math.round(accuracy)}m` : '±10m';
  const updateTimeText = lastUpdateTime ? new Date(lastUpdateTime).toLocaleTimeString() : 'Just now';

  const riskLevel = currentZone ? (currentZone.riskLevel || 'HIGH') : 'SAFE';
  const riskScore = currentZone ? Math.round(currentZone.totalRiskScore ?? currentZone.crimeScore ?? 0) : 0;
  const riskColors = getRiskColors(riskLevel, riskScore);

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="hardware-chip-outline" size={24} color={colors.primary} />
              <Text variant="headlineSm" style={{ fontWeight: 'bold', color: colors.primary }}>
                Location Diagnostics
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors['on-surface-variant']} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {/* Status Banner */}
            <View style={[styles.statusBanner, { backgroundColor: riskColors.fill, borderColor: riskColors.stroke }]}>
              <View style={[styles.dot, { backgroundColor: riskColors.solid }]} />
              <View style={{ flex: 1 }}>
                <Text variant="labelLg" style={{ fontWeight: 'bold', color: riskColors.stroke }}>
                  Safety Badge: {riskColors.label.toUpperCase()}
                </Text>
                <Text variant="labelMd" color={colors['on-surface-variant']}>
                  {currentZone ? `Inside Zone #${currentZone.hotspotId || 'Active'}` : 'Currently in a Safe Area'}
                </Text>
              </View>
            </View>

            {/* Grid Metrics */}
            <View style={styles.grid}>
              {/* GPS Coordinates */}
              <View style={styles.metricCard}>
                <Ionicons name="compass-outline" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelMd" color={colors['on-surface-variant']}>Current GPS</Text>
                  <Text variant="labelLg" style={{ fontWeight: 'bold' }}>{lat}, {lng}</Text>
                </View>
              </View>

              {/* Tracking Status */}
              <View style={styles.metricCard}>
                <Ionicons 
                  name={trackingActive ? "radio-outline" : "pause-circle-outline"} 
                  size={20} 
                  color={trackingActive ? "green" : colors.error} 
                />
                <View style={{ flex: 1 }}>
                  <Text variant="labelMd" color={colors['on-surface-variant']}>Tracking Status</Text>
                  <Text variant="labelLg" style={{ fontWeight: 'bold', color: trackingActive ? "green" : colors.error }}>
                    {trackingActive ? "ACTIVE (Live GPS)" : "PAUSED"}
                  </Text>
                </View>
              </View>

              {/* Location Accuracy */}
              <View style={styles.metricCard}>
                <Ionicons name="locate-outline" size={20} color={colors.tertiary} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelMd" color={colors['on-surface-variant']}>Location Accuracy</Text>
                  <Text variant="labelLg" style={{ fontWeight: 'bold' }}>{accuracyText}</Text>
                </View>
              </View>

              {/* GPS Hardware Status */}
              <View style={styles.metricCard}>
                <Ionicons 
                  name={permissionStatus === 'granted' ? "checkmark-circle-outline" : "alert-circle-outline"} 
                  size={20} 
                  color={permissionStatus === 'granted' ? "green" : colors.error} 
                />
                <View style={{ flex: 1 }}>
                  <Text variant="labelMd" color={colors['on-surface-variant']}>GPS Sensor</Text>
                  <Text variant="labelLg" style={{ fontWeight: 'bold' }}>
                    {permissionStatus === 'granted' ? "Connected" : "Requires Fix"}
                  </Text>
                </View>
              </View>

              {/* Last Update Time */}
              <View style={styles.metricCard}>
                <Ionicons name="time-outline" size={20} color={colors['on-surface-variant']} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelMd" color={colors['on-surface-variant']}>Last Update</Text>
                  <Text variant="labelLg" style={{ fontWeight: 'bold' }}>{updateTimeText}</Text>
                </View>
              </View>

              {/* Offline Sync Queue */}
              <View style={styles.metricCard}>
                <Ionicons name="cloud-upload-outline" size={20} color={colors.secondary} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelMd" color={colors['on-surface-variant']}>Offline Sync Queue</Text>
                  <Text variant="labelLg" style={{ fontWeight: 'bold' }}>
                    {offlineQueueSize === 0 ? "Synced (0 queued)" : `${offlineQueueSize} updates queued`}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer Action */}
          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text variant="labelLg" color={colors['on-primary']} style={{ fontWeight: 'bold' }}>
              Close Diagnostics
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(33, 26, 22, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: spacing.lg,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors['surface-container-high'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: spacing.md,
    borderRadius: shapes.roundedMd,
    borderWidth: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  grid: {
    gap: spacing.sm,
  },
  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors['surface-container-low'],
    borderRadius: shapes.roundedMd,
    borderWidth: 1,
    borderColor: 'rgba(217, 194, 183, 0.2)',
  },
  doneBtn: {
    backgroundColor: colors.primary,
    borderRadius: shapes.roundedPill,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
});
