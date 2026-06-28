import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { LaunchTokenRequest } from '@/services/tokenApi.types';
import { MOMENTO_FEE } from '@momento/shared';

/**
 * Local launch-wizard state. NOT exported from the hooks barrel — it is scoped
 * to the `/launch` Stack via {@link LaunchWizardProvider} (CONTRACTS-P3B §a.6).
 *
 * The draft mirrors `launchTokenSchema` (apps/api/lib/validation.ts) split into
 * the four editable slices the wizard collects (basics / fees / fundraise /
 * vesting). `buildLaunchPayload` maps it back to the wire `LaunchTokenRequest`.
 * Launch is SERVER-SIGNED — the vesting slice is form-only and is NOT sent to
 * `/tokens/launch`; it is handed off to `/vesting/create` from the result step.
 */

export type LaunchStep = 'basics' | 'fees' | 'fundraise' | 'vesting' | 'review';

export const LAUNCH_STEPS: LaunchStep[] = [
  'basics',
  'fees',
  'fundraise',
  'vesting',
  'review',
];

/** Form-only vesting intent (not part of the launch payload). */
export interface VestingDraft {
  /** Whether the creator wants to set up vesting after launch. */
  enabled: boolean;
  /** Whole tokens to vest/lock (converted to base units at hand-off time). */
  amountWhole: string;
  /** Vesting duration in days from launch. */
  durationDays: string;
  /** Cliff in days from launch (<= duration). */
  cliffDays: string;
}

export interface LaunchDraft {
  // ── basics ──
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;
  totalSupply: string; // whole tokens
  decimals: number; // 6..9

  // ── fees (Token-2022 transfer fee + DBC trading-fee split) ──
  transferFeeBps: number; // 300..500
  creatorBps: number; // creator share of trading fee (sums with partnerBps to 10000)
  partnerBps: number;

  // ── fundraise / LP ──
  targetUsd: string; // USD (number-as-string for input control)
  initialMarketCapUsd: string;
  partnerLockedLpPct: number;
  partnerLpPct: number;
  creatorLockedLpPct: number;
  creatorLpPct: number;

  // ── vesting (form-only, post-launch hand-off) ──
  vesting: VestingDraft;
}

const DEFAULT_DRAFT: LaunchDraft = {
  name: '',
  symbol: '',
  description: '',
  imageUrl: null,
  totalSupply: '1000000000',
  decimals: 9,

  transferFeeBps: MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS, // 400
  creatorBps: MOMENTO_FEE.DEFAULT_CREATOR_TRADING_FEE_BPS ?? 5000,
  partnerBps: MOMENTO_FEE.DEFAULT_PARTNER_TRADING_FEE_BPS ?? 5000,

  targetUsd: '25000',
  initialMarketCapUsd: '100',
  partnerLockedLpPct: 50,
  partnerLpPct: 0,
  creatorLockedLpPct: 50,
  creatorLpPct: 0,

  vesting: {
    enabled: false,
    amountWhole: '',
    durationDays: '365',
    cliffDays: '0',
  },
};

interface LaunchWizardValue {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  errors: Record<string, string>;
  validateStep: (s: LaunchStep) => Record<string, string>;
  buildLaunchPayload: () => LaunchTokenRequest;
  reset: () => void;
}

const LaunchWizardContext = createContext<LaunchWizardValue | null>(null);

const SYMBOL_RE = /^[A-Z0-9]{1,10}$/;
const POSITIVE_INT_RE = /^[1-9]\d*$/;

