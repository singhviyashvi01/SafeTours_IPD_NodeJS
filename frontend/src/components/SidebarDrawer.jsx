import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors, shapes, spacing } from '../theme/theme';
import { navigationRef } from '../navigation/navigationRef';

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.82, 320);

const MENU_ITEMS = [
  { label: 'Home', icon: 'home-outline', route: 'Home' },
  { label: 'Map', icon: 'map-outline', route: 'Map' },
  { label: 'SOS', icon: 'warning-outline', route: 'SOS', isEmergency: true },
  { label: 'AI Assistant', icon: 'sparkles-outline', route: 'Assistant' },
  { label: 'Community Feed', icon: 'chatbubbles-outline', route: 'Map', opensCommunity: true },
  { label: 'Settings', icon: 'settings-outline', route: 'Settings' },
];

/**
 * Global navigation drawer component accessible from all screens.
 */
export const SidebarDrawer = ({ visible, onClose, navigation: propNavigation, activeRoute: propActiveRoute }) => {
  const [mounted, setMounted] = useState(visible);
  const slideX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  let currentRouteName = 'Home';
  if (navigationRef.isReady()) {
    const route = navigationRef.getCurrentRoute();
    if (route && route.name) {
      currentRouteName = route.name;
    }
  }

  const activeRoute = propActiveRoute || currentRouteName;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(slideX, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(slideX, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, slideX, backdropOpacity]);

  const navigateToItem = item => {
    onClose();
    const params = item.opensCommunity ? { communityRequestId: Date.now() } : undefined;
    if (propNavigation) {
      propNavigation.navigate(item.route, params);
    } else if (navigationRef.isReady()) {
      navigationRef.navigate(item.route, params);
    }
  };

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideX }] }]}>
          <View style={styles.drawerHeader}>
            {/* This mirrors Home's hamburger so tapping it again closes the drawer. */}
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close menu">
              <Ionicons name="menu" size={28} color={colors.primary} />
            </Pressable>
            <View style={styles.brandRow}>
              <Ionicons name="shield-checkmark" size={26} color={colors.primary} />
              <Text variant="headlineSm" style={styles.brand}>SafeTours</Text>
            </View>
          </View>

          <View style={styles.menuList}>
            {MENU_ITEMS.map(item => {
              const selected = activeRoute === item.route && !item.opensCommunity;
              const iconColor = item.isEmergency ? colors.error : selected ? colors.primary : colors['on-surface-variant'];
              return (
                <Pressable
                  key={item.label}
                  onPress={() => navigateToItem(item)}
                  style={[styles.menuItem, selected && styles.menuItemSelected]}
                >
                  <Ionicons name={item.icon} size={22} color={iconColor} />
                  <Text variant="bodyLg" style={[styles.menuText, selected && styles.menuTextSelected, item.isEmergency && { color: colors.error }]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(33, 26, 22, 0.48)' },
  drawer: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: DRAWER_WIDTH,
    backgroundColor: colors.surface, paddingTop: 56,
    borderTopRightRadius: shapes.roundedXl, borderBottomRightRadius: shapes.roundedXl,
    shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 16,
  },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brand: { color: colors.primary, fontWeight: 'bold' },
  menuList: { paddingHorizontal: spacing.md, gap: spacing.xs },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md, borderRadius: shapes.roundedMd },
  menuItemSelected: { backgroundColor: colors['primary-container'] },
  menuText: { color: colors['on-surface'], fontWeight: '500' },
  menuTextSelected: { color: colors.primary, fontWeight: '700' },
});
