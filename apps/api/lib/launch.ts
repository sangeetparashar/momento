/**
 * apps/api/lib/launch.ts — P3-launch (CONTRACTS-P3A §b.1 / D-launch.md)
 * ============================================================================
 * Creator-token LAUNCH orchestration on Meteora Dynamic Bonding Curve (DBC):
 *
 *   persist PENDING (CreatorToken + TokenFeeConfig + TokenFundraise)
 *     -> createConfig  (DBC partner.createConfig: USDC quote, Momento feeClaimer,
 *                       Token2022 base mint shape + TransferFeeConfig, split bps,
 *                       LP distribution, migration_quote_threshold) -> DEPLOYING
 *     -> createPool    (DBC creator.createPool: MINTS the taxed Token-2022 base
 *                       mint + writes metadata-pointer name/symbol/uri)
 *     -> persist success + flip ACTIVE
 *
 * Solana-only. `@solana/web3.js` v1. Every on-chain tx goes through the committed
 * `lib/solana/*` submit layer (serverSigner + ephemeral config/baseMint signers,
 * route 'sender', durable Upstash idempotency, fail-closed).
 *
 * GROUND TRUTH for SDK signatures: scripts/spikes/spike-b-meteora-dbc.ts
 * (`dynamic-bonding-curve-sdk@1.5.10` createConfig/createPool) — reused exactly.
 *
 * IMPORT-SAFE: the Meteora SDK + bn.js are imported at module top (dev-machine
 * dep list, per the binding contract). ALL env / network / keypair / treasury
 * access is INSIDE the exported functions — no top-level env reads or throws.
 *
 * ── TransferFeeConfig BLOCKER (D-launch §0.1, TODO #1) ──────────────────────
 * The DBC SDK mints the base mint inside createPool (D-launch §0). We attach our
 * Token-2022 TransferFeeConfig (bps/maxFee/authorities) via Path A — the curve
 * `token` config fields — IF 1.5.10 exposes them. The exact field names cannot be
 * confirmed offline (node_modules absent), so the transfer-fee fields are written
 * onto the TokenConfig under `TODO(verify-devnet)` and NEVER silently dropped:
 * if the SDK ignores unknown fields the mint is born UNTAXED and the whole tax
 * architecture is broken — this gates mainnet. See `buildTokenTransferFeeConfig`.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import BN from 'bn.js';

// Meteora DBC SDK (@meteora-ag/dynamic-bonding-curve-sdk@1.5.10) — top-level
// import per the contract (dev-machine dep list). Signatures verified verbatim
// in spike-b-meteora-dbc.ts.
import {
  DynamicBondingCurveClient,
  buildCurveWithMarketCap,
  deriveDbcPoolAddress,
  TokenType,
  TokenDecimal,
  TokenAuthorityOption,
  BaseFeeMode,
  CollectFeeMode,
  MigrationOption,
  MigrationFeeOption,
  MigratedCollectFeeMode,
  DammV2DynamicFeeMode,
  ActivationType,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

import { MOMENTO_FEE, MOMENTO_LAUNCH } from '@momento/shared';
import prisma from './prisma';
import {
  submit,
  serverSigner,
  ephemeralSigner,
  getServerWallet,
  getConnection,
  SolanaTxError,
  classify,
  type BuiltTx,
  type Signer,
} from './solana';

// ════════════════════════════════════════════════════════════════════════════
//  Public interface (CONTRACTS-P3A §b.1)
// ════════════════════════════════════════════════════════════════════════════

export interface LaunchTokenInput {
  creatorUserId: string;
  creatorWallet: string;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  totalSupply: string; // base-unit string; default "1000000000"
  decimals?: number; // 6..9; default 9
  transferFeeBps?: number; // 300..500; default MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS
  transferFeeMaxBaseUnits?: string;
  creatorTradingFeeBps?: number; // default 5000
  partnerTradingFeeBps?: number; // default 5000 (sum = 10000)
  fundraise: {
    targetUsd: number;
    initialMarketCapUsd?: number;
    partnerLockedLpPct?: number; // default 50
    partnerLpPct?: number; // default 0
    creatorLockedLpPct?: number; // default 50
    creatorLpPct?: number; // default 0
    minContributionBaseUnits?: string;
    maxContributionBaseUnits?: string;
  };
}

export interface LaunchResult {
  tokenId: string;
  mintAddress: string;
  dbcConfigKey: string;
  dbcPoolAddress: string;
  poolType: 'METEORA_DBC';
  status: 'DEPLOYING' | 'ACTIVE';
  configSignature: string;
  poolSignature: string;
}

export interface LaunchContext {
  input: LaunchTokenInput;
  configKeypair: Keypair; // ephemeralSigner()
  baseMintKeypair: Keypair; // ephemeralSigner()
  quoteMint: PublicKey; // MOMENTO_FEE.USDC_MINT
  feeClaimer: PublicKey; // MOMENTO_LP_FEE_CLAIMER
  metadataUri: string;
}

// ════════════════════════════════════════════════════════════════════════════
//  Internal resolved knobs
// ════════════════════════════════════════════════════════════════════════════

interface ResolvedKnobs {
  decimals: number;
  totalSupply: string; // base-unit string
  totalSupplyWhole: number; // whole tokens for the SDK builder (it scales by decimals)
  transferFeeBps: number;
  transferFeeMaxBaseUnits: string;
  creatorTradingFeeBps: number;
  partnerTradingFeeBps: number;
  initialMarketCapUsd: number;
  targetUsd: number;
  thresholdBaseUnits: string; // USDC base units of targetUsd
  migrationFeeBps: number;
  partnerLockedLpPct: number;
  partnerLpPct: number;
  creatorLockedLpPct: number;
  creatorLpPct: number;
}

const TEN = BigInt(10);

/**
 * Bonding-phase base trading fee (1% = 100 bps), matching spike-b BASE_FEE_BPS.
 * This is the curve-phase swap fee; Meteora keeps a flat PROTOCOL_FEE_BPS (20%)
 * of it and the remaining 80% is split partner/creator by
 * creatorTradingFeePercentage. Not a request knob in 3A (fixed).
 */
