/**
 * `ServerWallet` — abstraction over the Momento treasury Privy server wallet
 * (§b.2 / D-signer §3), implemented with `@privy-io/node` (v0.23).
 *
 * The treasury wallet is provisioned ONCE, by ops (Phase 0.4): its id lives in
 * `PRIVY_SERVER_WALLET_ID` and its public key in `PRIVY_SERVER_WALLET_ADDRESS`
 * (a pubkey, not a secret — shown in the Privy dashboard). This module
 * IDENTIFIES the wallet by id; it never creates one on a hot path.
 *
 * IMPORT-SAFE:
 *   - No env read or client construction at module top-level — everything is
 *     lazy (first use), mirroring `lib/auth.ts` getPrivy().
 *   - `STUB_SOLANA_SIGNER=1` short-circuits to a deterministic stub: a fixed
 *     dummy address so build/serialize paths work in tests, but any LIVE signing
 *     call throws `SolanaTxError('STUBBED')` at CALL time (not import).
 *   - Missing creds (and not stubbed) throw `SolanaTxError('CONFIG_MISSING')` at
 *     CALL time.
 *
 * Signing model (D-signer §3): we SIGN-ONLY via the Privy server wallet and then
 * self-submit through our own Helius/Sender path — we never use Privy's
 * `signAndSendTransaction` (it exposes no custom-RPC field), so no caip2 is
 * needed on this path.
 */

import { PublicKey, Transaction } from '@solana/web3.js';
import { PrivyClient } from '@privy-io/node';
import { SolanaTxError } from './errors';

export interface ServerWallet {
  /** Treasury pubkey (from PRIVY_SERVER_WALLET_ADDRESS), resolved on first read. */
  readonly address: PublicKey;
  /** Adds the treasury signature IN PLACE; self-submission happens elsewhere. */
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
 * Authorization context for wallet RPC. Privy server-wallet sign operations are
 * policy-gated: the request must carry a `privy-authorization-signature` derived
 * from the wallet's authorization key. The SDK generates that header for us when
 * given the private key here. `PRIVY_AUTHORIZATION_KEY` must be the base64-encoded
 * PKCS8 private key (no PEM headers). Optional: a wallet with no signing policy
 * does not require it, so we only attach it when present.
 */
function authorizationContext(): { authorization_private_keys: string[] } | undefined {
  const key = process.env.PRIVY_AUTHORIZATION_KEY?.trim();
  return key ? { authorization_private_keys: [key] } : undefined;
}

function makeServerWallet(): ServerWallet {
  // Lazy + cached so import is side-effect-free.
  let pubkey: PublicKey | null = null;
  let privy: PrivyClient | null = null;

  /** Construct (and cache) the @privy-io/node client. Reads creds lazily. */
  function client(): PrivyClient {
    if (isStub()) {
      throw new SolanaTxError('STUBBED', 'STUB_SOLANA_SIGNER=1: server-wallet client is stubbed (no live Privy call)');
    }
    if (privy) return privy;
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID;
    if (!appId) {
      throw new SolanaTxError('CONFIG_MISSING', 'Missing PRIVY_APP_ID environment variable');
    }
    const appSecret = required('PRIVY_APP_SECRET');
    privy = new PrivyClient({ appId, appSecret });
    return privy;
  }

  /**
   * Resolve the treasury public key. The §b.2 interface exposes `address`
   * synchronously, and the public @privy-io/node client has no sync get-by-id —
   * so we read the pubkey from `PRIVY_SERVER_WALLET_ADDRESS` (provisioned by ops
   * alongside the wallet id). Cached on first read.
   */
  function treasury(): PublicKey {
    if (pubkey) return pubkey;
    if (isStub()) {
      pubkey = STUB_ADDRESS;
      return pubkey;
    }
    required('PRIVY_SERVER_WALLET_ID'); // identify (not create) the treasury wallet
    const addr = required('PRIVY_SERVER_WALLET_ADDRESS');
    try {
      pubkey = new PublicKey(addr);
    } catch {
      throw new SolanaTxError('CONFIG_MISSING', `PRIVY_SERVER_WALLET_ADDRESS is not a valid base58 pubkey: ${addr}`);
    }
    return pubkey;
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
    const walletId = required('PRIVY_SERVER_WALLET_ID');
    const treasuryPubkey = treasury();

    // Sign-only (we self-submit). Serialize WITHOUT requiring all sigs so any
    // pre-attached ephemeral partialSign (Streamflow `metadata` / JupLock `base`)
    // rides along. `serialize()` does NOT mutate `tx`, so the original retains
    // its ephemeral signatures regardless of what Privy returns.
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const auth = authorizationContext();
    const res = await client()
      .wallets()
      .solana()
      .signTransaction(walletId, {
        transaction: serialized.toString('base64'),
        ...(auth ? { authorization_context: auth } : {}),
      });

    // Re-attach the treasury signature onto the ORIGINAL `tx`. applySigners()
    // (signer.ts) inspects the tx it passed in — NOT our return value — so the
    // treasury sig MUST land on `tx` itself, in place.
    const signed = Transaction.from(Buffer.from(res.signed_transaction, 'base64'));
    const sig = signed.signatures.find((s) => s.publicKey.equals(treasuryPubkey))?.signature;
    if (!sig) {
      throw new SolanaTxError('SIGNER_REJECTED', 'Privy server wallet returned no treasury signature');
    }
    tx.addSignature(treasuryPubkey, sig);

    // TODO(verify-devnet): confirm Privy signs the SAME compiled message we send
    // (does not re-serialize/mutate blockhash/ixs). If it mutates the message,
    // the treasury sig is over different bytes and will fail on-chain
    // verifySignatures — fall back to the client-wallet relay for co-signed
    // (Streamflow/JupLock) txns. See signer.ts applySigners step 4.
    return tx;
  }

  return {
    get address(): PublicKey {
      return treasury();
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
