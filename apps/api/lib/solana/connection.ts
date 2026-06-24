/**
 * Cached web3.js v1 `Connection` over the Helius RPC (§b.5 / D-signer §1).
 *
 * Reuses the same Helius config convention as `lib/helius.ts` (network →
 * devnet/mainnet RPC host, `HELIUS_API_KEY` query param). `SOLANA_RPC_URL`
 * overrides the derived URL when present.
 *
 * IMPORT-SAFE: no env read at module top-level — the Connection (and the env
 * read that backs it) is created lazily on first `getConnection()` call.
 */

import { Connection } from '@solana/web3.js';
import { SolanaTxError } from './errors';

let _connection: Connection | null = null;
let _rpcUrl: string | null = null;

/** The cluster name used for cluster-scoped calls (devnet | mainnet-beta). */
export function getNetwork(): string {
  return process.env.SOLANA_NETWORK || 'devnet';
}

/**
 * Resolve the Helius RPC URL. Mirrors `lib/helius.ts` getHeliusConfig().
 * `SOLANA_RPC_URL` (if set) wins; otherwise derive from `HELIUS_API_KEY`.
 */
export function getRpcUrl(): string {
  if (_rpcUrl) return _rpcUrl;

  const override = process.env.SOLANA_RPC_URL?.trim();
  if (override) {
    _rpcUrl = override;
    return _rpcUrl;
  }

  const apiKey = process.env.HELIUS_API_KEY?.trim();
  if (!apiKey) {
    throw new SolanaTxError(
      'CONFIG_MISSING',
      'Missing SOLANA_RPC_URL and HELIUS_API_KEY — cannot resolve a Solana RPC endpoint',
    );
  }
  const network = getNetwork();
  const rpcHost = network === 'mainnet-beta' ? 'mainnet.helius-rpc.com' : 'devnet.helius-rpc.com';
  _rpcUrl = `https://${rpcHost}/?api-key=${apiKey}`;
  return _rpcUrl;
}

/** Cached web3.js Connection. Default commitment 'confirmed'. */
export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(getRpcUrl(), 'confirmed');
  }
  return _connection;
}

/** Test/maintenance helper: drop the cached connection + URL (e.g. after env change). */
export function resetConnection(): void {
  _connection = null;
  _rpcUrl = null;
}