const BONDING_BASE_FEE_BPS = 100;

/** USDC base units of a whole-USD amount (floor). */
function usdToUsdcBaseUnits(usd: number): string {
  const scaled = Math.round(usd * 10 ** MOMENTO_FEE.USDC_DECIMALS);
  return BigInt(Math.max(0, scaled)).toString();
}

/** Map a 6..9 decimals number onto the DBC TokenDecimal enum (= the numeric value). */
function toTokenDecimalEnum(decimals: number): number {
  switch (decimals) {
    case 6:
      return TokenDecimal.SIX;
    case 7:
      return TokenDecimal.SEVEN;
    case 8:
      return TokenDecimal.EIGHT;
    case 9:
      return TokenDecimal.NINE;
    default:
      // launchTokenSchema already constrains 6..9; defend anyway.
      throw new SolanaTxError('SIMULATION_FAILED', `Unsupported token decimals: ${decimals} (must be 6..9)`);
  }
}

/** Resolve every knob + default exactly as D-launch §3 step 1. */
function resolveKnobs(input: LaunchTokenInput): ResolvedKnobs {
  const decimals = input.decimals ?? MOMENTO_LAUNCH.DEFAULT_DECIMALS;
  const totalSupply = input.totalSupply || MOMENTO_LAUNCH.DEFAULT_TOTAL_SUPPLY;

  // The SDK builder takes WHOLE tokens and scales by tokenBaseDecimal internally
  // (spike-b TOTAL_TOKEN_SUPPLY = 1_000_000_000 whole). Our `totalSupply` is a
  // base-unit string (schema regex /^[1-9]\d*$/, schema default "1000000000").
  // We treat the schema default as whole tokens (matches spike-b), and convert.
  const totalSupplyBig = BigInt(totalSupply);
  const totalSupplyWhole = Number(totalSupplyBig);

  const transferFeeBps = input.transferFeeBps ?? MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS;

  // maxFee: default to a NON-BINDING cap so the bps rate governs (spike-a sets
  // MAX_FEE deliberately high). Default = totalSupply base units (whole supply
  // worth — never binds for any single transfer). D-launch §3 step 1.
  const transferFeeMaxBaseUnits =
    input.transferFeeMaxBaseUnits ?? (totalSupplyBig * TEN ** BigInt(decimals)).toString();

  const creatorTradingFeeBps = input.creatorTradingFeeBps ?? MOMENTO_FEE.DEFAULT_CREATOR_TRADING_FEE_BPS;
  const partnerTradingFeeBps = input.partnerTradingFeeBps ?? MOMENTO_FEE.DEFAULT_PARTNER_TRADING_FEE_BPS;

  const initialMarketCapUsd =
    input.fundraise.initialMarketCapUsd ?? MOMENTO_LAUNCH.DEFAULT_INITIAL_MARKET_CAP_USD;
  const targetUsd = input.fundraise.targetUsd;

  return {
    decimals,
    totalSupply,
    totalSupplyWhole,
    transferFeeBps,
    transferFeeMaxBaseUnits,
    creatorTradingFeeBps,
    partnerTradingFeeBps,
    initialMarketCapUsd,
    targetUsd,
    thresholdBaseUnits: usdToUsdcBaseUnits(targetUsd),
    migrationFeeBps: MOMENTO_LAUNCH.DEFAULT_MIGRATION_FEE_BPS,
    partnerLockedLpPct: input.fundraise.partnerLockedLpPct ?? MOMENTO_LAUNCH.DEFAULT_PARTNER_LOCKED_LP_PCT,
    partnerLpPct: input.fundraise.partnerLpPct ?? 0,
    creatorLockedLpPct: input.fundraise.creatorLockedLpPct ?? MOMENTO_LAUNCH.DEFAULT_CREATOR_LOCKED_LP_PCT,
    creatorLpPct: input.fundraise.creatorLpPct ?? 0,
  };
}