function isPositiveNumber(s: string): boolean {
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

export function LaunchWizardProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<LaunchDraft>(DEFAULT_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const patch = useCallback((p: Partial<LaunchDraft>) => {
    setDraft((prev) => ({ ...prev, ...p }));
    // Clear errors for the keys being edited so messages don't linger.
    setErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      for (const k of Object.keys(p)) delete next[k];
      return next;
    });
  }, []);

  const validateStep = useCallback(
    (step: LaunchStep): Record<string, string> => {
      const e: Record<string, string> = {};

      if (step === 'basics') {
        const name = draft.name.trim();
        if (name.length < 1) e.name = 'Name is required';
        else if (name.length > 32) e.name = 'Max 32 characters';

        const sym = draft.symbol.trim().toUpperCase();
        if (sym.length < 1) e.symbol = 'Symbol is required';
        else if (!SYMBOL_RE.test(sym))
          e.symbol = '1–10 letters/numbers, no spaces';

        if (draft.description.length > 2000) e.description = 'Max 2000 characters';

        if (!POSITIVE_INT_RE.test(draft.totalSupply))
          e.totalSupply = 'Whole number, no decimals';
        else if (draft.totalSupply.length > 15) e.totalSupply = 'Supply too large';

        if (draft.decimals < 6 || draft.decimals > 9)
          e.decimals = 'Decimals must be 6–9';
      }

      if (step === 'fees') {
        if (draft.transferFeeBps < 300 || draft.transferFeeBps > 500)
          e.transferFeeBps = 'Transfer fee must be 3%–5%';
        if (draft.creatorBps + draft.partnerBps !== 10000)
          e.feeSplit = 'Creator + partner split must equal 100%';
      }

      if (step === 'fundraise') {
        if (!isPositiveNumber(draft.targetUsd))
          e.targetUsd = 'Enter a target above $0';
        if (draft.initialMarketCapUsd.trim() && !isPositiveNumber(draft.initialMarketCapUsd))
          e.initialMarketCapUsd = 'Must be above $0';
        const lpSum =
          draft.partnerLockedLpPct +
          draft.partnerLpPct +
          draft.creatorLockedLpPct +
          draft.creatorLpPct;
        if (lpSum !== 100) e.lp = `LP allocation must total 100% (currently ${lpSum}%)`;
      }

      if (step === 'vesting' && draft.vesting.enabled) {
        const { amountWhole, durationDays, cliffDays } = draft.vesting;
        if (!POSITIVE_INT_RE.test(amountWhole))
          e.vestingAmount = 'Enter a whole token amount';
        else if (POSITIVE_INT_RE.test(draft.totalSupply) &&
          BigInt(amountWhole) > BigInt(draft.totalSupply))
          e.vestingAmount = 'Cannot vest more than total supply';
        const dur = Number(durationDays);
        if (!Number.isInteger(dur) || dur <= 0)
          e.vestingDuration = 'Duration must be a positive number of days';
        const cliff = Number(cliffDays);
        if (!Number.isInteger(cliff) || cliff < 0)
          e.vestingCliff = 'Cliff must be 0 or more days';
        else if (cliff > dur) e.vestingCliff = 'Cliff cannot exceed duration';
      }

      return e;
    },
    [draft],
  );

  // Recompute the live error map whenever the step's fields change. We expose a
  // merged map but screens call validateStep on Next for authoritative gating.
  const buildLaunchPayload = useCallback((): LaunchTokenRequest => {
    return {
      name: draft.name.trim(),
      symbol: draft.symbol.trim().toUpperCase(),
      description: draft.description.trim() || undefined,
      imageUrl: draft.imageUrl ?? undefined,
      totalSupply: draft.totalSupply,
      decimals: draft.decimals,
      transferFeeBps: draft.transferFeeBps,
      feeSplit: {
        creatorBps: draft.creatorBps,
        partnerBps: draft.partnerBps,
      },
      fundraise: {
        targetUsd: Number(draft.targetUsd),
        initialMarketCapUsd: draft.initialMarketCapUsd.trim()
          ? Number(draft.initialMarketCapUsd)
          : undefined,
        partnerLockedLpPct: draft.partnerLockedLpPct,
        partnerLpPct: draft.partnerLpPct,
        creatorLockedLpPct: draft.creatorLockedLpPct,
        creatorLpPct: draft.creatorLpPct,
      },
    };
  }, [draft]);

  const reset = useCallback(() => {
    setDraft(DEFAULT_DRAFT);
    setErrors({});
  }, []);

  // `validateStep` is PURE (no setState) so it is safe to call during render
  // (e.g. the review screen's validity memo). Screens that want to display
  // errors store the returned map in their own local state on Next.
  const value = useMemo<LaunchWizardValue>(
    () => ({
      draft,
      patch,
      errors,
      validateStep,
      buildLaunchPayload,
      reset,
    }),
    [draft, patch, errors, validateStep, buildLaunchPayload, reset],
  );

  return (
    <LaunchWizardContext.Provider value={value}>
      {children}
    </LaunchWizardContext.Provider>
  );
}

export function useLaunchWizard(): LaunchWizardValue {
  const ctx = useContext(LaunchWizardContext);
  if (!ctx) {
    throw new Error('useLaunchWizard must be used within a LaunchWizardProvider');
  }
  return ctx;
}
