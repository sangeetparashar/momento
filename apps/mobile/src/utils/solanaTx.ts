/**
 * Solana transaction helpers shared by the client-sign hooks.
 *
 * `base64ToUint8Array` is lifted from useSwap so all signing paths decode the
 * same way. `uint8ArrayToBase64` is new — needed to re-serialize a client-signed
 * VersionedTransaction back to base64 before POSTing it to the matching /submit
 * endpoint (the signOnly trade flow).
 */
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { ENV } from '@/config/env';

/** RPC endpoint used for signing/sending — matches useSwap. */
export const SOLANA_RPC_URL: string =
  process.env.EXPO_PUBLIC_HELIUS_RPC_URL || ENV.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

/** Decode base64 to Uint8Array without needing Node's Buffer polyfill. */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Encode a byte array to base64 without needing Node's Buffer polyfill. */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000; // avoid call-stack limits on large txs
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk) as number[]);
  }
  return btoa(binary);
}

let _connection: Connection | null = null;

/** Memoized 'confirmed' Connection. */
export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  }
  return _connection;
}

/** Deserialize a base64 transaction into a VersionedTransaction. */
export function deserializeTx(base64: string): VersionedTransaction {
  return VersionedTransaction.deserialize(base64ToUint8Array(base64));
}