// ── Treasury (Momento) addresses ────────────────────────────────────────────

/**
 * The Momento treasury PublicKey (Privy server wallet). Used as payer,
 * poolCreator (platform-action model, D-launch §3 step 4 default),
 * transferFee + withdrawWithheld authorities, and the LP-fee/leftover receiver
 * fallback. Resolved lazily (no top-level access).
 */
function treasuryPubkey(): PublicKey {
  return getServerWallet().address;
}

/**
 * Momento partner / feeClaimer / leftoverReceiver. Prefers MOMENTO_LP_FEE_CLAIMER
 * (the same env `lib/fees.ts` + the fee-claim cron read); falls back to treasury.
 */
function feeClaimerPubkey(): PublicKey {
  const env = process.env.MOMENTO_LP_FEE_CLAIMER?.trim();
  if (env) {
    try {
      return new PublicKey(env);
    } catch {
      throw new SolanaTxError('CONFIG_MISSING', `MOMENTO_LP_FEE_CLAIMER is not a valid base58 pubkey: ${env}`);
    }
  }
  return treasuryPubkey();
}

/** creator_trading_fee_percentage (0..100) derived from creatorTradingFeeBps. */
function creatorTradingFeePercentage(creatorTradingFeeBps: number): number {
  return Math.round((creatorTradingFeeBps / 10000) * 100);
}

