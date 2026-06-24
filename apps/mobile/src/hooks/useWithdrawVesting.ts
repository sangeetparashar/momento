import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { withdrawVesting } from '@/services/tokenApi';
import { useClientSignSubmit, SignStatus } from './useClientSignSubmit';

interface UseWithdrawVesting {
  /** Build the withdraw tx, sign-and-send it, invalidate vesting list. */
  withdraw: (
    vestingId: string,
  ) => Promise<{ signature: string; deduped: boolean } | null>;
  status: SignStatus;
  error: string | null;
  reset: () => void;
}

/**
 * Withdraw claimable vested tokens. §d.9 returns ONLY an unsigned transaction —
 * there is NO submit endpoint — so this uses `signAndSend` (provider broadcasts,
 * exactly like useSwap). Invalidates the vesting list on success.
 */
export function useWithdrawVesting(): UseWithdrawVesting {
  const queryClient = useQueryClient();
  const signer = useClientSignSubmit();

  const withdraw = useCallback(
    async (vestingId: string) => {
      let transaction: string;
      try {
        ({ transaction } = await withdrawVesting(vestingId));
      } catch (err: any) {
        // §d.9 returns 400 "Nothing to withdraw" when claimable went to 0 (stale
        // list row) and 403 when the caller isn't the recipient. Refresh the list
        // so the UI reconciles, then re-throw — the sheet catches it and maps the
        // message to a friendly, terminal (non-alarming) state.
        queryClient.invalidateQueries({ queryKey: ['vesting'] });
        throw err instanceof Error ? err : new Error(err?.message ?? 'Withdraw failed');
      }

      const result = await signer.run({
        transaction,
        mode: 'signAndSend',
        // No submit endpoint: pass the on-chain signature straight through.
        submit: async (signature) => ({ signature, status: null }),
      });

      if (result) {
        queryClient.invalidateQueries({ queryKey: ['vesting'] });
      }
      return result;
    },
    [signer, queryClient],
  );

  return {
    withdraw,
    status: signer.status,
    error: signer.error,
    reset: signer.reset,
  };
}
