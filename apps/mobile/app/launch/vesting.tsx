import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, FormField } from '@/components/primitives';
import { FeeDisclosure } from '@/components/composites';
import { useLaunchWizard } from '@/hooks/useLaunchWizard';
import { COLORS, SPACING, RADII } from '@/styles/theme';

/**
 * Step 4 — OPTIONAL vesting intent. This is form-only: it is NOT part of the
 * server-signed launch payload. If enabled, the captured schedule is handed off
 * to `/vesting/create` from the result screen once the mint exists.
 */
export default function LaunchVestingScreen() {
  const router = useRouter();
  const { draft, patch, validateStep } = useLaunchWizard();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const v = draft.vesting;
  const setV = (p: Partial<typeof v>) => patch({ vesting: { ...v, ...p } });

  const handleNext = useCallback(() => {
    const e = validateStep('vesting');
    setErrors(e);
    if (Object.keys(e).length === 0) router.push('/launch/review');
  }, [validateStep, router]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="label" style={styles.intro}>
          OPTIONALLY LOCK SOME OF YOUR ALLOCATION ON A VESTING SCHEDULE. YOU CAN
          SET THIS UP RIGHT AFTER LAUNCH — IT IS NOT PART OF THE LAUNCH ITSELF.
        </Text>

        {/* Enable toggle */}
        <Pressable
          onPress={() => setV({ enabled: !v.enabled })}
          style={styles.toggleRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: v.enabled }}
          accessibilityLabel="Set up vesting after launch"
        >
          <View style={[styles.checkbox, v.enabled && styles.checkboxOn]}>
            {v.enabled ? (
              <Ionicons name="checkmark" size={14} color={COLORS.background} />
            ) : null}
          </View>
          <Text variant="body" style={styles.toggleLabel}>
            Set up vesting after launch
          </Text>
        </Pressable>

        {v.enabled ? (
          <View style={styles.form}>
            <FormField
              label="AMOUNT TO VEST"
              value={v.amountWhole}
              onChangeText={(t) => setV({ amountWhole: t.replace(/[^0-9]/g, '') })}
              placeholder="100000000"
              keyboardType="number-pad"
              affix={`$${draft.symbol || 'TOKEN'}`}
              error={errors.vestingAmount}
            />
            <FormField
              label="VESTING DURATION"
              value={v.durationDays}
              onChangeText={(t) => setV({ durationDays: t.replace(/[^0-9]/g, '') })}
              placeholder="365"
              keyboardType="number-pad"
              affix="DAYS"
              error={errors.vestingDuration}
            />
            <FormField
              label="CLIFF"
              value={v.cliffDays}
              onChangeText={(t) => setV({ cliffDays: t.replace(/[^0-9]/g, '') })}
              placeholder="0"
              keyboardType="number-pad"
              affix="DAYS"
              error={errors.vestingCliff}
            />
            <FeeDisclosure variant="vesting" display="inline" style={styles.disclosure} />
          </View>
        ) : (
          <View style={styles.skipNote}>
            <Ionicons name="time-outline" size={18} color={COLORS.textTertiary} />
            <Text variant="caption" style={styles.skipText}>
              No vesting — your full allocation stays liquid. You can add a
              schedule later from the vesting screen.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button label="NEXT" fullWidth onPress={handleNext} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  intro: {
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.xl,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: RADII.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  toggleLabel: {
    color: COLORS.textPrimary,
  },
  form: {
    marginTop: SPACING.xl,
  },
  disclosure: {
    marginTop: SPACING.sm,
  },
  skipNote: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  skipText: {
    flex: 1,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
});