// ════════════════════════════════════════════════════════════════════════════
//  TransferFeeConfig attachment — the BLOCKER (D-launch §0.1, TODO #1)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build the Token-2022 TransferFeeConfig fields to merge onto the DBC curve
 * `token` config (Path A — config-time extension, D-launch §0.1).
 *
 * TODO(verify-devnet) [BLOCKER — gates the whole tax architecture]:
 *   `@meteora-ag/dynamic-bonding-curve-sdk@1.5.10` must accept these transfer-fee
 *   fields on the TokenConfig so the base mint is born taxed in the same
 *   instruction set as createPool. The exact field names are NOT confirmable
 *   offline (the spike-b .d.ts excerpt did NOT enumerate transfer-fee fields).
 *   On devnet, inspect dist/index.d.ts TokenConfig / CreatePoolParams and:
 *     1. If the fields exist under different names, RENAME below.
 *     2. If they exist NESTED (e.g. token.transferFeeConfig = {...}), confirm shape.
 *     3. If 1.5.10 does NOT support a transfer-fee base mint at all, ESCALATE
 *        (D-launch §0.1 Path B escalation): a newer DBC SDK/program version, or
 *        tax via the DAMM-v2 post-graduation pool only. DO NOT silently ship an
 *        untaxed mint.
 *
 * We provide BOTH a flat-field shape and a nested `transferFeeConfig` object so
 * whichever the SDK reads is present; unknown keys on the other shape are
 * ignored by the SDK. The fee is therefore NEVER silently dropped here — if the
 * SDK ignores ALL of these the devnet mint will be untaxed and the verify step
 * above catches it before mainnet.
 */
function buildTokenTransferFeeConfig(knobs: ResolvedKnobs, authorities: {
  transferFeeConfigAuthority: PublicKey;
  withdrawWithheldAuthority: PublicKey;
}): Record<string, unknown> {
  const maxFee = new BN(knobs.transferFeeMaxBaseUnits);
  const transferFeeConfig = {
    transferFeeBasisPoints: knobs.transferFeeBps,
    maxFee, // BN (base units), matches spike-a maximumFee
    transferFeeConfigAuthority: authorities.transferFeeConfigAuthority,
    withdrawWithheldAuthority: authorities.withdrawWithheldAuthority,
  };
  return {
    // Nested shape (preferred guess):
    transferFeeConfig,
    // Flat-field shape (fallback guess) — harmless if the SDK ignores it:
    transferFeeBasisPoints: knobs.transferFeeBps,
    transferFeeMaxFee: maxFee,
    transferFeeConfigAuthority: authorities.transferFeeConfigAuthority,
    withdrawWithheldAuthority: authorities.withdrawWithheldAuthority,
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  Pure builders (no broadcast — return BuiltTx for submit())
// ════════════════════════════════════════════════════════════════════════════

let _client: DynamicBondingCurveClient | null = null;
function dbcClient(conn: Connection): DynamicBondingCurveClient {
  if (!_client) {
    _client = DynamicBondingCurveClient.create(conn, 'confirmed');
  }
  return _client;
}

/**
 * Build the DBC `createConfig` transaction (D-launch §3 step 3). Mirrors spike-b
 * STEP 1 exactly, plus the Path-A TransferFeeConfig fields and the request-driven
 * split / LP-distribution / migration knobs.
 *
 * Signers: serverSigner() (payer) + ephemeralSigner(configKeypair).
 */
export async function buildCreateConfigTx(ctx: LaunchContext): Promise<BuiltTx> {
  const conn = getConnection();
  const client = dbcClient(conn);
  const knobs = resolveKnobs(ctx.input);

  const treasury = treasuryPubkey();
  const transferFeeFields = buildTokenTransferFeeConfig(knobs, {
    transferFeeConfigAuthority: treasury,
    withdrawWithheldAuthority: treasury,
  });

  // buildCurveWithMarketCap returns a ConfigParameters bag to spread into
  // createConfig (spike-b lines 353-412). Knob mapping is verbatim spike-b.
  const curveConfig = buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.Token2022, // taxed Token-2022 base mint
      tokenBaseDecimal: toTokenDecimalEnum(knobs.decimals),
      tokenQuoteDecimal: TokenDecimal.SIX, // USDC = 6 decimals
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: knobs.totalSupplyWhole,
      leftover: 0,
      // ── Path A: born-taxed Token-2022 mint. TODO(verify-devnet) field names. ──
      ...transferFeeFields,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear, // fixed fee (same start/end, 0 periods)
        feeSchedulerParam: {
          startingFeeBps: BONDING_BASE_FEE_BPS, // 1% bonding-phase trading fee (spike-b BASE_FEE_BPS)
          endingFeeBps: BONDING_BASE_FEE_BPS,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken, // USDC-only (clean accounting)
      creatorTradingFeePercentage: creatorTradingFeePercentage(knobs.creatorTradingFeeBps),
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: migrationFeeOptionFromBps(knobs.migrationFeeBps),
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: knobs.migrationFeeBps,
      },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: knobs.partnerLockedLpPct,
      partnerLiquidityPercentage: knobs.partnerLpPct,
      creatorPermanentLockedLiquidityPercentage: knobs.creatorLockedLpPct,
      creatorLiquidityPercentage: knobs.creatorLpPct,
    },
    lockedVesting: {
      // No team/creator token vesting at launch (separate from LP locking).
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: knobs.initialMarketCapUsd,
    migrationMarketCap: knobs.targetUsd, // sets migration_quote_threshold (USDC)
  });

  const tx: Transaction = await client.partner.createConfig({
    config: ctx.configKeypair.publicKey,
    feeClaimer: ctx.feeClaimer, // Momento partner
    leftoverReceiver: ctx.feeClaimer, // Momento gets unsold/leftover base tokens
    quoteMint: ctx.quoteMint, // USDC
    payer: treasury,
    ...curveConfig,
  });

  const signers: Signer[] = [serverSigner(), ephemeralSigner(ctx.configKeypair)];
  return { tx, signers, label: 'dbc.createConfig' };
}

