import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Share } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Card } from '@/components/primitives';
import { useLaunchWizard } from '@/hooks/useLaunchWizard';
import { showSuccessToast } from '@/utils/toast';
import { COLORS, SPACING, RADII } from '@/styles/theme';

/**
 * Step 6 — terminal success screen. Confirms the landed mint + signatures,
 * offers copy/share, and (if the creator opted into vesting) hands off to the
 * vesting-create flow with prefilled params. The wizard is reset on exit so a
 * subsequent launch starts clean.
 */
export default function LaunchResultScreen() {
  const router = useRouter();
  const { reset } = useLaunchWizard();
  const params = useLocalSearchParams<{
    mint?: string;
    tokenId?: string;
    symbol?: string;
    status?: string;
    poolSignature?: string;
    vest?: string;
    vestAmount?: string;
    vestDuration?: string;
    vestCliff?: string;
  }>();

  const mint = params.mint ?? '';
  const symbol = params.symbol ?? 'TOKEN';
  const deploying = params.status === 'DEPLOYING';
  const wantsVesting = params.vest === '1';

  const shortMint = mint ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : '—';

  const copyMint = useCallback(async () => {
    if (!mint) return;
    await Clipboard.setStringAsync(mint);
    showSuccessToast('Mint address copied');
  }, [mint]);

  const share = useCallback(async () => {
    try {
      await Share.share({
        message: `I just launched $${symbol} on Momento. Mint: ${mint}`,
      });
    } catch {
      // user dismissed share sheet — no-op
    }
  }, [symbol, mint]);

  const goToToken = useCallback(() => {
    reset();
    router.replace(`/token/${mint}`);
  }, [reset, router, mint]);

  const setUpVesting = useCallback(() => {
    reset();
    router.replace({
      pathname: '/vesting/create',
      params: {
        mint,
        tokenId: params.tokenId,
        symbol,
        amountWhole: params.vestAmount,
        durationDays: params.vestDuration,
        cliffDays: params.vestCliff,
      },
    });
  }, [reset, router, mint, params, symbol]);

  const done = useCallback(() => {
    reset();
    router.replace('/(tabs)/profile');
  }, [reset, router]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={deploying ? 'time-outline' : 'checkmark-circle'}
            size={56}
            color={COLORS.primary}
          />
        </View>
        <Text variant="h2" style={styles.title}>
          {deploying ? 'LAUNCHING' : `$${symbol} IS LIVE`}
        </Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          {deploying
            ? 'Your token is deploying on-chain. It will be tradeable shortly.'
            : 'Your token is deployed and open to trading.'}
        </Text>
      </View>

      <Card style={styles.card}>
        <Text variant="label" style={styles.cardLabel}>
          MINT ADDRESS
        </Text>
        <Pressable onPress={copyMint} style={styles.mintRow} accessibilityRole="button" accessibilityLabel="Copy mint address">
          <Text variant="mono" style={styles.mintValue} numberOfLines={1}>
            {shortMint}
          </Text>
          <Ionicons name="copy-outline" size={18} color={COLORS.primary} />
        </Pressable>
      </Card>

      {wantsVesting ? (
        <Card style={styles.card}>
          <View style={styles.vestHeader}>
            <Ionicons name="time-outline" size={18} color={COLORS.primary} />
            <Text variant="label" style={styles.cardLabel}>
              VESTING READY
            </Text>
          </View>
          <Text variant="caption" style={styles.vestHint}>
            Finish setting up the {params.vestDuration}-day schedule you
            configured. You'll sign this one yourself.
          </Text>
          <Button label="SET UP VESTING" variant="secondary" fullWidth onPress={setUpVesting} style={styles.vestBtn} />
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={deploying ? 'DEPLOYING…' : `VIEW $${symbol}`}
          fullWidth
          disabled={deploying}
          onPress={goToToken}
        />
        <Pressable onPress={share} style={styles.shareBtn} accessibilityRole="button" accessibilityLabel="Share token">
          <Ionicons name="share-outline" size={18} color={COLORS.textPrimary} />
          <Text variant="label" style={styles.shareText}>
            SHARE
          </Text>
        </Pressable>
        <Pressable onPress={done} style={styles.doneBtn} accessibilityRole="button">
          <Text variant="label" style={styles.doneText}>
            DONE
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  hero: {
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.xl,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: RADII.full,
    backgroundColor: COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    padding: SPACING.lg,
  },
  cardLabel: {
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },
  mintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  mintValue: {
    color: COLORS.textPrimary,
    flex: 1,
  },
  vestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  vestHint: {
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: SPACING.sm,
  },
  vestBtn: {
    marginTop: SPACING.md,
  },
  actions: {
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  shareText: {
    color: COLORS.textPrimary,
  },
  doneBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  doneText: {
    color: COLORS.textTertiary,
  },
});
