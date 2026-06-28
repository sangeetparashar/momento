/**
 * Shared client-sign primitive for all Phase 3B signing flows.
 *
 * Two modes (the load-bearing reconciliation — see SPEC-P3B §1):
 *  - `signOnly`  : provider.signTransaction → re-serialize to base64 → caller's
 *                  `submit(signedBase64)` POSTs the matching /submit endpoint.
 *                  Used by TRADES (§d.4 expects a client-signed base64 tx).
 *  - `signAndSend`: provider.signAndSendTransaction broadcasts on-chain; the
 *                  caller's `submit(signature)` is usually a no-op pass-through.
 *                  Used by VESTING withdraw / vesting-create(client) / launch-alt
 *                  (no submit endpoint exists for those — §d.7/d.9).
 *
 * Follows the useSwap provider pattern exactly: getWalletProvider() +
 * provider.request(). Guards a missing wallet/provider, warns (never errors —
 * console.error red-boxes in RN dev), and returns null on failure.
 */
import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { deserializeTx, getConnection, uint8ArrayToBase64 } from '@/utils/solanaTx';
import { ApiError } from '@/services/api';

export type SignStatus =
  | 'idle'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'error';

export interface SignSubmitArgs {
  /** base64 unsigned transaction (from build / create / withdraw). */
  transaction: string;
  /** Default 'signOnly'. */
  mode?: 'signOnly' | 'signAndSend';
  /**
   * signOnly: receives the CLIENT-SIGNED base64 tx — do the matching /submit POST.
   * signAndSend: receives the on-chain signature (provider already broadcast).
   */
  submit: (
    signedOrSignature: string,
  ) => Promise<{ signature: string; status?: string; deduped?: boolean }>;
}

export interface UseClientSignSubmit {
  status: SignStatus;
  error: string | null;
  signature: string | null;
  /**
   * The chain-confirmation status reported by the /submit endpoint
   * ('CONFIRMED' | 'PENDING'), or null for signAndSend / not-yet-submitted.
   * Lets callers distinguish a truly-confirmed trade from one merely accepted.
   */
  submitStatus: string | null;
  run: (
    args: SignSubmitArgs,
  ) => Promise<{ signature: string; deduped: boolean; status: string | null } | null>;
  reset: () => void;
}

export function useClientSignSubmit(): UseClientSignSubmit {
  const { walletAddress, getWalletProvider } = useAuth();
  const [status, setStatus] = useState<SignStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setSignature(null);
    setSubmitStatus(null);
  }, []);

  const run = useCallback(
    async (
      args: SignSubmitArgs,
    ): Promise<{ signature: string; deduped: boolean; status: string | null } | null> => {
      const { transaction, mode = 'signOnly', submit } = args;

      try {
        if (!walletAddress) {
          setError('Wallet not connected');
          setStatus('error');
          return null;
        }

        const provider = await getWalletProvider();
        if (!provider) {
          setError('Wallet provider not available. Please reconnect your wallet.');
          setStatus('error');
          return null;
        }

        setError(null);
        setStatus('signing');

        const tx = deserializeTx(transaction);

        let submitInput: string;
        if (mode === 'signAndSend') {
          // Provider broadcasts; we get back the on-chain signature.
          const connection = getConnection();
          const res = await provider.request({
            method: 'signAndSendTransaction',
            params: { transaction: tx, connection },
          });
          submitInput = res.signature;
        } else {
          // signOnly: provider returns the signed VersionedTransaction; we
          // re-serialize to base64 and hand it to the caller's /submit POST.
          const res = await provider.request({
            method: 'signTransaction',
            params: { transaction: tx },
          });
          const signed = res?.signedTransaction ?? res?.transaction ?? res;
          const bytes =
            typeof signed?.serialize === 'function'
              ? signed.serialize()
              : (signed as Uint8Array);
          submitInput = uint8ArrayToBase64(bytes);
        }

        setStatus('submitting');
        const result = await submit(submitInput);

        // Record the chain-confirmation status so callers can distinguish a
        // CONFIRMED trade from one merely PENDING (accepted, not yet on chain).
        const resultStatus = result.status ?? null;
        setSubmitStatus(resultStatus);
        setSignature(result.signature);
        setStatus('success');
        return {
          signature: result.signature,
          deduped: result.deduped ?? false,
          status: resultStatus,
        };
      } catch (err: any) {
        // HTTP 202 = the transaction was broadcast but NOT yet confirmed
        // (TIMEOUT / BLOCKHASH_EXPIRED). The chain outcome is genuinely unknown:
        // it may still land. This is NOT a hard failure — surface it as a
        // "submitted, confirming" terminal state (reusing the PENDING UX) rather
        // than a red "FAILED", so the user doesn't retry a tx that may succeed.
        if (err instanceof ApiError && err.status === 202) {
          const body =
            err.body && typeof err.body === 'object'
              ? (err.body as Record<string, unknown>)
              : null;
          // 202 bodies carry no on-chain signature (none is known yet).
          const sig = body && typeof body.signature === 'string' ? body.signature : null;
          setSubmitStatus('PENDING');
          setSignature(sig);
          setStatus('success');
          console.warn('[useClientSignSubmit] submitted but unconfirmed (202):', err.message);
          return { signature: sig ?? '', deduped: false, status: 'PENDING' };
        }

        const message = err?.message || 'Transaction failed';
        setError(message);
        setStatus('error');
        console.warn('[useClientSignSubmit] error:', message);
        return null;
      }
    },
    [walletAddress, getWalletProvider],
  );

  return { status, error, signature, submitStatus, run, reset };
}
