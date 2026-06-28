/**
 * lib/vesting.ts — Phase 3A vesting (Streamflow) + locks (Jupiter Lock).
 * Owner: P3-vesting. CONTRACTS-P3A §b.5 + D-vesting.md.
 *
 * Builders return a `BuiltTx` (from lib/solana/types) and NEVER set feePayer or
 * blockhash (submit()/buildUnsignedForClient() own that). Each attaches the right
 * Signer[]: a primary serverSigner() + the ephemeral co-signer whose account is
 * being created (Streamflow `metadata` Keypair / Jup-Lock `base` Keypair).
 *
 * Provider routing (D-vesting §1): input.kind 'vesting' -> STREAMFLOW
 * (cliff+linear, cancelableBySender=true); 'lock' -> JUP_LOCK (zero-fee,
 * cancelMode=0, irreversible). The route persists VestingSchedule.provider.
 *
 * Signer/fallback policy (D-vesting §3) lives in the create route: PRIMARY path is
 * serverSigner() + ephemeralSigner() via submit(); on PARTIAL_SIGN_UNSUPPORTED (or
 * VESTING_FORCE_CLIENT_COSIGN=1) the route falls back to the client-relay flow,
 * where buildUnsignedForClient() pre-attaches the ephemeral partialSign server-side
 * and the creator wallet fills the last slot via submitClientSigned().
 *
 * IMPORT-SAFE: all env/network access is INSIDE the exported functions. The
 * @streamflow/stream + @coral-xyz/anchor imports are top-level (dev-machine deps);
 * the env reads / RPC client construction happen lazily per call.
 *
 * TODO(verify-devnet): the gating item is whether @privy-io/node signTransaction
 * preserves a pre-attached ephemeral partial sig and signs the SAME compiled
 * message (signer.ts applySigners §4 note). That outcome flips server-vs-client
 * default; until proven, the route tries server then falls back on the raised
 * PARTIAL_SIGN_UNSUPPORTED.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import BN from 'bn.js';

import { StreamflowSolana, ICluster } from '@streamflow/stream';

import type { BuiltTx } from './solana/types';
import { serverSigner, ephemeralSigner, clientRelaySigner } from './solana/signer';
import { getConnection, getRpcUrl, getNetwork } from './solana/connection';
import { SolanaTxError } from './solana/errors';

import type {
  VestingProvider,
  VestingStatus,
  VestingSchedule,
} from '@prisma/client';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Jupiter Lock published mainnet/devnet program id. The jup-lock TEST workspace
 * id (2r5Vek…) is localnet only and must NOT be used. Env override allowed; this
 * file does NOT edit .env.local.example (P3-foundation owns env docs).
 */
export const JUP_LOCK_PROGRAM_ID = new PublicKey(
  process.env.JUP_LOCK_PROGRAM_ID ?? 'LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn',
);
const JUP_LOCK_ESCROW_SEED = Buffer.from('escrow');

// Token program ids (avoid an extra dep edge for the constant).
const TOKEN_CLASSIC_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

// ── Types (CONTRACTS-P3A §b.5) ───────────────────────────────────────────────

export type VestingKind = 'vesting' | 'lock';

/** Normalized create request (post-Zod). Times are unix seconds; amounts base-unit strings. */
export interface VestingCreateInput {
  kind: VestingKind; // 'vesting' -> STREAMFLOW, 'lock' -> JUP_LOCK
  tokenId: string; // CreatorToken.id — resolves mint + decimals + ownership
  mint: string; // token mint (must match CreatorToken.mintAddress)
  recipient: string; // beneficiary wallet (vesting); treasury/self (lock)
  amountBase: string; // GROSS amount to deposit (base units) — see §6 T22 caveat
  startAt: number;
  cliffAt: number;
  endAt: number; // unix seconds; cliffAt>=startAt; endAt>cliffAt
  unlockEvery: number; // period seconds (linear tick); endAt-cliffAt must be a multiple
  cliffAmountBase?: string; // released at cliff; default "0" (pure linear)
  /**
   * Optional Token-2022 transfer-fee bps for the net/gross-up computation (§6).
   * When omitted or 0, netDepositBase === amountBase (classic-allocation default,
   * the spike-c recommendation). The route may pass the mint's transferFeeBps.
   */
  transferFeeBps?: number;
  /** Token program for ATAs (classic-default; pass TOKEN_2022 for T22 mints, §6). */
  isToken2022?: boolean;
}

