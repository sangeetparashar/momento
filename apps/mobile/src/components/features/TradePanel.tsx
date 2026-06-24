import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { FeeDisclosure } from '@/components/composites';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import {
  useTokenDetail,
  useTokenTradeQuote,
  useSubmitTrade,
  useWalletBalance,
} from '@/hooks';
import { useAuth } from '@/hooks/useAuth';
import { MOMENTO_TRADE } from '@momento/shared';
import { TOKEN_MINTS } from '@/hooks/useSwap';
import {
  displayToBase,
  baseToDisplay,
  usdcToDisplay,
  bpsToPct,
  USDC_DECIMALS,
} from '@/utils/tokenAmount';
import { FundWalletModal } from './FundWalletModal';
import { TradeStatusSheet } from './TradeStatusSheet';
import type { TradeBuildResponse } from '@/services/tokenApi.types';

export interface TradePanelProps {
  mint: string;
  initialSide: 'buy' | 'sell';
}

/** USDC mint (input for BUY). Matches the backend quote mint. */
const QUOTE_DECIMALS = USDC_DECIMALS;
/** Minimum native SOL kept for fees; surface a funding nudge below this. */
const MIN_NATIVE_FOR_FEES = 0.003;
const QUOTE_DEBOUNCE_MS = 500;

/** Slippage presets (bps). Custom entry widens beyond these. */
const SLIPPAGE_PRESETS_BPS = [10, 50, 100] as const;
/** Warn the user above this tolerance. */
const SLIPPAGE_WARN_BPS = 100;

/**
 * Buy/Sell trade form for a creator token.
 *
 * BUY: you pay USDC (6dp) → receive token. SELL: you pay token → receive USDC.
 * The build endpoint (§d.3) returns the quote AND the unsigned tx + intentId in
 * one call (useTokenTradeQuote). On submit we re-quote if stale, then sign-only
 * via useSubmitTrade (§d.4 client-signed → /submit). Wallet-not-ready /
 * insufficient-balance gate to FundWalletModal. Layout mirrors TokenSwapWidget.
 */
