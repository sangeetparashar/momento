/**
 * `ServerWallet` — abstraction over the Momento treasury Privy server wallet
 * (§b.2 / D-signer §3), implemented with `@privy-io/node`.
 *
 * The treasury wallet is provisioned ONCE, by ops (Phase 0.4); its `walletId`
 * lives in `PRIVY_SERVER_WALLET_ID`. This module IDENTIFIES it by id — it never
 * creates a wallet on a hot path.
 *
 * IMPORT-SAFE:
 *   - No env read at module top-level — `client()` / `address` read env on first
 *     *use*, mirroring `lib/auth.ts` getPrivy() and `lib/helius.ts`.
 *   - `STUB_SOLANA_SIGNER=1` short-circuits to a deterministic stub: it exposes a
 *     fixed dummy address so build/serialize paths work in tests, but any actual
 *     LIVE signing call throws `SolanaTxError('STUBBED')` at CALL time (not import).
 *   - When creds are missing (and not stubbed), live calls throw
 *     `SolanaTxError('CONFIG_MISSING')` at CALL time.
 *
 * The `@privy-io/node` client construction and the `walletApi.solana.signTransaction`
 * calls are written for real but guarded behind `TODO(ops)` so the module compiles
 * and imports clean with zero secrets and without the dependency installed yet.
 */

import { PublicKey } from '@solana/web3.js';
import type { Transaction } from '@solana/web3.js';
import { SolanaTxError } from './errors';
import { getNetwork } from './connection';

export interface ServerWallet {
  /** resolved from env walletId on first use. */
  readonly address: PublicKey;
  /** adds the treasury signature; self-submission happens elsewhere. */
  signTransaction(tx: Transaction): Promise<Transaction>;
  signAllTransactions(txs: Transaction[]): Promise<Transaction[]>;
}

/** Deterministic stub address (SystemProgram id) — recognizable, never a real treasury. */
const STUB_ADDRESS = new PublicKey('11111111111111111111111111111111');

function isStub(): boolean {
  return process.env.STUB_SOLANA_SIGNER === '1';
}

/** Read a required env var lazily; throw a typed CONFIG_MISSING error at call time. */
function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new SolanaTxError('CONFIG_MISSING', `Missing ${name} environment variable for the Momento server wallet`);
  }
  return v;
}

/**
 * caip2 cluster string for Privy server signing.
 * devnet  -> 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'  (Solana devnet genesis hash prefix)
 * mainnet -> 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'  (Solana mainnet-beta genesis hash prefix)
 * TODO(verify-devnet): confirm the EXACT caip2 string @privy-io/node expects per cluster
 * (D-signer §12 open question #3) before the first live signing call.
 */
function caip2(): string {
  return getNetwork() === 'mainnet-beta'
    ? 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
    : 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
}

function makeServerWallet(): ServerWallet {
  // Cached on first resolution; lazy so import is side-effect-free.
  let pubkey: PublicKey | null = null;

  /**
   * Construct the @privy-io/node client. Reads creds lazily.
   * TODO(ops): wire the real client once `@privy-io/node` is installed + creds
   * are provisioned. Until then this throws CONFIG_MISSING/STUBBED at call time.
   */
  function client(): unknown {
    if (isStub()) {
      throw new SolanaTxError('STUBBED', 'STUB_SOLANA_SIGNER=1: server-wallet client is stubbed (no live Privy call)');
    }
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID;
    if (!appId) {
      throw new SolanaTxError('CONFIG_MISSING', 'Missing PRIVY_APP_ID environment variable');
    }
    const appSecret = required('PRIVY_APP_SECRET');
    const authorizationPrivateKey = required('PRIVY_AUTHORIZATION_KEY'); // signs server-wallet requests
    required('PRIVY_SERVER_WALLET_ID'); // identify (not create) the treasury wallet

    // TODO(ops): construct the live @privy-io/node client.
    //   const { PrivyClient } = await import('@privy-io/node');
    //   return new PrivyClient({
    //     appId, appSecret,
    //     walletApi: { authorizationPrivateKey },
    //   });
    void appId;
    void appSecret;
    void authorizationPrivateKey;
    throw new SolanaTxError(
      'CONFIG_MISSING',
      'serverWallet.client: live @privy-io/node wiring is pending (TODO(ops)) — install @privy-io/node and enable the construction above',
    );
  }

  async function signTransaction(tx: Transaction): Promise<Transaction> {
    if (isStub()) {
      // Build/serialize paths are fine in tests, but a real broadcast must not
      // pretend a treasury signature exists.
      throw new SolanaTxError(
        'STUBBED',
        'STUB_SOLANA_SIGNER=1: server-wallet signTransaction reached a live signing call',
      );
    }
    const privy = client(); // throws CONFIG_MISSING until ops wires it
    const walletId = required('PRIVY_SERVER_WALLET_ID');
    void privy;
    void walletId;
    void caip2();

    // TODO(ops): live server-wallet signing via @privy-io/node.
    //   const { signedTransaction } = await (privy as PrivyClient).walletApi.solana.signTransaction({
    //     walletId,
    //     caip2: caip2(),           // cluster selector; NO custom-RPC field — we self-submit
    //     transaction: tx,          // a v1 legacy Transaction (may already carry ephemeral partialSign'd sigs)
    //   });
    //   return signedTransaction as Transaction;
    //
    // TODO(verify-devnet): confirm @privy-io/node signTransaction PRESERVES a
    // pre-attached ephemeral partialSign (multi-signer co-signing for Streamflow
    // metadata / JupLock base). If it strips other signatures, route co-signed
    // txns through the client embedded wallet instead and keep server-wallet txns
    // single-signer. See signer.ts applySigners + D-signer §4 open question.
    throw new SolanaTxError(
      'CONFIG_MISSING',
      'serverWallet.signTransaction: live @privy-io/node signing is pending (TODO(ops))',
    );
  }

  return {
    get address(): PublicKey {
      if (pubkey) return pubkey;
      if (isStub()) {
        pubkey = STUB_ADDRESS;
        return pubkey;
      }
      // Live resolution: identify the provisioned wallet by id and read its address.
      required('PRIVY_SERVER_WALLET_ID');
      // TODO(ops): resolve the treasury address from @privy-io/node:
      //   const wallet = await (client() as PrivyClient).walletApi.getWallet({ id });
      //   pubkey = new PublicKey(wallet.address);
      //   return pubkey;
      // NOTE: getter is sync per the §b.2 interface, so the live resolution must
      // be primed by an async warmup call (ops) before address is read on a hot
      // path — OR change to a cached value populated by the first sign call.
      throw new SolanaTxError(
        'CONFIG_MISSING',
        'serverWallet.address: live treasury address resolution is pending (TODO(ops)) — set STUB_SOLANA_SIGNER=1 for tests',
      );
    },

    signTransaction,

    async signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
      // Sign sequentially to preserve deterministic ordering + clear error attribution.
      const out: Transaction[] = [];
      for (const t of txs) {
        out.push(await signTransaction(t));
      }
      return out;
    },
  };
}

let _serverWallet: ServerWallet | null = null;

/** Singleton Momento treasury server wallet. Lazy env read; stub under STUB_SOLANA_SIGNER. */
export function getServerWallet(): ServerWallet {
  if (!_serverWallet) {
    _serverWallet = makeServerWallet();
  }
  return _serverWallet;
}

/** Test helper: drop the cached singleton (e.g. after toggling STUB_SOLANA_SIGNER). */
export function resetServerWallet(): void {
  _serverWallet = null;
}
