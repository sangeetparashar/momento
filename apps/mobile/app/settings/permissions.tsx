import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

interface PermissionRow {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: 'granted' | 'denied' | 'undetermined' | 'loading';
}

export default function PermissionsScreen() {
  const router = useRouter();
  const [permissions, setPermissions] = useState<PermissionRow[]>([
    { label: 'Location', icon: 'location-outline', status: 'loading' },
    { label: 'Camera / Photos', icon: 'camera-outline', status: 'loading' },
  ]);

  useEffect(() => {
    (async () => {
      const locationStatus = await Location.getForegroundPermissionsAsync();
      const mediaStatus = await ImagePicker.getMediaLibraryPermissionsAsync();

      setPermissions([
        {
          label: 'Location',
          icon: 'location-outline',
          status: locationStatus.status as PermissionRow['status'],
        },
        {
          label: 'Camera / Photos',
          icon: 'camera-outline',
          status: mediaStatus.status as PermissionRow['status'],
        },
      ]);
    })();
  }, []);

  const openSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Device Permissions</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        {permissions.map((perm) => (
          <View key={perm.label} style={styles.permRow}>
            <Ionicons name={perm.icon} size={22} color={COLORS.textSecondary} />
            <View style={styles.permInfo}>
              <Text style={styles.permLabel}>{perm.label}</Text>
              <Text
                style={[
                  styles.permStatus,
                  {
                    color:
                      perm.status === 'granted'
                        ? COLORS.success
                        : perm.status === 'denied'
                          ? COLORS.error
                          : COLORS.textTertiary,
                  },
                ]}
              >
                {perm.status === 'loading'
                  ? 'Checking...'
                  : perm.status.charAt(0).toUpperCase() + perm.status.slice(1)}
              </Text>
            </View>
          </View>
        ))}

        <Pressable style={styles.settingsButton} onPress={openSettings}>
          <Ionicons name="settings-outline" size={20} color={COLORS.primary} />
          <Text style={styles.settingsButtonText}>Open Device Settings</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 18,
  },
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  permInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  permLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  permStatus: {
    ...TYPOGRAPHY.bodySmall,
    marginTop: 2,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: SPACING.sm,
  },
  settingsButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
