import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, Button } from '@/components/primitives';
import { PercentSlider, FeeDisclosure } from '@/components/composites';
import { useLaunchWizard } from '@/hooks/useLaunchWizard';
import { COLORS, SPACING } from '@/styles/theme';

/**
 * Step 2 — Token-2022 transfer-fee rate + DBC trading-fee split.
 *
 * The transfer fee is edited in whole percent (3–5%) and stored as bps. The
 * creator / partner trading-fee split is two steppers kept summing to 100% —
 * moving one moves the other so the launchTokenSchema invariant
 * (creatorBps + partnerBps === 10000) always holds.
 */
export default function LaunchFeesScreen() {
  const router = useRouter();
  const { draft, patch, validateStep } = useLaunchWizard();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const transferFeePct = Math.round(draft.transferFeeBps / 100);
  const creatorPct = Math.round(draft.creatorBps / 100);

  const setTransferFeePct = (pct: number) => patch({ transferFeeBps: pct * 100 });
  const setCreatorPct = (pct: number) =>
    patch({ creatorBps: pct * 100, partnerBps: (100 - pct) * 100 });

  const handleNext = useCallback(() => {
    const e = validateStep('fees');
    setErrors(e);
    if (Object.keys(e).length === 0) router.push('/launch/fundraise');
  }, [validateStep, router]);

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="label" style={styles.intro}>
          SET THE ON-CHAIN TRANSFER FEE AND HOW TRADING FEES SPLIT BETWEEN YOU
          AND MOMENTO.
        </Text>

        <Text variant="label" style={styles.sectionLabel}>
          TRANSFER FEE
        </Text>
        <PercentSlider
          label="FEE RATE"
          value={transferFeePct}
          min={3}
          max={5}
          step={1}
          onChange={setTransferFeePct}
        />
        {errors.transferFeeBps ? (
          <Text variant="caption" style={styles.error}>
            {errors.transferFeeBps}
          </Text>
        ) : null}

        <View style={styles.divider} />

        <Text variant="label" style={styles.sectionLabel}>
          TRADING FEE SPLIT
        </Text>
        <PercentSlider
          label="CREATOR (YOU)"
          value={creatorPct}
          min={0}
          max={100}
          step={5}
          onChange={setCreatorPct}
        />
        <PercentSlider
          label="MOMENTO"
          value={100 - creatorPct}
          min={0}
          max={100}
          step={5}
          valueColor={COLORS.textSecondary}
          onChange={(v) => setCreatorPct(100 - v)}
        />
        {errors.feeSplit ? (
          <Text variant="caption" style={styles.error}>
            {errors.feeSplit}
          </Text>
        ) : null}

        <FeeDisclosure
          variant="launch"
          display="card"
          transferFeeBps={draft.transferFeeBps}
          style={styles.disclosure}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button label="NEXT" fullWidth onPress={handleNext} />
      </View>
    </View>
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
  sectionLabel: {
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
    letterSpacing: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.lg,
  },
  error: {
    color: COLORS.error,
    marginTop: SPACING.xs,
  },
  disclosure: {
    marginTop: SPACING.xl,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
});