/**
 * Build the DBC `createPool` transaction (D-launch §3 step 4). This is the
 * instruction that MINTS the taxed Token-2022 base mint + writes metadata-pointer
 * name/symbol/uri (spike-b STEP 2/3). poolCreator = treasury (platform-action
 * default, D-launch §3 step 4) so the launch is fully server-signed.
 *
 * Signers: serverSigner() (payer + poolCreator) + ephemeralSigner(baseMintKeypair).
 */
export async function buildCreatePoolTx(ctx: LaunchContext): Promise<BuiltTx> {
  const conn = getConnection();
  const client = dbcClient(conn);
  const treasury = treasuryPubkey();

  const tx: Transaction = await client.creator.createPool({
    name: ctx.input.name,
    symbol: ctx.input.symbol,
    uri: ctx.metadataUri,
    payer: treasury,
    // Default (platform-action model): poolCreator = Momento treasury so the
    // launch is fully server-signed. The human creator is recorded via
    // TokenFeeConfig.creatorFeeWallet / creatorTradingFeeBps. To make the creator
    // literally own poolCreator, switch to the client-relay flow
    // (buildUnsignedForClient -> creator signs -> submitClientSigned). See
    // D-launch §3 step 4 + TODO(verify-devnet) poolCreator-must-sign.
    poolCreator: treasury,
    config: ctx.configKeypair.publicKey,
    baseMint: ctx.baseMintKeypair.publicKey,
  });

  // poolCreator === payer === treasury (one server signer) + baseMint ephemeral.
  const signers: Signer[] = [serverSigner(), ephemeralSigner(ctx.baseMintKeypair)];
  return { tx, signers, label: 'dbc.createPool' };
}