/** What the builder emits + what the route persists. */
export interface VestingPlan {
  provider: VestingProvider;
  /** Streamflow metadata pubkey OR Jup-Lock escrow PDA — the on-chain stream/escrow id. */
  streamId: string;
  /** ephemeral co-signer pubkey (metadata for Streamflow, base for Jup-Lock) — for logging. */
  ephemeralPubkey: string;
  /** NET amount that will actually land in escrow after any Token-2022 transfer fee (§6). */
  netDepositBase: string;
  built: BuiltTx;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function streamClient() {
  const cluster = getNetwork() === 'mainnet-beta' ? ICluster.Mainnet : ICluster.Devnet;
  return new StreamflowSolana.SolanaStreamClient(getRpcUrl(), cluster, 'confirmed');
}

function tokenProgramId(input: { isToken2022?: boolean }): PublicKey {
  return input.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_CLASSIC_PROGRAM_ID;
}

/**
 * Net amount that lands in escrow after a Token-2022 transfer fee (§6). For a
 * classic allocation (no fee) this is the gross deposit unchanged — the spike-c
 * default and the recommended path. The gross-up alternative (deposit =
 * ceil(targetNet*10000/(10000-feeBps))) is documented in D-vesting §6; here the
 * caller passes GROSS amountBase and we persist the NET that actually vests so
 * list/withdraw math is honest.
 */
function netDeposit(amountBase: bigint, transferFeeBps?: number): bigint {
  const bps = transferFeeBps ?? 0;
  if (bps <= 0) return amountBase; // classic allocation — exact, no haircut
  // floor of gross*(10000-bps)/10000 — what actually lands net of fee.
  return (amountBase * BigInt(10_000 - bps)) / BigInt(10_000);
}

function numPeriods(input: VestingCreateInput): number {
  // Validated integral by Zod (vestingCreateSchema): (endAt-cliffAt) % unlockEvery === 0.
  return Math.max(1, Math.floor((input.endAt - input.cliffAt) / input.unlockEvery));
}

// ── Streamflow builder (D-vesting §2.1; spike-c exact signatures) ─────────────

/** Build a Streamflow vesting stream create tx (cliff+linear, cancelableBySender=true). */
export async function buildStreamflowCreate(
  input: VestingCreateInput,
  payer: PublicKey,
): Promise<VestingPlan> {
  const client = streamClient();

  const gross = BigInt(input.amountBase);
  const net = netDeposit(gross, input.transferFeeBps);
  const cliffAmount = BigInt(input.cliffAmountBase ?? '0');
  const periods = numPeriods(input);
  // amountPerPeriod = (net - cliffAmount) / numPeriods (D-vesting §2.1).
  const drip = net > cliffAmount ? (net - cliffAmount) / BigInt(periods) : BigInt(0);

  const createData = {
    recipient: input.recipient,
    tokenId: input.mint,
    start: input.startAt,
    amount: new BN(net.toString()), // base units that vest (NET — §6)
    period: input.unlockEvery,
    cliff: input.cliffAt,
    cliffAmount: new BN(cliffAmount.toString()),
    amountPerPeriod: new BN(drip.toString()),
    name: 'MOMENTO CREATOR VESTING',
    canTopup: false,
    cancelableBySender: true,
    cancelableByRecipient: false,
    transferableBySender: false,
    transferableByRecipient: false,
    automaticWithdrawal: false,
    tokenProgramId: tokenProgramId(input).toBase58(),
  };

  // Lower-level call to make the ephemeral metadata co-signer explicit.
  // VERIFIED return shape (spike-c L379-385): { ixs, metadata?: Keypair, metadataPubKey }.
  const prepared: { ixs: any[]; metadata?: Keypair; metadataPubKey: PublicKey } =
    await client.prepareCreateInstructions(createData as any, {
      sender: { publicKey: payer } as any,
      isNative: false,
    } as any);

  const { ixs, metadata, metadataPubKey } = prepared;
  if (!metadata) {
    throw new SolanaTxError('SIGNER_REJECTED', 'Streamflow returned no ephemeral metadata keypair');
  }

  const tx = new Transaction().add(...ixs);
  const built: BuiltTx = {
    tx,
    // PRIMARY path (D-vesting §3.1): server treasury + ephemeral metadata.
    // The create route may rebuild signers for the client-relay fallback (§3.2).
    signers: [serverSigner(), ephemeralSigner(metadata)],
    label: 'vest_create',
  };

  return {
    provider: 'STREAMFLOW',
    streamId: metadataPubKey.toBase58(),
    ephemeralPubkey: metadata.publicKey.toBase58(),
    netDepositBase: net.toString(),
    built,
  };
}

// ── Jupiter Lock builder (D-vesting §2.2; spike-c §4) ─────────────────────────

function jupLockProgram(connection: Connection, payer: PublicKey) {
  // Lazy-require Anchor so import-time stays env/network free.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const anchor = require('@coral-xyz/anchor');

  const idlPath = process.env.JUP_LOCK_IDL_PATH;
  if (!idlPath) {
    throw new SolanaTxError(
      'CONFIG_MISSING',
      'JUP_LOCK_IDL_PATH not set — cannot build a Jupiter Lock createVestingEscrowV2 tx',
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

  // A read-only AnchorProvider wallet: we never let Anchor sign/submit — we only
  // use program.methods…instruction() to get the ix, then wrap it in a BuiltTx so
  // the committed submit()/applySigners path owns signing (server + ephemeral base).
  const dummyWallet = {
    publicKey: payer,
    signTransaction: async (t: Transaction) => t,
    signAllTransactions: async (t: Transaction[]) => t,
  };
  const provider = new anchor.AnchorProvider(connection, dummyWallet, { commitment: 'confirmed' });
  return new anchor.Program(idl, provider);
}

/**
 * Build a Jupiter Lock createVestingEscrowV2 tx (ephemeral base; cancelMode=0).
 *
 * P2 (vesting) — CLASSIC-PROGRAM ASSUMPTION: we target the on-chain Jup-Lock
 * Anchor program directly via `program.methods.createVestingEscrowV2(...)` (the
 * web3.js-v1 path), NOT the jup-lock-starter's web3.js-v2 "Kit" generated client.
 * The token program for the source/escrow ATAs is `tokenProgramId(input)` —
 * classic by default, Token-2022 only when the route passes `isToken2022`. spike-c
 * exercised a CLASSIC SPL mint, so the Token-2022 escrow-ATA path
 * (allowOwnerOffCurve + transferCheckedWithFee handling inside the program) is
 * UNVERIFIED. The published mainnet/devnet program id is pinned in
 * JUP_LOCK_PROGRAM_ID (the jup-lock TEST workspace id 2r5Vek… is localnet-only and
 * must never be used). TODO(verify-devnet): confirm a Token-2022 mint locks
 * correctly net-of-fee on devnet.
 */
export async function buildJupiterLockCreate(
  input: VestingCreateInput,
  payer: PublicKey,
): Promise<VestingPlan> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const {
    getAssociatedTokenAddressSync,
    getAssociatedTokenAddress,
  } = require('@solana/spl-token');

  const connection = getConnection();
  const mint = new PublicKey(input.mint);
  const recipient = new PublicKey(input.recipient);
  const tokenProgram = tokenProgramId(input);

  // Ephemeral `base` co-signer: escrow PDA = ["escrow", base] (spike-c §4).
  const base = Keypair.generate();
  const [escrow] = PublicKey.findProgramAddressSync(
    [JUP_LOCK_ESCROW_SEED, base.publicKey.toBuffer()],
    JUP_LOCK_PROGRAM_ID,
  );

  const gross = BigInt(input.amountBase);
  const net = netDeposit(gross, input.transferFeeBps);
  const cliffAmount = BigInt(input.cliffAmountBase ?? '0');
  const periods = numPeriods(input);
  const drip = net > cliffAmount ? (net - cliffAmount) / BigInt(periods) : BigInt(0);

  const lockParams = {
    vestingStartTime: new BN(input.startAt),
    cliffTime: new BN(input.cliffAt),
    frequency: new BN(input.unlockEvery),
    cliffUnlockAmount: new BN(cliffAmount.toString()),
    amountPerPeriod: new BN(drip.toString()),
    numberOfPeriod: new BN(periods),
    updateRecipientMode: 0, // immutable recipient
    cancelMode: 0, // 0 = irreversible lock (LP/retained) — buildVestingCancel rejects JUP_LOCK
  };

  const program = jupLockProgram(connection, payer);

  // sender token = payer ATA; escrow token = ATA owned by escrow PDA.
  const senderToken = getAssociatedTokenAddressSync(mint, payer, true, tokenProgram);
  const escrowToken = await getAssociatedTokenAddress(mint, escrow, true, tokenProgram);

  // TODO(verify-devnet): confirm createVestingEscrowV2 account/arg names against
  // the fetched devnet IDL (spike-c L530). Names below mirror the jup-lock tests.
  const ix = await program.methods
    .createVestingEscrowV2(lockParams, { slices: [] })
    .accounts({
      base: base.publicKey,
      senderToken,
      escrowToken,
      recipient,
      tokenMint: mint,
      sender: payer,
      tokenProgram,
      systemProgram: SystemProgram.programId,
      escrow,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  const built: BuiltTx = {
    tx,
    signers: [serverSigner(), ephemeralSigner(base)],
    label: 'lock_create',
  };

  return {
    provider: 'JUP_LOCK',
    streamId: escrow.toBase58(),
    ephemeralPubkey: base.publicKey.toBase58(),
    netDepositBase: net.toString(),
    built,
  };
}

/** Dispatch on input.kind (D-vesting §1). */
export async function buildVestingCreate(
  input: VestingCreateInput,
  payer: PublicKey,
): Promise<VestingPlan> {
  return input.kind === 'lock'
    ? buildJupiterLockCreate(input, payer)
    : buildStreamflowCreate(input, payer);
}

// ── Withdraw / cancel (single-signer; D-vesting §3.3) ─────────────────────────

/**
 * Build a recipient-signed withdraw/claim tx. invoker MUST be the recipient.
 * Single-signer (no ephemeral account is created) — the route runs it through the
 * client-relay path so the recipient signs with their embedded wallet.
 */
export async function buildVestingWithdraw(args: {
  schedule: VestingSchedule;
  invoker: PublicKey; // = recipient wallet
  amountBase?: string; // default: full claimable now
  /**
   * Token program of the vested mint. VestingSchedule does NOT yet persist a
   * token-program column (durable fix: a schema-shared additive migration), so
   * the route resolves it from CreatorToken.tokenProgram (via schedule.tokenId)
   * and threads it here. The launched-token DEFAULT is Token-2022, so failing to
   * pass this derives the recipient/escrow ATAs under the CLASSIC program → wrong
   * ATA/program id → claim build/exec reverts (functional withdraw-DoS, no fund
   * loss). When omitted we fall back to classic for backwards-compat, but the
   * route ALWAYS passes the resolved value.
   */
  isToken2022?: boolean;
}): Promise<{ built: BuiltTx; claimableBase: string }> {
  const { schedule, invoker } = args;

  const state = await getVestingState(schedule, { isToken2022: args.isToken2022 });
  const claimable = BigInt(state.claimableBase);
  const requested = args.amountBase != null ? BigInt(args.amountBase) : claimable;
  const amount = requested < claimable ? requested : claimable;

  if (!schedule.streamId) {
    throw new SolanaTxError('CONFIG_MISSING', 'VestingSchedule has no streamId');
  }

  let ixs: any[];

  if (schedule.provider === 'STREAMFLOW') {
    const client = streamClient();
    // withdraw needs only the invoker signer — NO ephemeral co-signer (research/13 §2).
    // `amount` is already in base units, so construct the BN directly (do NOT use
    // getBN(value, decimals), which would scale by 10^decimals).
    //
    // TODO(verify-devnet) [SDK P1-6]: `prepareWithdrawInstructions` is NOT in the
    // spike-c verified surface. spike-c (L102-104) verified only the high-level
    // `withdraw({ id, amount }, extParams)` (which BUILDS+SENDS, returning
    // ITransactionResult) plus `getOne`/`cancel`. We need raw ixs to wrap in a
    // BuiltTx for the client-relay (recipient embedded-wallet) path, so we use the
    // lower-level `prepare*` family that the SDK is known to expose alongside
    // `prepareCreateInstructions` (the verified create-side analogue). Confirm this
    // method name + the `{ invoker: { publicKey } }` extParams shape against
    // @streamflow/stream@12.4.0 on devnet before mainnet; if absent, fall back to
    // the verified `withdraw()` driven by a custom signer.
    const prepared = await (client as any).prepareWithdrawInstructions(
      { id: schedule.streamId, amount: new BN(amount.toString()) },
      { invoker: { publicKey: invoker } },
    );
    // Some SDK minors return { ixs }, others a bare array; normalize.
    ixs = Array.isArray(prepared) ? prepared : prepared.ixs;
  } else {
    // JUP_LOCK: claim from the escrow. recipientToken = recipient ATA.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAssociatedTokenAddress } = require('@solana/spl-token');
    const program = jupLockProgram(getConnection(), invoker);
    const escrow = new PublicKey(schedule.streamId);
    const mint = new PublicKey(schedule.tokenMint);
    // P1 (vesting hardening): VestingSchedule still has no token-program column —
    // the DURABLE fix is a schema-shared additive migration (VestingSchedule.
    // tokenProgram) persisted at create. INTERIM (this pass): the withdraw route
    // resolves CreatorToken.tokenProgram via schedule.tokenId and threads it here
    // as `args.isToken2022`. The launched-token DEFAULT is Token-2022, so deriving
    // the recipient/escrow ATAs under the classic program (the old hardcoded
    // `isT22 = false`) is WRONG for the default mint and makes the claim build/exec
    // revert (functional withdraw-DoS, no fund loss). We honor the threaded program
    // and fall back to classic only when the caller omits it.
    const isT22 = args.isToken2022 === true;
    const tokenProgram = isT22 ? TOKEN_2022_PROGRAM_ID : TOKEN_CLASSIC_PROGRAM_ID;
    const escrowToken = await getAssociatedTokenAddress(mint, escrow, true, tokenProgram);
    const recipientToken = await getAssociatedTokenAddress(mint, invoker, true, tokenProgram);

    // TODO(verify-devnet) [SDK P1-5]: BEST-EFFORT — the Jup-Lock claim instruction
    // is NOT in the spike-c verified surface. spike-c verified ONLY
    // `createVestingEscrowV2` (create) + `program.account.vestingEscrow.fetch`
    // (read); it did NOT exercise claim/withdraw. The ix name (`claimV2`), the
    // arg shape (amount + remainingAccountsInfo `{ slices: [] }`) and the account
    // list below mirror the jup-ag/jup-lock tests (tests/locker_utils/index.ts)
    // and the createVestingEscrowV2 account naming, but are UNCONFIRMED. Real
    // jup-lock claim typically also wires `memoProgram` and the Anchor event-CPI
    // accounts (`eventAuthority`, `program`) — Anchor >=0.30 auto-resolves the
    // latter from the IDL, but confirm the full account list + ix name against the
    // fetched devnet IDL (ref: jup-ag/jup-lock @ sdk/artifacts/locker.json) before
    // relying on this path on mainnet.
    const ix = await program.methods
      .claimV2(new BN(amount.toString()), { slices: [] })
      .accounts({
        escrow,
        escrowToken,
        recipient: invoker,
        recipientToken,
        tokenMint: mint,
        tokenProgram,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    ixs = [ix];
  }

  const tx = new Transaction().add(...ixs);
  const built: BuiltTx = {
    tx,
    // Single-signer recipient action — client-relay (recipient embedded wallet).
    signers: [clientRelaySigner(invoker)],
    label: 'vest_withdraw',
  };

  return { built, claimableBase: amount.toString() };
}

/**
 * Build a sender-signed cancel tx (Streamflow only). JUP_LOCK cancelMode=0 =>
 * not cancelable. Exposed for an internal/admin treasury-claw-back path; not
 * wired by a route in this module (D-vesting §4.3 note).
 */
export async function buildVestingCancel(args: {
  schedule: VestingSchedule;
  invoker: PublicKey; // = original sender / treasury
}): Promise<{ built: BuiltTx }> {
  const { schedule, invoker } = args;
  if (schedule.provider !== 'STREAMFLOW') {
    throw new SolanaTxError(
      'SIGNER_REJECTED',
      'JUP_LOCK escrows use cancelMode=0 (irreversible) and cannot be canceled',
    );
  }
  if (!schedule.streamId) {
    throw new SolanaTxError('CONFIG_MISSING', 'VestingSchedule has no streamId');
  }

  const client = streamClient();
  // cancel needs only the invoker signer — NO ephemeral co-signer (research/13 §2).
  //
  // TODO(verify-devnet) [SDK P1-6]: `prepareCancelInstructions` is NOT in the
  // spike-c verified surface. spike-c verified only the high-level
  // `cancel({ id }, extParams)` (which BUILDS+SENDS). As with withdraw, we need raw
  // ixs to wrap in a BuiltTx for the client-relay path, so we use the lower-level
  // `prepare*` family (analogue of the verified `prepareCreateInstructions`).
  // Confirm the method name + `{ invoker: { publicKey } }` extParams shape against
  // @streamflow/stream@12.4.0 on devnet; fall back to verified `cancel()` if absent.
  const prepared = await (client as any).prepareCancelInstructions(
    { id: schedule.streamId },
    { invoker: { publicKey: invoker } },
  );
  const ixs = Array.isArray(prepared) ? prepared : prepared.ixs;

  const tx = new Transaction().add(...ixs);
  const built: BuiltTx = {
    tx,
    signers: [clientRelaySigner(invoker)],
    label: 'vest_cancel',
  };
  return { built };
}

// ── State (getOne / escrow fetch; D-vesting §2.1/§2.2) ────────────────────────

/**
 * Read live on-chain state (claimable / withdrawn / status) for list + withdraw.
 *
 * `opts.isToken2022` mirrors the token program threaded into buildVestingWithdraw
 * (resolved from CreatorToken.tokenProgram via schedule.tokenId, since
 * VestingSchedule has no token-program column yet). The current read paths
 * (Streamflow getOne / Jup-Lock escrow-account fetch) do not derive ATAs, so the
 * flag is not strictly required here today, but it is accepted so callers can
 * thread a single consistent program identity and so any future ATA-derived read
 * (e.g. balance reconciliation) stays correct for the Token-2022 default.
 */
export async function getVestingState(
  schedule: VestingSchedule,
  opts?: { isToken2022?: boolean },
): Promise<{
  totalBase: string;
  withdrawnBase: string;
  claimableBase: string;
  status: VestingStatus;
}> {
  void opts; // reserved for ATA-derived reads; see doc comment above
  if (!schedule.streamId) {
    // Not yet on-chain (PENDING client path) — report DB totals.
    return {
      totalBase: schedule.totalBaseUnits,
      withdrawnBase: schedule.releasedBaseUnits,
      claimableBase: '0',
      status: schedule.status,
    };
  }

  const now = Math.floor(Date.now() / 1000);

  if (schedule.provider === 'STREAMFLOW') {
    const client = streamClient();
    const stream: any = await client.getOne({ id: schedule.streamId });

    const total = BigInt(stream.depositedAmount?.toString?.() ?? schedule.totalBaseUnits);
    const withdrawn = BigInt(stream.withdrawnAmount?.toString?.() ?? schedule.releasedBaseUnits);

    // unlocked(now) - withdrawn (D-vesting §2.1). Fall back to 0 if unavailable.
    let unlocked = withdrawn;
    try {
      const u = typeof stream.unlocked === 'function' ? stream.unlocked(now) : stream.unlocked;
      if (u != null) unlocked = BigInt(u.toString());
    } catch {
      /* leave unlocked = withdrawn => claimable 0 */
    }
    const claimable = unlocked > withdrawn ? unlocked - withdrawn : BigInt(0);

    return {
      totalBase: total.toString(),
      withdrawnBase: withdrawn.toString(),
      claimableBase: claimable.toString(),
      status: deriveStatus(schedule, total, withdrawn, stream.canceledAt),
    };
  }

  // JUP_LOCK: fetch the escrow account.
  const program = jupLockProgram(getConnection(), new PublicKey(schedule.beneficiaryWallet));
  const escrow = new PublicKey(schedule.streamId);
  const acct: any = await program.account.vestingEscrow.fetch(escrow);

  const total = BigInt(
    acct.cliffUnlockAmount && acct.amountPerPeriod && acct.numberOfPeriod
      ? new BN(acct.cliffUnlockAmount.toString())
          .add(new BN(acct.amountPerPeriod.toString()).mul(new BN(acct.numberOfPeriod.toString())))
          .toString()
      : schedule.totalBaseUnits,
  );
  const withdrawn = BigInt(acct.totalClaimedAmount?.toString?.() ?? schedule.releasedBaseUnits);
  const unlocked = jupLockUnlocked(acct, now);
  const claimable = unlocked > withdrawn ? unlocked - withdrawn : BigInt(0);

  return {
    totalBase: total.toString(),
    withdrawnBase: withdrawn.toString(),
    claimableBase: claimable.toString(),
    status: deriveStatus(schedule, total, withdrawn, undefined),
  };
}

/** Linear-with-cliff unlocked-amount for a Jup-Lock escrow account at `now`. */
function jupLockUnlocked(acct: any, now: number): bigint {
  try {
    const start = Number(acct.cliffTime?.toString?.() ?? acct.vestingStartTime?.toString?.() ?? 0);
    if (now < start) return BigInt(0);
    const cliffAmt = BigInt(acct.cliffUnlockAmount?.toString?.() ?? '0');
    const perPeriod = BigInt(acct.amountPerPeriod?.toString?.() ?? '0');
    const freq = BigInt(acct.frequency?.toString?.() ?? '1');
    const maxPeriods = BigInt(acct.numberOfPeriod?.toString?.() ?? '0');
    if (freq <= BigInt(0)) return cliffAmt;
    const elapsed = BigInt(now - start);
    let periods = elapsed / freq;
    if (periods > maxPeriods) periods = maxPeriods;
    return cliffAmt + perPeriod * periods;
  } catch {
    return BigInt(0);
  }
}

/**
 * Map on-chain totals to a VestingStatus, PREFERRING on-chain truth.
 *
 * P1 (vesting hardening, stranded-state): the client-path create flow leaves the
 * DB row PENDING until a confirm hook flips it (see /api/vesting/[id]/confirm).
 * If we reach this function it means the stream/escrow account was successfully
 * fetched on-chain (getVestingState only calls deriveStatus AFTER getOne /
 * vestingEscrow.fetch resolves) — i.e. the schedule IS funded on-chain. A DB
 * status of PENDING in that situation is stale, so we treat funded-on-chain as
 * authoritative and report ACTIVE (or COMPLETED if fully withdrawn). Terminal
 * states (CANCELED) and a genuine on-chain cancel still win.
 */
function deriveStatus(
  schedule: VestingSchedule,
  total: bigint,
  withdrawn: bigint,
  canceledAt: unknown,
): VestingStatus {
  if (schedule.status === 'CANCELED' || (canceledAt && Number(canceledAt) > 0)) return 'CANCELED';
  if (total > BigInt(0) && withdrawn >= total) return 'COMPLETED';
  // Funded on-chain (we got here via a successful account fetch) ⇒ ACTIVE, even if
  // the DB row is still PENDING (confirm hook not yet applied). On-chain truth wins.
  return 'ACTIVE';
}
