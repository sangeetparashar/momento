import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { submitTrade } from '@/services/tokenApi';
import type { TradeBuildResponse } from '@/services/tokenApi.types';
import { useClientSignSubmit, SignStatus } from './useClientSignSubmit';

interface UseSubmitTrade {
  /** Sign-only the held build tx, POST /submit, invalidate token queries. */
  submit: (
    build: TradeBuildResponse,
  ) => Promise<{ signature: string; deduped: boolean; status: string | null } | null>;
  status: SignStatus;
  error: string | null;
  /** Chain-confirmation status from /submit ('CONFIRMED' | 'PENDING' | null). */
  submitStatus: string | null;
  reset: () => void;
}

/**
 * Submits a built trade via the shared client-sign primitive in `signOnly` mode
 * (§d.4 requires a client-signed base64 tx relayed to /submit). On success,
 * invalidates the token detail / trades / fees queries so the screen refreshes.
 */
export function useSubmitTrade(
  mint: string,
  side: 'buy' | 'sell',
): UseSubmitTrade {
  const queryClient = useQueryClient();
  const signer = useClientSignSubmit();

  const submit = useCallback(
    async (build: TradeBuildResponse) => {
      const result = await signer.run({
        transaction: build.transaction,
        mode: 'signOnly',
        submit: async (signedBase64) => {
          const res = await submitTrade(mint, side, {
            intentId: build.intentId,
            transaction: signedBase64,
            idempotencyKey: build.idempotencyKey,
          });
          return {
            signature: res.signature,
            status: res.status,
            deduped: res.deduped,
          };
        },
      });

      if (result) {
        queryClient.invalidateQueries({ queryKey: ['tokenDetail', mint] });
        queryClient.invalidateQueries({ queryKey: ['tokenTrades', mint] });
        queryClient.invalidateQueries({ queryKey: ['tokenFees', mint] });
      }
      return result;
    },
    [signer, queryClient, mint, side],
  );

  return {
    submit,
    status: signer.status,
    error: signer.error,
    submitStatus: signer.submitStatus,
    reset: signer.reset,
  };
}
