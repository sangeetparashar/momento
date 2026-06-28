/**
 * Priority fee estimation (Helius) + ComputeBudget instruction builders
 * (§b.6 / D-signer §7).
 *
 * `getPriorityFeeEstimate` POSTs the Helius `getPriorityFeeEstimate` JSON-RPC
 * method to the Helius RPC (reuses connection.ts `getRpcUrl()`), returning
 * micro-lamports per CU. That feeds `ComputeBudgetProgram.setComputeUnitPrice`.
 *
 * IMPORT-SAFE: env/network access happens only inside the exported functions.
 */

import { ComputeBudgetProgram } from '@solana/web3.js';
import type { TransactionInstruction } from '@solana/web3.js';
import type { SubmitOptions } from './types';
import { getRpcUrl } from './connection';
import { SolanaTxError } from './errors';

/** Helius requires a positive fee for Sender; default floor for the RPC route too. */
const DEFAULT_MICRO_LAMPORTS_PER_CU = 10_000;
/** Conservative default CU ceiling when a builder gives no hint and simulation is skipped. */
export const DEFAULT_COMPUTE_UNIT_LIMIT = 400_000;

/**
 * Fetch a per-tx priority-fee estimate (micro-lamports / CU) from Helius.
 *
 * Prefer passing `transaction` (base64-serialized) for a per-tx estimate;
 * `accountKeys` (writable accounts) is the fallback when no serialized tx exists.
 * `priorityLevel` maps to Helius levels (Min..UnsafeMax).
 *
 * Returns `DEFAULT_MICRO_LAMPORTS_PER_CU` if Helius returns no usable number,
 * so the caller always has a positive fee (Sender rejects a zero fee).
 */
export async function getPriorityFeeEstimate(input: {
  transaction?: string;
  accountKeys?: string[];
  priorityLevel?: SubmitOptions['priorityLevel'];
}): Promise<number> {
  const { transaction, accountKeys, priorityLevel } = input;

  const options: Record<string, unknown> = { priorityLevel: priorityLevel ?? 'Medium' };
  const params: Record<string, unknown> = { options };
  if (transaction) {
    params.transaction = transaction;
  } else if (accountKeys && accountKeys.length > 0) {
    params.accountKeys = accountKeys;
  } else {
    // No tx and no accounts — nothing to estimate against; use the floor.
    return DEFAULT_MICRO_LAMPORTS_PER_CU;
  }

  let res: Response;
  try {
    res = await fetch(getRpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'momento-priority-fee',
        method: 'getPriorityFeeEstimate',
        params: [params],
      }),
    });
  } catch (err) {
    throw new SolanaTxError('RPC_ERROR', `getPriorityFeeEstimate request failed: ${(err as Error).message}`, {
      cause: err,
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new SolanaTxError('RPC_ERROR', `getPriorityFeeEstimate HTTP ${res.status}: ${body}`);
  }

  const data = await res.json().catch(() => null);
  if (!data || data.error) {
    throw new SolanaTxError(
      'RPC_ERROR',
      `getPriorityFeeEstimate RPC error: ${data?.error?.message ?? 'unparseable response'}`,
    );
  }

  const estimate = data.result?.priorityFeeEstimate;
  const micro = typeof estimate === 'number' && Number.isFinite(estimate) ? Math.ceil(estimate) : 0;
  return micro > 0 ? micro : DEFAULT_MICRO_LAMPORTS_PER_CU;
}

/**
 * Build the two ComputeBudget instructions to PREPEND to a tx:
 *   - setComputeUnitLimit(unitLimit)
 *   - setComputeUnitPrice(microLamportsPerCu)
 *
 * web3.js v1 surface (verified): `ComputeBudgetProgram.setComputeUnitLimit({ units })`
 * and `ComputeBudgetProgram.setComputeUnitPrice({ microLamports })`.
 */
export function computeBudgetIxs(microLamportsPerCu: number, unitLimit: number): TransactionInstruction[] {
  const units = Math.max(1, Math.floor(unitLimit));
  const microLamports = Math.max(0, Math.floor(microLamportsPerCu));
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ];
}