/** Map a graduated-pool swap-fee bps onto the DBC MigrationFeeOption tier. */
function migrationFeeOptionFromBps(bps: number): number {
  switch (bps) {
    case 25:
      return MigrationFeeOption.FixedBps25;
    case 30:
      return MigrationFeeOption.FixedBps30;
    case 100:
      return MigrationFeeOption.FixedBps100;
    case 200:
      return MigrationFeeOption.FixedBps200;
    case 400:
      return MigrationFeeOption.FixedBps400;
    case 600:
      return MigrationFeeOption.FixedBps600;
    default:
      // Default tier (1% = FixedBps100) for any unmapped value. Graduation reads
      // TokenFundraise.migrationFeeBps to pick the DAMM-v2 migration-fee address.
      return MigrationFeeOption.FixedBps100;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  Metadata (D-launch §3 step 1 / §0.2)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the off-chain metadata JSON URI the Token-2022 metadata pointer points
 * at (name/symbol/image/description). createPool writes the pointer extension.
 *
 * TODO(ops): pin a real metadata JSON ({name,symbol,description,image:imageUrl})
 * to durable storage (e.g. Supabase via lib/storage.ts, or IPFS) and return its
 * public URL. Until then we synthesize a deterministic placeholder URI from the
 * symbol so the launch is reproducible offline; this MUST resolve to a reachable
 * JSON before mainnet. (D-launch §3 step 1; TODO(verify-devnet) #2 metadata.)
 */
async function resolveMetadataUri(input: LaunchTokenInput): Promise<string> {
  // No network/storage call here (keeps the offline path import-safe + testable).
  const base = process.env.MOMENTO_METADATA_BASE_URL?.trim() || 'https://momento.app/metadata';
  const slug = input.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${base}/${slug}.json`;
}

// ════════════════════════════════════════════════════════════════════════════
//  Orchestration (D-launch §3 / §4)
// ════════════════════════════════════════════════════════════════════════════

type TokenRow = {
  id: string;
  status: string;
  mintAddress: string | null;
  dbcConfigKey: string | null;
  dbcPoolAddress: string | null;
  deployTxSignature: string | null;
};

/** Map a row to a finished LaunchResult (used by the DUPLICATE/idempotent path). */
function rowToResult(row: TokenRow, configSignature: string, poolSignature: string): LaunchResult {
  return {
    tokenId: row.id,
    mintAddress: row.mintAddress ?? '',
    dbcConfigKey: row.dbcConfigKey ?? '',
    dbcPoolAddress: row.dbcPoolAddress ?? '',
    poolType: 'METEORA_DBC',
    status: (row.status === 'ACTIVE' ? 'ACTIVE' : 'DEPLOYING') as 'ACTIVE' | 'DEPLOYING',
    configSignature,
    poolSignature,
  };
}

/**
 * Orchestrate the full launch (CONTRACTS-P3A §b.1; D-launch §3). Idempotent on
 * the creator: re-entrant by `@@unique([userId, chain])`. The CreatorToken row
 * (status + which of dbcConfigKey/dbcPoolAddress are set) is the resume anchor;
 * submit()'s durable Upstash store dedups each broadcast.
 *
 * Steps:
 *   2. persist PENDING (CreatorToken + TokenFeeConfig + TokenFundraise) in ONE tx
 *   3. createConfig (sender route) -> persist dbcConfigKey + DEPLOYING
 *   4. createPool   (sender route) -> mints taxed base mint
 *   5. persist mint/pool + flip ACTIVE
 *
 * Rollback (D-launch §4): never undo a landed on-chain account; on unrecoverable
 * failure mark the row FAILED and surface the SolanaTxError. The only
 * irreversible artifact (the taxed base mint) is created LAST, in createPool, so
 * a failed createConfig/createPool leaves no orphaned taxed mint.
 */
export async function launchCreatorToken(input: LaunchTokenInput): Promise<LaunchResult> {
  const knobs = resolveKnobs(input);
  const chain = 'solana';

  // ── Step 2: persist PENDING anchor (idempotent on @@unique([userId, chain])) ──
  // If a row already exists for this creator, RESUME from it (re-entrant launch);
  // otherwise create the PENDING anchor + fee config + fundraise in ONE tx.
  let token = await prisma.creatorToken.findUnique({
    where: { userId_chain: { userId: input.creatorUserId, chain } },
    select: tokenSelect,
  });

  if (!token) {
    const treasury = treasuryAddressOrNull();
    token = await prisma.$transaction(async (txdb) => {
      const created = await txdb.creatorToken.create({
        data: {
          userId: input.creatorUserId,
          chain,
          name: input.name,
          symbol: input.symbol,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          decimals: knobs.decimals,
          totalSupply: knobs.totalSupply,
          status: 'PENDING',
          poolType: 'METEORA_DBC',
          tokenProgram: 'TOKEN_2022',
          transferFeeBps: knobs.transferFeeBps,
          transferFeeMaxBaseUnits: knobs.transferFeeMaxBaseUnits,
          transferFeeAuthority: treasury,
          withdrawWithheldAuthority: treasury,
          quoteMint: MOMENTO_FEE.USDC_MINT,
          feeConfig: {
            create: {
              transferFeeBps: knobs.transferFeeBps,
              rebateTargetBps: MOMENTO_FEE.TARGET_IN_APP_BPS,
              creatorTradingFeeBps: knobs.creatorTradingFeeBps,
              partnerTradingFeeBps: knobs.partnerTradingFeeBps,
              protocolFeeBps: MOMENTO_FEE.PROTOCOL_FEE_BPS,
              feeClaimer: feeClaimerAddressOrNull(),
              creatorFeeWallet: input.creatorWallet,
              withdrawWithheldAuthority: treasury,
              rebateMint: MOMENTO_FEE.USDC_MINT,
            },
          },
          fundraise: {
            create: {
              status: 'DRAFT',
              quoteMint: MOMENTO_FEE.USDC_MINT,
              thresholdBaseUnits: knobs.thresholdBaseUnits,
              minContributionBaseUnits: input.fundraise.minContributionBaseUnits ?? null,
              maxContributionBaseUnits: input.fundraise.maxContributionBaseUnits ?? null,
              partnerLpBps: pctToBps(knobs.partnerLpPct),
              creatorLpBps: pctToBps(knobs.creatorLpPct),
              partnerLockedLpBps: pctToBps(knobs.partnerLockedLpPct),
              creatorLockedLpBps: pctToBps(knobs.creatorLockedLpPct),
              migrationFeeBps: knobs.migrationFeeBps,
              leftoverReceiver: feeClaimerAddressOrNull(),
            },
          },
        },
        select: tokenSelect,
      });
      return created;
    });
  }

  // If a prior run already fully completed, return it (DUPLICATE → 200).
  if (token.status === 'ACTIVE' && token.mintAddress && token.dbcConfigKey && token.dbcPoolAddress) {
    return rowToResult(token, token.deployTxSignature ?? '', token.deployTxSignature ?? '');
  }

  // A row left FAILED by a prior unrecoverable run: do not silently relaunch over
  // it (the @@unique slot is consumed). Surface so the route maps to 409/500.
  if (token.status === 'FAILED') {
    throw new SolanaTxError(
      'SIMULATION_FAILED',
      `A prior launch for this creator is in FAILED state (tokenId=${token.id}); manual ops review required before relaunch.`,
    );
  }

  // Ephemeral keypairs. NOTE (D-launch §4 TODO(verify-devnet) #4): on a fresh
  // process these are regenerated, so an in-process resume reuses them but a
  // cross-process resume would mint a DUPLICATE config/mint. submit()'s durable
  // idempotency store dedups a re-broadcast of the SAME built message, which
  // covers the common crash-after-broadcast case; persisting the secret keys
  // (encrypted, keyed by tokenId) to make cross-process resume safe is the open
  // ops item. We generate here and proceed (single-call launch is the norm).
  const configKeypair = Keypair.generate();
  const baseMintKeypair = Keypair.generate();

  const ctx: LaunchContext = {
    input,
    configKeypair,
    baseMintKeypair,
    quoteMint: new PublicKey(MOMENTO_FEE.USDC_MINT),
    feeClaimer: feeClaimerPubkey(),
    metadataUri: await resolveMetadataUri(input),
  };

  // ── Step 3: createConfig ──────────────────────────────────────────────────
  let configSignature: string;
  try {
    const builtConfig = await buildCreateConfigTx(ctx);
    const res = await submit(builtConfig, { route: 'sender', commitment: 'confirmed' });
    configSignature = res.signature;
  } catch (err) {
    const e = classify(err);
    // BLOCKHASH_EXPIRED / TIMEOUT are retriable: leave row PENDING (resume-able),
    // re-throw so the route returns 202 (DEPLOYING) without marking FAILED.
    if (e.retriable) throw e;
    await markFailed(token.id);
    throw e;
  }

  await prisma.creatorToken.update({
    where: { id: token.id },
    data: { status: 'DEPLOYING', dbcConfigKey: ctx.configKeypair.publicKey.toBase58() },
  });

  // ── Step 4: createPool (mints the taxed base mint) ────────────────────────
  let poolSignature: string;
  try {
    const builtPool = await buildCreatePoolTx(ctx);
    const res = await submit(builtPool, { route: 'sender', commitment: 'confirmed' });
    poolSignature = res.signature;
  } catch (err) {
    const e = classify(err);
    // Config landed; createPool failed. Because the base mint is minted INSIDE
    // createPool (D-launch §0/§4), a failed createPool means NO orphaned taxed
    // mint — only a benign stranded config. Retriable → keep DEPLOYING (202).
    if (e.retriable) throw e;
    await markFailed(token.id);
    throw e;
  }

  // ── Step 5: persist success + flip ACTIVE ─────────────────────────────────
  const mintAddress = ctx.baseMintKeypair.publicKey.toBase58();
  const dbcPoolAddress = derivePoolAddress(ctx).toBase58();

  const updated = await prisma.$transaction(async (txdb) => {
    const row = await txdb.creatorToken.update({
      where: { id: token!.id },
      data: {
        status: 'ACTIVE',
        mintAddress,
        dbcPoolAddress,
        poolAddress: dbcPoolAddress,
        poolType: 'METEORA_DBC',
        deployTxSignature: poolSignature,
        deployedAt: new Date(),
      },
      select: tokenSelect,
    });
    await txdb.tokenFundraise.update({
      where: { tokenId: token!.id },
      data: { status: 'ACTIVE' },
    });
    return row;
  });

  // Step 6 handoff (D-launch §3 step 6) — webhook/graduation ingest the new pool.
  // TODO(verify-devnet): confirm the Helius webhook is subscribed at the DBC
  // PROGRAM level (no per-pool registration) vs needs a per-pool address add on
  // launch. If per-pool, register `dbcPoolAddress` with the Helius subscription
  // here (ops seam). Not this module's persistence concern otherwise.

  return rowToResult(updated, configSignature, poolSignature);
}

// ── small persistence / derivation helpers ──────────────────────────────────

const tokenSelect = {
  id: true,
  status: true,
  mintAddress: true,
  dbcConfigKey: true,
  dbcPoolAddress: true,
  deployTxSignature: true,
} as const;

function pctToBps(pct: number): number {
  return Math.round(pct * 100);
}

/** Treasury address as base58 string, or null if unresolvable offline (stub/config). */
function treasuryAddressOrNull(): string | null {
  try {
    return treasuryPubkey().toBase58();
  } catch {
    return null;
  }
}

function feeClaimerAddressOrNull(): string | null {
  try {
    return feeClaimerPubkey().toBase58();
  } catch {
    return null;
  }
}

async function markFailed(tokenId: string): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.creatorToken.update({ where: { id: tokenId }, data: { status: 'FAILED' } }),
      prisma.tokenFundraise.update({ where: { tokenId }, data: { status: 'FAILED' } }),
    ]);
  } catch {
    // Best-effort: a DB failure during rollback must not mask the original error.
  }
}

/**
 * Deterministic virtual-pool address from quoteMint + baseMint + config
 * (spike-b resolvePoolAddress fallback; deriveDbcPoolAddress arg order verified
 * verbatim in spike-b line 691). No RPC — safe + idempotent on resume.
 * TODO(verify-devnet): confirm deriveDbcPoolAddress arg order against installed
 * 1.5.10 (spike-b TODO #5).
 */
function derivePoolAddress(ctx: LaunchContext): PublicKey {
  return deriveDbcPoolAddress(ctx.quoteMint, ctx.baseMintKeypair.publicKey, ctx.configKeypair.publicKey);
}