export function TradePanel({ mint, initialSide }: TradePanelProps) {
  const [side, setSide] = useState<'buy' | 'sell'>(initialSide);
  const [amount, setAmount] = useState('');
  const [showFund, setShowFund] = useState(false);
  const [statusVisible, setStatusVisible] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [slippageBps, setSlippageBps] = useState<number>(
    MOMENTO_TRADE.DEFAULT_SLIPPAGE_BPS,
  );
  // Inline hint when the typed amount has more fraction digits than allowed.
  const [decimalsError, setDecimalsError] = useState(false);

  const { walletAddress } = useAuth();
  const { data: token } = useTokenDetail(mint);
  const balanceQuery = useWalletBalance(true);
  const quoter = useTokenTradeQuote(mint, side);
  const submitter = useSubmitTrade(mint, side);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokenDecimals = token?.decimals ?? 9;
  const symbol = token?.symbol ?? '';
  const isBuy = side === 'buy';

  // Input token = what the user pays.
  const inputDecimals = isBuy ? QUOTE_DECIMALS : tokenDecimals;
  const inputSymbol = isBuy ? 'USDC' : symbol;
  const outputSymbol = isBuy ? symbol : 'USDC';
  const outputDecimals = isBuy ? tokenDecimals : QUOTE_DECIMALS;

  // ─── Balances ───
  const walletReady = !!walletAddress;
  const balanceData = balanceQuery.data;
  const nativeBalance = balanceData?.nativeBalance ?? balanceData?.solBalance ?? 0;
  const insufficientFees = balanceData != null && nativeBalance < MIN_NATIVE_FOR_FEES;

  // Available balance of the INPUT token, as a human float.
  const availableInput = useMemo(() => {
    if (!balanceData) return null;
    if (isBuy) {
      // Match the actual USDC mint — never by `decimals===6`, which collides
      // with any other 6-decimal holding.
      const usdc = balanceData.tokens?.find((t) => t.mint === TOKEN_MINTS.USDC);
      return usdc?.amount ?? 0;
    }
    const holding = balanceData.tokens?.find((t) => t.mint === mint);
    return holding?.amount ?? 0;
  }, [balanceData, isBuy, mint]);

  const amountNum = parseFloat(amount) || 0;
  const insufficientBalance =
    availableInput != null && amountNum > 0 && amountNum > availableInput;

  // ─── Quote (build) ───
  const buildResp: TradeBuildResponse | null = quoter.data;
  const isQuoting = quoter.build.isPending;
  const quoteError = quoter.build.error;

  const requestQuote = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setDecimalsError(false);
      return;
    }
    let base: string;
    try {
      base = displayToBase(amount, inputDecimals);
      setDecimalsError(false);
    } catch {
      setDecimalsError(true); // too many decimals — surfaced inline below
      return;
    }
    if (base === '0') return;
    debounceRef.current = setTimeout(() => {
      quoter.getQuote({
        amountInBase: base,
        slippageBps,
        ...(isBuy ? { inputMint: TOKEN_MINTS.USDC } : {}),
      });
    }, QUOTE_DEBOUNCE_MS);
  }, [amount, inputDecimals, quoter, slippageBps, isBuy]);

  // Re-quote on amount / side / slippage change.
  useEffect(() => {
    requestQuote();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, side, slippageBps]);

  // Reset the held quote when side flips so stale output never shows.
  useEffect(() => {
    setAmount('');
    submitter.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  const handleMax = useCallback(() => {
    if (availableInput != null && availableInput > 0) {
      const precision = inputDecimals === 6 ? 2 : 4;
      // Floor (not round) to precision so MAX never exceeds the real balance,
      // which would trip insufficient-balance or a server-side balance error.
      const factor = 10 ** precision;
      const floored = Math.floor(availableInput * factor) / factor;
      setAmount(String(floored));
    }
  }, [availableInput, inputDecimals]);

  // ─── Submit ───
  // `forceRebuild` always fetches a fresh quote/intentId/idempotencyKey — used by
  // RETRY so a failed (e.g. SLIPPAGE / moved-price) attempt isn't re-signed and
  // deduped to the same dead intent.
  const doSubmit = useCallback(
    async (forceRebuild = false) => {
      // Re-quote if stale (or forced) to avoid signing an expired/consumed tx.
      let build = quoter.data;
      if (forceRebuild || !build || quoter.isStale()) {
        let base: string;
        try {
          base = displayToBase(amount, inputDecimals);
          setDecimalsError(false);
        } catch {
          setDecimalsError(true);
          return;
        }
        build = await quoter.getQuote({
          amountInBase: base,
          slippageBps,
          ...(isBuy ? { inputMint: TOKEN_MINTS.USDC } : {}),
        });
      }
      if (!build) return;
      setSignature(null);
      setStatusVisible(true);
      const res = await submitter.submit(build);
      if (res?.signature) setSignature(res.signature);
    },
    [quoter, amount, inputDecimals, submitter, slippageBps, isBuy],
  );

  const handleStatusClose = useCallback(() => {
    setStatusVisible(false);
    if (submitter.status === 'success') {
      setAmount('');
    }
    setSignature(null);
    submitter.reset();
  }, [submitter]);

  const handleRetry = useCallback(() => {
    setSignature(null);
    submitter.reset();
    // Force a fresh build so RETRY never re-signs the consumed/stale intent.
    doSubmit(true);
  }, [submitter, doSubmit]);

  // ─── Derived output / fee display ───
  const quote = buildResp?.quote;
  const expectedOut = quote
    ? baseToDisplay(quote.expectedOutBase, outputDecimals, { maxFracDigits: outputDecimals === 6 ? 2 : 4, group: true })
    : null;
  const minOut = quote
    ? baseToDisplay(quote.minOutBase, outputDecimals, { maxFracDigits: outputDecimals === 6 ? 2 : 4, group: true })
    : null;

  const canSubmit =
    walletReady &&
    !insufficientFees &&
    !insufficientBalance &&
    amountNum > 0 &&
    !!quote &&
    !isQuoting;

  const ctaLabel = !walletReady
    ? 'WALLET NOT READY'
    : amountNum <= 0
      ? 'ENTER AMOUNT'
      : insufficientFees
        ? 'ADD SOL FOR FEES'
        : insufficientBalance
          ? `INSUFFICIENT ${inputSymbol}`
          : isQuoting
            ? 'FETCHING QUOTE…'
            : isBuy
              ? `BUY ${symbol}`
              : `SELL ${symbol}`;

  const ctaGatesFunding = !walletReady || insufficientFees || insufficientBalance;

  const handleCta = useCallback(() => {
    if (ctaGatesFunding) {
      setShowFund(true);
      return;
    }
    doSubmit();
  }, [ctaGatesFunding, doSubmit]);

  return (
    <View style={styles.container}>
      {/* BUY / SELL segmented toggle */}
      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentBtn, isBuy && styles.segmentActiveBuy]}
          onPress={() => setSide('buy')}
          accessibilityRole="button"
          accessibilityState={{ selected: isBuy }}
        >
          <Text variant="label" style={[styles.segmentText, isBuy && styles.segmentTextActiveBuy]}>
            BUY
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentBtn, !isBuy && styles.segmentActiveSell]}
          onPress={() => setSide('sell')}
          accessibilityRole="button"
          accessibilityState={{ selected: !isBuy }}
        >
          <Text variant="label" style={[styles.segmentText, !isBuy && styles.segmentTextActiveSell]}>
            SELL
          </Text>
        </Pressable>
      </View>

      {/* You pay */}
      <View style={styles.card}>
        <View style={styles.cardLabelRow}>
          <Text variant="label" style={styles.cardLabel}>
            YOU PAY
          </Text>
          {availableInput != null && (
            <View style={styles.balanceRow}>
              <Text variant="caption" style={styles.balanceText}>
                BAL {availableInput.toFixed(inputDecimals === 6 ? 2 : 4)} {inputSymbol}
              </Text>
              <Pressable onPress={handleMax} hitSlop={8} style={styles.maxBtn}>
                <Text variant="caption" style={styles.maxText}>
                  MAX
                </Text>
              </Pressable>
            </View>
          )}
        </View>
        <View style={styles.amountRow}>
          <View style={styles.tokenBadge}>
            <Text variant="body" style={styles.tokenBadgeText}>
              {inputSymbol || '—'}
            </Text>
          </View>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={COLORS.textTertiary}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            editable={walletReady}
          />
        </View>
      </View>

      {/* Decimals hint */}
      {decimalsError && (
        <Text variant="caption" style={styles.decimalsHint}>
          Max {inputDecimals} decimals for {inputSymbol}.
        </Text>
      )}

      {/* arrow */}
      <View style={styles.arrowWrap}>
        <View style={styles.arrowCircle}>
          <Ionicons name="arrow-down" size={18} color={COLORS.primary} />
        </View>
      </View>

      {/* You receive */}
      <View style={styles.card}>
        <Text variant="label" style={styles.cardLabel}>
          YOU RECEIVE (EST.)
        </Text>
        <View style={styles.amountRow}>
          <View style={styles.tokenBadge}>
            <Text variant="body" style={styles.tokenBadgeText}>
              {outputSymbol || '—'}
            </Text>
          </View>
          <View style={styles.outputWrap}>
            {isQuoting ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text variant="h3" style={styles.outputText}>
                {expectedOut ?? '0.00'}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Quote details */}
      {quote && (
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text variant="caption" style={styles.detailLabel}>
              MIN. RECEIVED
            </Text>
            <Text variant="caption" style={styles.detailValue}>
              {minOut} {outputSymbol}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text variant="caption" style={styles.detailLabel}>
              EFFECTIVE FEE
            </Text>
            <Text variant="caption" style={styles.detailValue}>
              {bpsToPct(quote.effectiveFeeBps)}
            </Text>
          </View>
          {quote.inAppRebateBase && quote.inAppRebateBase !== '0' && (
            <View style={styles.detailRow}>
              <Text variant="caption" style={styles.detailLabel}>
                IN-APP REBATE (LATER)
              </Text>
              <Text variant="caption" style={[styles.detailValue, { color: COLORS.primary }]}>
                {usdcToDisplay(quote.inAppRebateBase)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Slippage control */}
      <View style={styles.slippageCard}>
        <View style={styles.slippageHeader}>
          <Text variant="caption" style={styles.detailLabel}>
            SLIPPAGE TOLERANCE
          </Text>
          <Text variant="caption" style={styles.detailValue}>
            {bpsToPct(slippageBps)}
          </Text>
        </View>
        <View style={styles.slippageChips}>
          {SLIPPAGE_PRESETS_BPS.map((bps) => {
            const active = slippageBps === bps;
            return (
              <Pressable
                key={bps}
                style={[styles.slippageChip, active && styles.slippageChipActive]}
                onPress={() => setSlippageBps(bps)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  variant="caption"
                  style={[styles.slippageChipText, active && styles.slippageChipTextActive]}
                >
                  {bpsToPct(bps)}
                </Text>
              </Pressable>
            );
          })}
          <TextInput
            style={styles.slippageInput}
            placeholder="CUSTOM %"
            placeholderTextColor={COLORS.textTertiary}
            keyboardType="decimal-pad"
            value={SLIPPAGE_PRESETS_BPS.includes(slippageBps as any) ? '' : String(slippageBps / 100)}
            onChangeText={(t) => {
              const pct = parseFloat(t.replace(/[^0-9.]/g, ''));
              if (!Number.isFinite(pct) || pct <= 0) return;
              const bps = Math.min(
                MOMENTO_TRADE.MAX_SLIPPAGE_BPS,
                Math.round(pct * 100),
              );
              setSlippageBps(bps);
            }}
          />
        </View>
        {slippageBps > SLIPPAGE_WARN_BPS && (
          <Text variant="caption" style={styles.slippageWarn}>
            High slippage — you may receive significantly less than expected.
          </Text>
        )}
      </View>

      {/* Quote error */}
      {quoteError && !isQuoting && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={COLORS.error} />
          <Text variant="caption" style={styles.errorBannerText}>
            {quoteError.message || 'Could not fetch a quote. Try a different amount.'}
          </Text>
        </View>
      )}

      {/* Fee / tax disclosure (inline, single source of copy) */}
      <FeeDisclosure
        variant="trade"
        display="expandable"
        transferFeeBps={token?.transferFeeBps}
        effectiveInAppBps={quote?.effectiveFeeBps}
        inAppRebateBase={quote?.inAppRebateBase}
        rebateMint={quote?.rebateMint}
        symbol={symbol}
        style={styles.fee}
      />

      {/* CTA */}
      <Pressable
        style={[
          styles.cta,
          isBuy ? styles.ctaBuy : styles.ctaSell,
          !canSubmit && !ctaGatesFunding && styles.ctaDisabled,
        ]}
        onPress={handleCta}
        disabled={!canSubmit && !ctaGatesFunding}
      >
        <Text variant="body" style={[styles.ctaText, isBuy ? styles.ctaTextBuy : styles.ctaTextSell]}>
          {ctaLabel}
        </Text>
      </Pressable>

      <View style={styles.secureRow}>
        <Ionicons name="shield-checkmark" size={13} color={COLORS.textTertiary} />
        <Text variant="caption" style={styles.secureText}>
          Signed locally with your embedded wallet. Momento never holds your keys.
        </Text>
      </View>

      <FundWalletModal visible={showFund} onClose={() => setShowFund(false)} />

      <TradeStatusSheet
        visible={statusVisible}
        status={submitter.status}
        error={submitter.error}
        signature={signature}
        symbol={symbol}
        submitStatus={submitter.submitStatus}
        onRetry={handleRetry}
        onClose={handleStatusClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: SPACING.sm,
  },
  // segmented toggle
  segment: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
    marginBottom: SPACING.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: RADII.full,
  },
  segmentActiveBuy: {
    backgroundColor: COLORS.primaryMuted,
  },
  segmentActiveSell: {
    backgroundColor: 'rgba(255,68,68,0.15)',
  },
  segmentText: {
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },
  segmentTextActiveBuy: {
    color: COLORS.primary,
  },
  segmentTextActiveSell: {
    color: COLORS.error,
  },
  // amount cards
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  cardLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  cardLabel: {
    color: COLORS.textSecondary,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  balanceText: {
    color: COLORS.textTertiary,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  maxBtn: {
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADII.sm,
  },
  maxText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 10,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tokenBadge: {
    backgroundColor: COLORS.backgroundTertiary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.full,
  },
  tokenBadgeText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  amountInput: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: SPACING.md,
    padding: 0,
  },
  outputWrap: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: SPACING.md,
  },
  outputText: {
    color: COLORS.textPrimary,
  },
  arrowWrap: {
    alignItems: 'center',
    marginVertical: -SPACING.sm,
    zIndex: 1,
  },
  arrowCircle: {
    width: 34,
    height: 34,
    borderRadius: RADII.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // quote details
  detailsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  detailValue: {
    color: COLORS.textPrimary,
    fontWeight: '500',
    textTransform: 'none',
  },
  decimalsHint: {
    color: COLORS.error,
    textTransform: 'none',
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  // slippage
  slippageCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  slippageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slippageChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  slippageChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  slippageChipActive: {
    backgroundColor: COLORS.primaryMuted,
    borderColor: COLORS.primary,
  },
  slippageChipText: {
    color: COLORS.textSecondary,
  },
  slippageChipTextActive: {
    color: COLORS.primary,
  },
  slippageInput: {
    flex: 1,
    color: COLORS.textPrimary,
    textAlign: 'right',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    fontSize: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.full,
  },
  slippageWarn: {
    color: COLORS.warning,
    textTransform: 'none',
  },
  // errors
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: 'rgba(255,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.2)',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginTop: SPACING.xs,
  },
  errorBannerText: {
    flex: 1,
    color: COLORS.error,
    textTransform: 'none',
    lineHeight: 16,
  },
  fee: {
    marginTop: SPACING.sm,
  },
  // cta
  cta: {
    borderRadius: RADII.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  ctaBuy: {
    backgroundColor: COLORS.primary,
  },
  ctaSell: {
    backgroundColor: COLORS.textPrimary,
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontWeight: '700',
    letterSpacing: 1.5,
    fontSize: 15,
  },
  ctaTextBuy: {
    color: COLORS.textInverse,
  },
  ctaTextSell: {
    color: COLORS.textInverse,
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  secureText: {
    flex: 1,
    color: COLORS.textTertiary,
    fontSize: 11,
    lineHeight: 16,
    textTransform: 'none',
  },
});
