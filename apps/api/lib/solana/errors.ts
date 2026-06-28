/**
 * Solana transaction error taxonomy (§b.9 / D-signer §8).
 *
 * Every failure in the signer/submit layer is normalized to a `SolanaTxError`
 * so route handlers can map a small, stable set of codes onto the existing
 * `{ success: false, error }` JSON envelope used across `apps/api`.
 *
 * `classify()` maps web3.js / Helius / Privy raw errors into the taxonomy.
 * It NEVER throws and ALWAYS returns a `SolanaTxError`.
 */

export type SolanaTxErrorCode =
  | 'CONFIG_MISSING' // env/creds absent (no Privy/Helius config) — programmer/ops error, 500
  | 'STUBBED' // STUB_SOLANA_SIGNER active and a live call was reached
  | 'SIGNER_REJECTED' // Privy/server or client declined / authorization-key failure
  | 'PARTIAL_SIGN_UNSUPPORTED' // Privy stripped/blocked an ephemeral co-signer (§4 open question, at runtime)
  | 'SIMULATION_FAILED' // preflight/simulate revert (logs attached)
  | 'BLOCKHASH_EXPIRED' // lastValidBlockHeight passed before landing — caller may rebuild+retry
  | 'INSUFFICIENT_FUNDS' // fee payer lacks SOL for fees/tip/rent
  | 'TIP_TOO_LOW' // Sender rejected: Jito tip under minimum
  | 'RPC_ERROR' // transport / Helius RPC error
  | 'TIMEOUT' // confirmation window elapsed, status unknown (do NOT assume failure)
  | 'DUPLICATE' // idempotency: already submitted (carries the prior signature)
  | 'UNKNOWN';

export interface SolanaTxErrorOptions {
  retriable?: boolean;
  signature?: string;
  cause?: unknown;
}

/** Codes that are safe to retry (rebuild+resend within blockhash validity). */
const RETRIABLE_DEFAULT: ReadonlySet<SolanaTxErrorCode> = new Set([
  'BLOCKHASH_EXPIRED',
  'RPC_ERROR',
  'TIMEOUT',
]);

export class SolanaTxError extends Error {
  readonly code: SolanaTxErrorCode;
  readonly retriable: boolean;
  readonly signature?: string;
  // `cause` is also set on Error in modern runtimes; we keep an explicit field
  // so it is always reachable regardless of the Error base implementation.
  readonly cause?: unknown;

  constructor(code: SolanaTxErrorCode, message?: string, opts: SolanaTxErrorOptions = {}) {
    super(message ?? code);
    this.name = 'SolanaTxError';
    this.code = code;
    this.retriable = opts.retriable ?? RETRIABLE_DEFAULT.has(code);
    this.signature = opts.signature;
    this.cause = opts.cause;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, SolanaTxError.prototype);
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Maps an arbitrary error from web3.js / Helius / Privy into the taxonomy.
 * Pass-through if it is already a `SolanaTxError`.
 */
export function classify(err: unknown): SolanaTxError {
  if (err instanceof SolanaTxError) return err;

  const msg = messageOf(err);
  const lower = msg.toLowerCase();

  // Blockhash expiry / transaction-too-old — caller may rebuild + retry.
  if (
    lower.includes('block height exceeded') ||
    lower.includes('blockhash not found') ||
    lower.includes('blockhashnotfound') ||
    lower.includes('transactionexpired') ||
    lower.includes('expired')
  ) {
    return new SolanaTxError('BLOCKHASH_EXPIRED', msg, { cause: err });
  }

  // Confirmation timeout — status unknown, NOT a failure.
  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('was not confirmed')) {
    return new SolanaTxError('TIMEOUT', msg, { cause: err });
  }

  // Insufficient lamports for fees/tip/rent.
  if (
    lower.includes('insufficient funds') ||
    lower.includes('insufficient lamports') ||
    lower.includes('attempt to debit an account but found no record')
  ) {
    return new SolanaTxError('INSUFFICIENT_FUNDS', msg, { cause: err });
  }

  // Sender rejected the Jito tip as too low.
  if (lower.includes('tip') && (lower.includes('too low') || lower.includes('minimum') || lower.includes('below'))) {
    return new SolanaTxError('TIP_TOO_LOW', msg, { cause: err });
  }

  // Preflight / simulation revert.
  if (
    lower.includes('simulation failed') ||
    lower.includes('transaction simulation') ||
    lower.includes('custom program error') ||
    lower.includes('instructionerror')
  ) {
    return new SolanaTxError('SIMULATION_FAILED', msg, { cause: err });
  }

  // Signer declined / authorization-key failure (Privy / client).
  if (
    lower.includes('unauthorized') ||
    lower.includes('authorization') ||
    lower.includes('rejected') ||
    lower.includes('declined') ||
    lower.includes('signature verification')
  ) {
    return new SolanaTxError('SIGNER_REJECTED', msg, { cause: err });
  }

  // Transport / RPC error.
  if (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('rpc') ||
    lower.includes('503') ||
    lower.includes('502')
  ) {
    return new SolanaTxError('RPC_ERROR', msg, { cause: err });
  }

  return new SolanaTxError('UNKNOWN', msg, { cause: err });
}
