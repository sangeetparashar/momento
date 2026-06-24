/**
 * Helius Sender client (Jito dual-route) + Jito tip instruction
 * (§b.7 / D-signer §7).
 *
 * Sender is an ultra-low-latency endpoint that broadcasts to validators AND
 * Jito. Per Helius docs it REQUIRES:
 *   - skipPreflight: true
 *   - a priority fee (set by submit() via computeBudgetIxs)
 *   - maxRetries: 0   (we own resubmission)
 *   - a Jito tip transfer instruction (min 0.0002 SOL; 0.000005 SOL with swqos_only)
 *
 * IMPORT-SAFE: env reads happen inside the exported functions only.
 */

import { SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { TransactionInstruction } from '@solana/web3.js';
import { SolanaTxError } from './errors';
import { getServerWallet } from './serverWallet';

const DEFAULT_SENDER_URL = 'https://sender.helius-rpc.com/fast';

/** Jito tip minimums (lamports). */
const MIN_TIP_LAMPORTS = 200_000; // 0.0002 SOL — standard Sender route
const MIN_TIP_LAMPORTS_SWQOS = 5_000; // 0.000005 SOL — swqos_only route

export function getSenderUrl(): string {
  return process.env.HELIUS_SENDER_URL?.trim() || DEFAULT_SENDER_URL;
}

/**
 * Resolve the default Jito tip (lamports), respecting the swqos_only minimum.
 * `JITO_TIP_LAMPORTS` env overrides the default; the relevant minimum is enforced.
 */
export function getDefaultTipLamports(swqosOnly = false): number {
  const min = swqosOnly ? MIN_TIP_LAMPORTS_SWQOS : MIN_TIP_LAMPORTS;
  const raw = process.env.JITO_TIP_LAMPORTS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  const want = Number.isFinite(parsed) ? parsed : MIN_TIP_LAMPORTS;
  return Math.max(min, want);
}

/** Resolve the Jito tip recipient account (env `JITO_TIP_ACCOUNT`, required for Sender). */
function getTipAccount(): PublicKey {
  const acct = process.env.JITO_TIP_ACCOUNT?.trim();
  if (!acct) {
    throw new SolanaTxError(
      'CONFIG_MISSING',
      'Missing JITO_TIP_ACCOUNT — required to build a Jito tip for the Helius Sender route',
    );
  }
  try {
    return new PublicKey(acct);
  } catch (err) {
    throw new SolanaTxError('CONFIG_MISSING', `Invalid JITO_TIP_ACCOUNT: ${(err as Error).message}`, { cause: err });
  }
}

/**
 * Build a SystemProgram transfer of `tipLamports` from the server wallet (fee
 * payer for platform Sender txns) to the configured Jito tip account.
 *
 * NOTE: the `from` is the Momento server wallet — Sender txns are platform
 * actions. submit() prepends this ix when route === 'sender'.
 */
export function jitoTipIx(tipLamports: number): TransactionInstruction {
  const tipAccount = getTipAccount();
  const lamports = Math.max(0, Math.floor(tipLamports));
  if (lamports < MIN_TIP_LAMPORTS_SWQOS) {
    throw new SolanaTxError(
      'TIP_TOO_LOW',
      `Jito tip ${lamports} lamports is below the absolute minimum (${MIN_TIP_LAMPORTS_SWQOS})`,
    );
  }
  const fromPubkey = getServerWallet().address;
  return SystemProgram.transfer({
    fromPubkey,
    toPubkey: tipAccount,
    lamports,
  });
}

/**
 * POST a fully-signed, base64-serialized tx to Helius Sender.
 * Uses sendTransaction with base64 encoding, skipPreflight + maxRetries:0
 * (submit() owns the resend loop).
 *
 * `swqosOnly` toggles the `?swqos_only=true` query param (cheaper tip, validators
 * only — no Jito bundle inclusion).
 */
export async function sendViaSender(input: {
  rawTxBase64: string;
  swqosOnly?: boolean;
}): Promise<{ signature: string }> {
  const { rawTxBase64, swqosOnly } = input;
  const url = swqosOnly ? `${getSenderUrl()}?swqos_only=true` : getSenderUrl();

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'momento-sender',
        method: 'sendTransaction',
        params: [
          rawTxBase64,
          { encoding: 'base64', skipPreflight: true, maxRetries: 0 },
        ],
      }),
    });
  } catch (err) {
    throw new SolanaTxError('RPC_ERROR', `Helius Sender request failed: ${(err as Error).message}`, { cause: err });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Surface tip-too-low specially so callers can bump and retry.
    if (body.toLowerCase().includes('tip')) {
      throw new SolanaTxError('TIP_TOO_LOW', `Helius Sender HTTP ${res.status}: ${body}`);
    }
    throw new SolanaTxError('RPC_ERROR', `Helius Sender HTTP ${res.status}: ${body}`);
  }

  const data = await res.json().catch(() => null);
  if (!data || data.error) {
    const errMsg = data?.error?.message ?? 'unparseable Sender response';
    if (errMsg.toLowerCase().includes('tip')) {
      throw new SolanaTxError('TIP_TOO_LOW', `Helius Sender RPC error: ${errMsg}`);
    }
    throw new SolanaTxError('RPC_ERROR', `Helius Sender RPC error: ${errMsg}`);
  }

  const signature = data.result;
  if (typeof signature !== 'string' || !signature) {
    throw new SolanaTxError('RPC_ERROR', 'Helius Sender returned no signature');
  }
  return { signature };
}

/** Exposed for callers that want to display the tip in SOL. */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}
