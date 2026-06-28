import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Text, Button, FormField } from '@/components/primitives';
import { AllocationSliders } from '@/components/features/launch/AllocationSliders';
import { useLaunchWizard } from '@/hooks/useLaunchWizard';
import { COLORS, SPACING } from '@/styles/theme';

/**
 * Step 3 — fundraise target (USD migration market cap) + optional starting
 * market cap + post-graduation LP allocation (must total 100%).
 */
export default function LaunchFundraiseScreen() {
  const router = useRouter();
  const { draft, patch, validateStep } = useLaunchWizard();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleNext = useCallback(() => {
    const e = validateStep('fundraise');
    setErrors(e);
    if (Object.keys(e).length === 0) router.push('/launch/vesting');
  }, [validateStep, router]);

  const onlyNumeric = (t: string) => t.replace(/[^0-9.]/g, '');

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
          SET YOUR GRADUATION TARGET. WHEN THE CURVE RAISES THIS MUCH, YOUR
          TOKEN MIGRATES TO A FULL LIQUIDITY POOL.
        </Text>

        <FormField
          label="GRADUATION TARGET"
          value={draft.targetUsd}
          onChangeText={(t) => patch({ targetUsd: onlyNumeric(t) })}
          placeholder="25000"
          keyboardType="decimal-pad"
          affix="USD"
          error={errors.targetUsd}
        />

        <FormField
          label="STARTING MARKET CAP (OPTIONAL)"
          value={draft.initialMarketCapUsd}
          onChangeText={(t) => patch({ initialMarketCapUsd: onlyNumeric(t) })}
          placeholder="100"
          keyboardType="decimal-pad"
          affix="USD"
          error={errors.initialMarketCapUsd}
        />

        <View style={styles.divider} />

        <Text variant="label" style={styles.sectionLabel}>
          LP ALLOCATION AFTER GRADUATION
        </Text>
        <Text variant="caption" style={styles.sectionHint}>
          How the post-graduation liquidity is distributed. Must total 100%.
        </Text>

        <AllocationSliders
          value={{
            partnerLockedLpPct: draft.partnerLockedLpPct,
            partnerLpPct: draft.partnerLpPct,
            creatorLockedLpPct: draft.creatorLockedLpPct,
            creatorLpPct: draft.creatorLpPct,
          }}
          onChange={(v) => patch(v)}
        />
        {errors.lp ? (
          <Text variant="caption" style={styles.error}>
            {errors.lp}
          </Text>
        ) : null}
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.lg,
  },
  sectionLabel: {
    color: COLORS.textPrimary,
    letterSpacing: 2,
    marginBottom: SPACING.xs,
  },
  sectionHint: {
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  error: {
    color: COLORS.error,
    marginTop: SPACING.sm,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
});
