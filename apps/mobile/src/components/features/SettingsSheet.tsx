import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, Modal, Pressable, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

interface SettingsMenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  destructive?: boolean;
}

const MENU_ITEMS: SettingsMenuItem[] = [
  { icon: 'heart-outline', label: 'Favorites', route: 'favorites' },
  { icon: 'lock-closed-outline', label: 'Account Privacy', route: 'privacy' },
  {
    icon: 'phone-portrait-outline',
    label: 'Device Permissions',
    route: 'permissions',
  },
  { icon: 'shield-outline', label: 'Vault', route: 'vault' },
  {
    icon: 'trash-outline',
    label: 'Delete Account',
    route: 'delete-account',
    destructive: true,
  },
];

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  onNavigate?: (route: string) => void;
}

export function SettingsSheet({
  visible,
  onClose,
  onNavigate,
}: SettingsSheetProps) {
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdropOpacity, slideAnim]);

  const handleItemPress = useCallback(
    (route: string) => {
      onNavigate?.(route);
    },
    [onNavigate]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Menu Items */}
          {MENU_ITEMS.map((item, index) => {
            const isLast = index === MENU_ITEMS.length - 1;
            const textColor = item.destructive
              ? COLORS.error
              : COLORS.textPrimary;
            const iconColor = item.destructive
              ? COLORS.error
              : COLORS.textSecondary;

            return (
              <Pressable
                key={item.route}
                onPress={() => handleItemPress(item.route)}
                style={({ pressed }) => [
                  styles.menuItem,
                  !isLast && styles.menuItemBorder,
                  pressed && styles.menuItemPressed,
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={iconColor}
                  style={styles.menuItemIcon}
                />
                <Text
                  style={[
                    styles.menuItemLabel,
                    { color: textColor },
                  ]}
                >
                  {item.label}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.textTertiary}
                />
              </Pressable>
            );
          })}

          {/* Bottom safe area padding */}
          <View style={styles.bottomSpacer} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    paddingHorizontal: SPACING.lg,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  menuItemPressed: {
    opacity: 0.6,
  },
  menuItemIcon: {
    marginRight: SPACING.md,
  },
  menuItemLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    letterSpacing: 0.5,
    flex: 1,
  },
  bottomSpacer: {
    height: SPACING.xxl,
  },
});
