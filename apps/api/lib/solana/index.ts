/**
 * Public surface for the Momento Solana signer / submit layer (§b.10).
 *
 * This barrel re-exports ONLY the public interfaces + factories that Phase 3
 * consumers (mint / pool / fee-claim / vesting / user-relay modules) should
 * import. Internal helpers (connection caching, priority-fee/sender internals,
 * idempotency store) are reachable via their own modules when needed but are not
 * part of the stable public surface.
 */

export * from './types';
export { getServerWallet } from './serverWallet';
export { serverSigner, ephemeralSigner, clientRelaySigner, applySigners } from './signer';
export { submit, buildUnsignedForClient, submitClientSigned } from './submit';
export { getConnection } from './connection';
export { SolanaTxError, classify } from './errors';
