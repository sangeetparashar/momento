import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { TradePanel, TradeScreenSkeleton } from '@/components/features';
import { useTokenDetail } from '@/hooks';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

/** Format a USD price compactly for the header subtitle. */
function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(2)}`;
}

/**
 * Full-screen TRADE route (`/token/[mint]/trade?side=buy|sell`).
 *
 * Loads the token detail for header context (symbol + live price) and hands off
 * to TradePanel, which owns the buy/sell form, quote, client-sign → /submit
 * flow, and the status overlay. `side` query param sets the initial tab.
 */
export default function TradeScreen() {
  const { mint, side } = useLocalSearchParams<{ mint: string; side?: string }>();
  const router = useRouter();
  const { data: token, isLoading, isError } = useTokenDetail(mint);

  const initialSide: 'buy' | 'sell' = side === 'sell' ? 'sell' : 'buy';
  const handleBack = useCallback(() => router.back(), [router]);

  const notTradeable =
    !!token && token.status !== 'ACTIVE' && !token.graduatedAt;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text variant="h3" style={styles.headerTitle}>
            {token ? `$${token.symbol}` : 'TRADE'}
          </Text>
          {token && (
            <Text variant="caption" style={styles.headerSub}>
              {fmtPrice(token.priceUsd)}
            </Text>
          )}
        </View>
        <View style={styles.backBtn} />
      </View>

      {isLoading && !token ? (
        <TradeScreenSkeleton />
      ) : isError || !token ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.textTertiary} />
          <Text variant="body" style={styles.emptyText}>
            TOKEN NOT FOUND
          </Text>
        </View>
      ) : notTradeable ? (
        <View style={styles.emptyState}>
          <Ionicons name="lock-closed-outline" size={48} color={COLORS.textTertiary} />
          <Text variant="body" style={styles.emptyText}>
            NOT TRADEABLE
          </Text>
          <Text variant="caption" style={styles.emptySub}>
            This token is not currently available for trading.
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TradePanel mint={mint as string} initialSide={initialSide} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: COLORS.textPrimary,
  },
  headerSub: {
    color: COLORS.primary,
    marginTop: 1,
    fontFamily: 'monospace',
    textTransform: 'none',
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    color: COLORS.textTertiary,
    letterSpacing: 1,
  },
  emptySub: {
    color: COLORS.textTertiary,
    textAlign: 'center',
    textTransform: 'none',
  },
});
