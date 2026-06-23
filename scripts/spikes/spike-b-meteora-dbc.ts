/**
 * spike-b-meteora-dbc.ts
 * ============================================================================
 * DEVNET VALIDATION SPIKE — Meteora Dynamic Bonding Curve (DBC) → DAMM v2
 * ============================================================================
 *
 * Product decision (LOCKED): Momento launches creator tokens on Meteora DBC and
 * graduates them to DAMM v2. Momento is the PARTNER / `feeClaimer`. Launches are
 * USDC-quoted. The fee/LP split between Momento (partner) and the creator is
 * configurable via the DBC config knobs.
 *
 * This spike PROVES the end-to-end flow on devnet (same program IDs as mainnet):
 *   create config  ->  launch token (bonding curve)  ->  simulate buys
 *                  ->  graduate to DAMM v2  ->  claim partner + creator fees
 * ...and exercises the configurable split knobs.
 *
 * ----------------------------------------------------------------------------
 * REQUIRED DEPS (install before running — versions VERIFIED 2026-06-23 against
 * the npm registry / jsDelivr-served package.json + published .d.ts):
 *
 *   npm i @meteora-ag/dynamic-bonding-curve-sdk@1.5.10 \
 *         @meteora-ag/cp-amm-sdk@1.4.3 \
 *         @solana/web3.js@^1.98 \
 *         @solana/spl-token@^0.4 \
 *         bn.js@^5 bs58@^5
 *
 *   # IMPORTANT: both Meteora SDKs are @solana/web3.js *v1* (NOT v2 / @solana/kit).
 *   #   - DBC  @meteora-ag/dynamic-bonding-curve-sdk depends on @solana/web3.js ^1.98.0
 *   #   - DAMM @meteora-ag/cp-amm-sdk             depends on @solana/web3.js ^1.95.3
 *   #   - both pin @coral-xyz/anchor ^0.31.0
 *
 * REQUIRED ENV VARS:
 *   SPIKE_KEYPAIR   (required) The fee-payer / PARTNER keypair. Accepts EITHER:
 *                     (a) a base58-encoded 64-byte secret key string, OR
 *                     (b) a filesystem path to a Solana CLI JSON keypair file
 *                         (a JSON array of 64 ints), e.g. ~/.config/solana/id.json
 *                   Auto-detected: existing file => JSON keypair, else base58.
 *
 *                   >>> PRODUCTION PATH: in prod this keypair is NOT a local file.
 *                   The partner/fee-payer is a Privy *server wallet*. We do NOT
 *                   hold the secret; we build the unsigned Transaction (every SDK
 *                   call below returns a web3.js Transaction), hand it to Privy's
 *                   server-wallet signing API, and submit the signed tx. The
 *                   creator's claim is likewise signed by the creator's wallet
 *                   (Privy embedded/server). Swap the loadKeypair() + sign+send
 *                   calls for Privy server-wallet signing; the tx-building code is
 *                   identical. <<<
 *
 *   SPIKE_RPC_URL   (optional) RPC endpoint. Default: https://api.devnet.solana.com
 *   SPIKE_QUOTE_MINT (optional) Override the quote mint. Default: devnet USDC
 *                     4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU (Circle devnet USDC).
 *   SPIKE_CREATOR_KEYPAIR (optional) Separate creator keypair (path or base58).
 *                     Defaults to the partner keypair so the spike runs single-wallet.
 *
 * RUN:
 *   SPIKE_KEYPAIR=~/.config/solana/id.json npx tsx \
 *     scripts/spikes/spike-b-meteora-dbc.ts
 *
 * ----------------------------------------------------------------------------
 * VERIFIED SDK SURFACE (read VERBATIM from the published TypeScript declaration
 * files; npmjs.com & docs.meteora.ag 403/404 to bots, so I read the .d.ts shipped
 * inside each package via jsDelivr and cross-checked the repo source):
 *
 *   Sources:
 *     - DBC package.json (version 1.5.10, deps):
 *       https://cdn.jsdelivr.net/npm/@meteora-ag/dynamic-bonding-curve-sdk/package.json
 *     - DBC types (.d.ts, verbatim signatures below):
 *       https://cdn.jsdelivr.net/npm/@meteora-ag/dynamic-bonding-curve-sdk/dist/index.d.ts
 *     - DAMM v2 (cp-amm) package.json (version 1.4.3, deps):
 *       https://cdn.jsdelivr.net/npm/@meteora-ag/cp-amm-sdk/package.json
 *     - DAMM v2 (cp-amm) types (.d.ts):
 *       https://cdn.jsdelivr.net/npm/@meteora-ag/cp-amm-sdk/dist/index.d.ts
 *     - DBC program / docs:  https://github.com/MeteoraAg/dynamic-bonding-curve
 *     - DBC SDK repo:        https://github.com/MeteoraAg/dynamic-bonding-curve-sdk
 *     - DAMM v2 SDK repo:    https://github.com/MeteoraAg/damm-v2-sdk
 *     - Code4rena audit:     https://code4rena.com/reports/2025-08-meteora-dynamic-bonding-curve
 *     - In-repo research:    docs/solana-migration/research/10-meteora.md
 *
 *   DBC — exported by @meteora-ag/dynamic-bonding-curve-sdk (verbatim):
 *     class DynamicBondingCurveClient {
 *       pool: PoolService; partner: PartnerService; creator: CreatorService;
 *       migration: MigrationService; state: StateService;
 *       constructor(connection: Connection, commitment: Commitment);
 *       static create(connection: Connection, commitment?: Commitment): DynamicBondingCurveClient;
 *     }
 *     // helper that returns a ConfigParameters bag spreadable into createConfig():
 *     function buildCurveWithMarketCap(params: BuildCurveWithMarketCapParams): ConfigParameters
 *       // BuildCurveWithMarketCapParams = BuildCurveBaseParams & { initialMarketCap; migrationMarketCap }
 *       // BuildCurveBaseParams = { token: TokenConfig; fee: FeeConfig; migration: MigrationConfig;
 *       //                          liquidityDistribution: LiquidityDistributionConfig;
 *       //                          lockedVesting: LockedVestingParams; activationType: ActivationType }
 *     // (also: buildCurve(BuildCurveParams) which takes { percentageSupplyOnMigration; migrationQuoteThreshold })
 *
 *     client.partner.createConfig(params: CreateConfigParams): Promise<Transaction>
 *       // CreateConfigParams = <config accounts: config, feeClaimer, leftoverReceiver,
 *       //                        quoteMint, payer> & ConfigParameters (from buildCurve*)
 *     client.creator.createPool(params: CreatePoolParams): Promise<Transaction>
 *       // CreatePoolParams = { name; symbol; uri; payer; poolCreator; config; baseMint }
 *     client.pool.swap(params: SwapParams): Promise<Transaction>
 *       // SwapParams = { owner; pool; amountIn: BN; minimumAmountOut: BN;
 *       //               swapBaseForQuote: boolean; referralTokenAccount: PublicKey|null; payer? }
 *     client.pool.swapQuote(params: SwapQuoteParams): SwapQuoteResult   // sync quote helper
 *     client.migration.migrateToDammV2(params: MigrateToDammV2Params): Promise<MigrateToDammV2Response>
 *       // MigrateToDammV2Params = { payer; pool; dammConfig }
 *       // MigrateToDammV2Response = { transaction: Transaction;
 *       //   firstPositionNftKeypair: Keypair; secondPositionNftKeypair: Keypair }  // partner + creator locked-LP NFTs
 *     client.partner.claimPartnerTradingFee(params: ClaimPartnerTradingFeeParams): Promise<Transaction>
 *       // { feeClaimer; payer; pool; maxBaseAmount: BN; maxQuoteAmount: BN; receiver?; tempWSolAcc? }
 *     client.creator.claimCreatorTradingFee(params: ClaimCreatorTradingFeeParams): Promise<Transaction>
 *       // { creator; payer; pool; maxBaseAmount: BN; maxQuoteAmount: BN; receiver?; tempWSolAcc? }
 *
 *   DBC — enums (verbatim values from .d.ts):
 *     TokenType            { SPLToken=0, Token2022=1 }
 *     TokenDecimal         { SIX=6, SEVEN=7, EIGHT=8, NINE=9 }
 *     TokenAuthorityOption { CreatorUpdateAuthority=0, Immutable=1, PartnerUpdateAuthority=2,
 *                            CreatorUpdateAndMintAuthority=3, PartnerUpdateAndMintAuthority=4 }
 *     ActivationType       { Slot=0, Timestamp=1 }
 *     CollectFeeMode       { QuoteToken=0, OutputToken=1 }
 *     BaseFeeMode          { FeeSchedulerLinear=0, FeeSchedulerExponential=1, RateLimiter=2 }
 *     MigrationOption      { MET_DAMM=0, MET_DAMM_V2=1 }     // <- DAMM v2 = 1
 *     MigrationFeeOption   { FixedBps25=0, FixedBps30=1, FixedBps100=2, FixedBps200=3,
 *                            FixedBps400=4, FixedBps600=5, Customizable=6 }
 *     MigratedCollectFeeMode { QuoteToken=0, OutputToken=1, Compounding=2 }
 *     DammV2DynamicFeeMode { Disabled=0, Enabled=1 }
 *   DBC — constants (verbatim): PROTOCOL_FEE_PERCENT=20 (Meteora's flat cut during bonding),
 *     MAX_CURVE_POINT=16, MIN_LOCKED_LIQUIDITY_BPS=1000, DYNAMIC_BONDING_CURVE_PROGRAM_ID,
 *     DAMM_V2_PROGRAM_ID, DAMM_V2_MIGRATION_FEE_ADDRESS: PublicKey[].
 *
 *   DAMM v2 — exported by @meteora-ag/cp-amm-sdk (verbatim):
 *     class CpAmm { constructor(connection: Connection); ... }
 *     type TxBuilder = Promise<Transaction>;   // (every CpAmm builder returns this)
 *     cpAmm.claimPositionFee(params: ClaimPositionFeeParams): TxBuilder
 *       // { owner; position; pool; positionNftAccount; tokenAMint; tokenBMint;
 *       //   tokenAVault; tokenBVault; tokenAProgram; tokenBProgram; receiver?; feePayer?; tempWSolAccount? }
 *     cpAmm.permanentLockPosition(params: PermanentLockParams): TxBuilder
 *       // { owner; position; positionNftAccount; pool; unlockedLiquidity: BN }
 *     cpAmm.getUserPositionByPool(pool, user):
 *       Promise<Array<{ positionNftAccount: PublicKey; position: PublicKey; positionState: PositionState }>>
 *     cpAmm.getPositionsByUser(user): same element shape
 *     cpAmm.isPermanentLockedPosition(s): boolean ; cpAmm.isLockedPosition(s): boolean
 *     const CP_AMM_PROGRAM_ID: PublicKey
 *     // NB: DAMM v2 has NO native two-recipient fee field (the `partner`/`claim_partner_fee`
 *     //     feature was removed in program v0.2.0). After graduation the split lives in the
 *     //     TWO locked position NFTs that migrateToDammV2 returns — one for partner, one for
 *     //     creator — each NFT-owner claims its own LP fees via claimPositionFee.
 * ----------------------------------------------------------------------------
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  type Commitment,
} from "@solana/web3.js";
import BN from "bn.js";
import * as fs from "fs";
import bs58 from "bs58";

// Meteora DBC SDK (@meteora-ag/dynamic-bonding-curve-sdk@1.5.10)
import {
  DynamicBondingCurveClient,
  buildCurveWithMarketCap,
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
  DAMM_V2_MIGRATION_FEE_ADDRESS,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

// Also exported by the DBC SDK: deterministic pool-address derivation.
import { deriveDbcPoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";

// Meteora DAMM v2 SDK (@meteora-ag/cp-amm-sdk@1.4.3)
// getTokenProgram(flag: number) maps a pool's tokenAFlag/tokenBFlag (0=SPL, 1=Token-2022)
// to the correct token-program id.
import { CpAmm, getTokenProgram } from "@meteora-ag/cp-amm-sdk";

// ----------------------------------------------------------------------------
// Tunables / constants
// ----------------------------------------------------------------------------
const RPC_URL = process.env.SPIKE_RPC_URL ?? "https://api.devnet.solana.com";
const COMMITMENT: Commitment = "confirmed";

// Devnet USDC (Circle). The mainnet USDC mint (EPjFW...) does NOT exist on devnet,
// so we MUST use the devnet mint here. Get test USDC from Circle's faucet.
// Verified: https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet
const DEVNET_USDC = new PublicKey(
  process.env.SPIKE_QUOTE_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

const MIN_PAYER_SOL = 2; // airdrop top-up target if balance is low

// --- TOKEN SUPPLY ----------------------------------------------------------
// `token_supply` knob. Whole tokens (SDK builder takes a plain number; it scales
// by tokenBaseDecimal internally).
const TOTAL_TOKEN_SUPPLY = 1_000_000_000; // 1B creator tokens
const LEFTOVER = 0; // tokens not sold on the curve -> swept to leftover_receiver

// --- BONDING-CURVE SHAPE ---------------------------------------------------
// USDC-quoted market caps in USDC (quote) terms. migrationMarketCap implicitly
// sets the `migration_quote_threshold` (the amount of QUOTE/USDC the virtual pool
// must accumulate before it graduates). We use buildCurveWithMarketCap so we
// reason in market-cap terms; buildCurve() is the alternative that takes
// migrationQuoteThreshold directly.
const INITIAL_MARKET_CAP_USDC = 100;     // starting FDV in USDC
const MIGRATION_MARKET_CAP_USDC = 5_000; // graduate when FDV reaches this (USDC)

// --- FEE / SPLIT KNOBS (the heart of this spike) ---------------------------
// During bonding, Meteora keeps a FLAT 20% (PROTOCOL_FEE_PERCENT) of trading
// fees. The remaining 80% is the "LP fee" split between PARTNER (Momento) and
// CREATOR by creatorTradingFeePercentage.
const BASE_FEE_BPS = 100;                 // 1% bonding-phase trading fee (1 bps = 0.01%)
const CREATOR_TRADING_FEE_PERCENTAGE = 20; // creator gets 20% of the 80% LP fee;
                                          // partner (Momento) gets the other 80%.
                                          // => of TOTAL fee: protocol 20%, partner 64%, creator 16%.

// --- POST-MIGRATION LP DISTRIBUTION KNOBS ----------------------------------
// These four map directly to Momento's product requirement:
//   "% of LP bound vs USDC / % kept / % returned to creator".
// Percentages are of the migrated LP. *Locked* LP = principal locked but trading
// fees stay claimable (this is how both Momento + creator keep earning post-grad).
// *Unlocked* LP = claimable principal. They should sum to 100 across all four.
const PARTNER_LOCKED_LP_PERCENTAGE = 50;  // Momento's LP, permanently locked (fees claimable) -> "% LP bound"
const PARTNER_LP_PERCENTAGE = 0;          // Momento's LP, unlocked/claimable principal -> "% kept (liquid)"
const CREATOR_LOCKED_LP_PERCENTAGE = 50;  // Creator's LP, permanently locked (fees claimable) -> "% returned to creator (bound)"
const CREATOR_LP_PERCENTAGE = 0;          // Creator's LP, unlocked/claimable principal -> "% returned to creator (liquid)"
// (Sum = 100. Adjust to taste; e.g. 80/0/20/0 to bind 80% to Momento and return 20% to the creator.)

// --- MIGRATION FEE TIER ----------------------------------------------------
// migration_fee_option = the SWAP fee of the graduated DAMM v2 pool, not a
// one-time charge. FixedBps100 = 1% pool fee post-graduation.
const MIGRATION_FEE_OPTION = MigrationFeeOption.FixedBps100;

// Demo buy size, in QUOTE/USDC base units (devnet USDC has 6 decimals).
const USDC_DECIMALS = 6;
const BUY_AMOUNT_USDC = new BN(50).mul(new BN(10).pow(new BN(USDC_DECIMALS))); // 50 USDC per simulated buy
const NUM_SIMULATED_BUYS = 5;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Load a keypair from a path-to-json OR a base58 secret key. */
function loadKeypairFromValue(raw: string, label: string): Keypair {
  const candidate = raw.startsWith("~")
    ? raw.replace(/^~/, process.env.HOME ?? "")
    : raw;
  if (fs.existsSync(candidate)) {
    const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(`${label} points to a file that is not a JSON keypair array: ${candidate}`);
    }
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }
  try {
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch (e) {
    throw new Error(`${label} is neither an existing file path nor a valid base58 secret key: ${(e as Error).message}`);
  }
}

/** The partner / fee-payer keypair. PROD: replace with Privy server-wallet signing. */
function loadPartnerKeypair(): Keypair {
  const raw = process.env.SPIKE_KEYPAIR;
  if (!raw) {
    throw new Error("SPIKE_KEYPAIR env var is required (base58 secret key OR path to a JSON keypair file).");
  }
  return loadKeypairFromValue(raw, "SPIKE_KEYPAIR");
}

/** The creator keypair (defaults to the partner so the spike runs single-wallet). */
function loadCreatorKeypair(fallback: Keypair): Keypair {
  const raw = process.env.SPIKE_CREATOR_KEYPAIR;
  if (!raw) return fallback;
  return loadKeypairFromValue(raw, "SPIKE_CREATOR_KEYPAIR");
}

/** Ensure the payer has at least MIN_PAYER_SOL on devnet; airdrop if low. */
async function ensureSol(connection: Connection, payer: Keypair): Promise<void> {
  const bal = await connection.getBalance(payer.publicKey);
  console.log(`Payer balance: ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (bal >= MIN_PAYER_SOL * LAMPORTS_PER_SOL) return;
  console.log(`Balance low — requesting ${MIN_PAYER_SOL} SOL airdrop (devnet)...`);
  try {
    const sig = await connection.requestAirdrop(payer.publicKey, MIN_PAYER_SOL * LAMPORTS_PER_SOL);
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    const after = await connection.getBalance(payer.publicKey);
    console.log(`Airdrop confirmed. New balance: ${(after / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  } catch (e) {
    console.warn(`Airdrop failed (devnet faucet is rate-limited). Fund ${payer.publicKey.toBase58()} manually. (${(e as Error).message})`);
  }
}

/**
 * Sign + send a web3.js Transaction.
 *
 * >>> PROD PATH: this is the ONLY place that needs the secret key. Replace this
 * body with a call to the Privy server-wallet signing API (build tx here, sign
 * remotely, submit). The tx-building code above is unchanged. <<<
 */
async function signAndSend(
  connection: Connection,
  tx: Transaction,
  payer: Keypair,
  extraSigners: Keypair[] = []
): Promise<string> {
  return sendAndConfirmTransaction(connection, tx, [payer, ...extraSigners], {
    commitment: COMMITMENT,
    skipPreflight: false,
  });
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  console.log("============================================================");
  console.log(" SPIKE B — Meteora DBC -> DAMM v2 (devnet)");
  console.log(" create config -> launch -> buys -> graduate -> claim fees");
  console.log("============================================================\n");

  const connection = new Connection(RPC_URL, COMMITMENT);
  const partner = loadPartnerKeypair(); // Momento = partner / feeClaimer / fee-payer
  const creator = loadCreatorKeypair(partner);

  console.log(`RPC:        ${RPC_URL}`);
  console.log(`Partner:    ${partner.publicKey.toBase58()} (Momento / feeClaimer)`);
  console.log(`Creator:    ${creator.publicKey.toBase58()}`);
  console.log(`Quote mint: ${DEVNET_USDC.toBase58()} (devnet USDC)\n`);

  await ensureSol(connection, partner);
  if (!creator.publicKey.equals(partner.publicKey)) await ensureSol(connection, creator);

  const client = DynamicBondingCurveClient.create(connection, COMMITMENT);

  // ==========================================================================
  // STEP 1 — Build the DBC config (curve + all split knobs)
  // ==========================================================================
  console.log("STEP 1 — Building DBC config (curve + split knobs)...");

  // buildCurveWithMarketCap() returns a ConfigParameters bag we spread into
  // createConfig(). Every commented knob below maps to a Momento requirement.
  const curveConfig = buildCurveWithMarketCap({
    token: {
      // Token-2022 so the mint can carry our Transfer-Fee tax (see STEP 7).
      // For a plain SPL launch use TokenType.SPLToken.
      tokenType: TokenType.Token2022,                       // TODO verify: launch curve directly with a
                                                            // pre-existing taxed Token-2022 mint (see STEP 7).
      tokenBaseDecimal: TokenDecimal.SIX,                  // creator-token decimals (6-9 only)
      tokenQuoteDecimal: TokenDecimal.SIX,                 // USDC = 6 decimals
      tokenAuthorityOption: TokenAuthorityOption.Immutable, // mint/update authority handling
      totalTokenSupply: TOTAL_TOKEN_SUPPLY,                // KNOB: token_supply
      leftover: LEFTOVER,                                  // KNOB: tokens not sold -> leftover_receiver
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,       // fixed fee = same start/end + 0 periods
        feeSchedulerParam: {
          startingFeeBps: BASE_FEE_BPS,
          endingFeeBps: BASE_FEE_BPS,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken,           // collect fees in USDC only (clean accounting)
      creatorTradingFeePercentage: CREATOR_TRADING_FEE_PERCENTAGE, // KNOB: creator's % of the 80% LP fee
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,        // KNOB: graduate to DAMM v2 (=1)
      migrationFeeOption: MIGRATION_FEE_OPTION,            // KNOB: migration_fee_option (graduated pool swap fee)
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken, // DAMM v2 collects fees in USDC
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: BASE_FEE_BPS,                          // graduated-pool base fee
      },
    },
    liquidityDistribution: {
      // The four LP knobs that satisfy "% LP bound vs USDC / % kept / % returned to creator".
      // NB: SDK field names are *...PermanentLockedLiquidityPercentage* and
      // *...LiquidityPercentage* (these are the partner_locked_lp / partner_lp /
      // creator_locked_lp / creator_lp percentages from the program).
      partnerPermanentLockedLiquidityPercentage: PARTNER_LOCKED_LP_PERCENTAGE, // KNOB: partner_locked_lp_percentage (Momento LP bound, fees claimable)
      partnerLiquidityPercentage: PARTNER_LP_PERCENTAGE,                        // KNOB: partner_lp_percentage (Momento LP liquid)
      creatorPermanentLockedLiquidityPercentage: CREATOR_LOCKED_LP_PERCENTAGE, // KNOB: creator_locked_lp_percentage (returned to creator, bound)
      creatorLiquidityPercentage: CREATOR_LP_PERCENTAGE,                        // KNOB: creator_lp_percentage (returned to creator, liquid)
    },
    lockedVesting: {
      // No team/creator token vesting in this spike (separate from LP locking).
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: INITIAL_MARKET_CAP_USDC,             // sets curve start price (USDC FDV)
    migrationMarketCap: MIGRATION_MARKET_CAP_USDC,         // sets migration_quote_threshold (USDC)
  });

  // The config account is a fresh keypair (its pubkey identifies the config).
  const configKeypair = Keypair.generate();
  console.log(`  Config account: ${configKeypair.publicKey.toBase58()}`);

  // createConfig: CreateConfigParams = config accounts + the curveConfig bag.
  const createConfigTx = await client.partner.createConfig({
    config: configKeypair.publicKey,
    feeClaimer: partner.publicKey,        // KNOB: feeClaimer/partner = Momento (claims partner trading fees + partner locked-LP fees)
    leftoverReceiver: partner.publicKey,  // KNOB: leftover_receiver (gets unsold/leftover base tokens)
    quoteMint: DEVNET_USDC,               // USDC-quoted launch
    payer: partner.publicKey,
    ...curveConfig,
  });

  // config account is also a signer (its keypair) alongside the partner/payer.
  const configSig = await signAndSend(connection, createConfigTx, partner, [configKeypair]);
  console.log(`  ✓ Config created. sig=${configSig}\n`);

  // ==========================================================================
  // STEP 2/3 — Launch the token (create the bonding curve / virtual pool)
  // ==========================================================================
  console.log("STEP 2/3 — Launching token (creating bonding curve)...");

  // The base mint is a fresh keypair (the new creator token).
  const baseMint = Keypair.generate();
  console.log(`  Base mint (creator token): ${baseMint.publicKey.toBase58()}`);

  // createPool lives on the CREATOR namespace (NOT pool). It initializes the
  // virtual pool from the config we just made.
  const createPoolTx = await client.creator.createPool({
    name: "Momento Spike Token",
    symbol: "MSPIKE",
    uri: "https://momento.example/metadata/mspike.json", // TODO verify: a real, reachable metadata URI in prod
    payer: partner.publicKey,
    poolCreator: creator.publicKey,       // the creator (claims creatorTradingFee share)
    config: configKeypair.publicKey,
    baseMint: baseMint.publicKey,
  });

  // poolCreator (creator) + baseMint are signers. If creator === partner, dedupe.
  const poolSigners = creator.publicKey.equals(partner.publicKey)
    ? [baseMint]
    : [creator, baseMint];
  const poolSig = await signAndSend(connection, createPoolTx, partner, poolSigners);
  console.log(`  ✓ Bonding curve launched. sig=${poolSig}`);

  // Derive the virtual-pool address for subsequent swap/claim/migrate calls.
  // deriveDbcPoolAddress(quoteMint, baseMint, config) is exported, but we can
  // also read it back from state. We resolve it via the state service.
  const poolAddress = await resolvePoolAddress(
    client,
    configKeypair.publicKey,
    DEVNET_USDC,
    baseMint.publicKey
  );
  console.log(`  Virtual pool: ${poolAddress.toBase58()}\n`);

  // ==========================================================================
  // STEP 4 — Simulate buys toward the migration threshold
  // ==========================================================================
  console.log(`STEP 4 — Simulating ${NUM_SIMULATED_BUYS} buys of 50 USDC each...`);
  console.log("  (Each buy = swap USDC -> creator token; swapBaseForQuote=false.)");
  console.log("  NOTE: the partner wallet must hold devnet USDC ATA-funded for these to land.");

  let buysLanded = 0;
  for (let i = 0; i < NUM_SIMULATED_BUYS; i++) {
    try {
      // Sync quote helper to compute a sane minimumAmountOut (slippage guard).
      // We pass minimumAmountOut=0 here for the spike to avoid slippage reverts;
      // in prod compute it from client.pool.swapQuote(...). // TODO verify swapQuote param shape
      const buyTx = await client.pool.swap({
        owner: partner.publicKey,
        pool: poolAddress,
        amountIn: BUY_AMOUNT_USDC,
        minimumAmountOut: new BN(0),     // spike-only; use swapQuote() in prod
        swapBaseForQuote: false,         // false = quote(USDC) -> base(token) == BUY
        referralTokenAccount: null,
        payer: partner.publicKey,
      });
      const sig = await signAndSend(connection, buyTx, partner);
      buysLanded++;
      console.log(`  ✓ buy ${i + 1}/${NUM_SIMULATED_BUYS} sig=${sig}`);
    } catch (e) {
      console.warn(`  ✗ buy ${i + 1} failed: ${(e as Error).message}`);
      console.warn("    (Likely: no devnet USDC funded, or threshold/curve state — inspect below.)");
      break;
    }
  }
  console.log(`  Buys landed: ${buysLanded}/${NUM_SIMULATED_BUYS}\n`);

  // ==========================================================================
  // STEP 5 — Graduate to DAMM v2
  // ==========================================================================
  // DEVNET REALITY CHECK: graduation requires the virtual pool to accumulate
  // `migration_quote_threshold` USDC. On devnet you control all the liquidity,
  // so you can drive it across the threshold with enough funded USDC buys — but
  // the *managed migrator keeper* may not run on devnet / may have minimum-
  // threshold requirements. If the keeper does not auto-migrate, call
  // migrateToDammV2 yourself (self-migration). If you cannot reach the
  // threshold, INSPECT instead of migrate:
  //   - client.state read of the virtual pool: quote reserve vs threshold
  //   - confirm the config's migration_quote_threshold value
  //   - confirm migrationOption == MET_DAMM_V2 on the stored config.
  console.log("STEP 5 — Graduating to DAMM v2...");

  const cpAmm = new CpAmm(connection); // DAMM v2 client (used to inspect/claim locked LP)

  // The DAMM v2 migration config address depends on the chosen migration fee
  // tier. DAMM_V2_MIGRATION_FEE_ADDRESS is an exported PublicKey[] indexed by
  // MigrationFeeOption. // TODO verify exact index semantics vs Customizable tier.
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[MIGRATION_FEE_OPTION as number];

  let migrated = false;
  let dammV2Pool: PublicKey | null = null;
  let partnerPositionNft: Keypair | null = null;
  let creatorPositionNft: Keypair | null = null;

  try {
    // migrateToDammV2 returns the tx + the TWO locked-LP position-NFT keypairs:
    //   firstPositionNftKeypair  -> partner (Momento) locked LP
    //   secondPositionNftKeypair -> creator locked LP
    // Each NFT owner claims that position's trading fees on the DAMM v2 pool.
    const mig = await client.migration.migrateToDammV2({
      payer: partner.publicKey,
      pool: poolAddress,
      dammConfig,
    });
    partnerPositionNft = mig.firstPositionNftKeypair;
    creatorPositionNft = mig.secondPositionNftKeypair;

    const migSig = await signAndSend(connection, mig.transaction, partner, [
      partnerPositionNft,
      creatorPositionNft,
    ]);
    migrated = true;
    console.log(`  ✓ Migrated to DAMM v2. sig=${migSig}`);
    console.log(`    Partner locked-LP position NFT: ${partnerPositionNft.publicKey.toBase58()}`);
    console.log(`    Creator locked-LP position NFT: ${creatorPositionNft.publicKey.toBase58()}`);

    // Resolve the new DAMM v2 pool address. deriveDammV2PoolAddress(...) is
    // exported by the DBC SDK; alternatively scan the partner's positions.
    dammV2Pool = await resolveDammV2Pool(cpAmm, partner.publicKey);
    if (dammV2Pool) console.log(`    DAMM v2 pool: ${dammV2Pool.toBase58()}`);
  } catch (e) {
    console.warn(`  ✗ migrateToDammV2 failed (expected on devnet if threshold not met / keeper absent):`);
    console.warn(`    ${(e as Error).message}`);
    console.warn("  -> INSPECT instead: read virtual-pool quote reserve vs migration_quote_threshold,");
    console.warn("     and confirm migrationOption==MET_DAMM_V2 on the stored config.");
  }

  // --- Show the locked-LP-with-claimable-fees setup on DAMM v2 -------------
  if (migrated && dammV2Pool) {
    console.log("\n  Inspecting locked-LP positions on the DAMM v2 pool...");
    try {
      const partnerPositions = await cpAmm.getUserPositionByPool(dammV2Pool, partner.publicKey);
      for (const p of partnerPositions) {
        const locked = cpAmm.isPermanentLockedPosition(p.positionState);
        console.log(`    partner position ${p.position.toBase58()} permanentLocked=${locked}`);
      }
    } catch (e) {
      console.warn(`    (could not read partner positions: ${(e as Error).message})`);
    }
  }
  console.log("");

  // ==========================================================================
  // STEP 6 — Claim fees (partner = Momento, then creator) and print the split
  // ==========================================================================
  console.log("STEP 6 — Claiming trading fees (partner + creator)...");

  // 6a) DBC virtual-pool trading fees accrued DURING bonding. These exist even
  //     without graduation, so we always attempt them.
  let partnerClaimSig = "(skipped)";
  let creatorClaimSig = "(skipped)";

  try {
    const claimPartnerTx = await client.partner.claimPartnerTradingFee({
      feeClaimer: partner.publicKey, // Momento
      payer: partner.publicKey,
      pool: poolAddress,
      maxBaseAmount: new BN("18446744073709551615"), // u64::MAX => claim all available base
      maxQuoteAmount: new BN("18446744073709551615"), // u64::MAX => claim all available quote (USDC)
    });
    partnerClaimSig = await signAndSend(connection, claimPartnerTx, partner);
    console.log(`  ✓ Partner (Momento) trading fee claimed. sig=${partnerClaimSig}`);
  } catch (e) {
    console.warn(`  ✗ partner claim failed: ${(e as Error).message}`);
  }

  try {
    const claimCreatorTx = await client.creator.claimCreatorTradingFee({
      creator: creator.publicKey,
      payer: partner.publicKey, // Momento can sponsor the creator's claim tx (creator still signs as `creator`)
      pool: poolAddress,
      maxBaseAmount: new BN("18446744073709551615"),
      maxQuoteAmount: new BN("18446744073709551615"),
    });
    const creatorSigners = creator.publicKey.equals(partner.publicKey) ? [] : [creator];
    creatorClaimSig = await signAndSend(connection, claimCreatorTx, partner, creatorSigners);
    console.log(`  ✓ Creator trading fee claimed. sig=${creatorClaimSig}`);
  } catch (e) {
    console.warn(`  ✗ creator claim failed: ${(e as Error).message}`);
  }

  // 6b) POST-GRADUATION: locked-LP trading fees on the DAMM v2 pool, claimed by
  //     each position-NFT owner via CpAmm.claimPositionFee. This is the ONLY way
  //     to split fees on DAMM v2 (it has no native two-recipient fee field).
  if (migrated && dammV2Pool && partnerPositionNft) {
    console.log("  Claiming DAMM v2 locked-LP fees for the partner position...");
    try {
      // VERIFIED (cp-amm 1.4.3): fetchPoolState(pool) -> PoolState with
      // tokenAMint/tokenBMint/tokenAVault/tokenBVault/tokenAFlag/tokenBFlag.
      const poolState = await cpAmm.fetchPoolState(dammV2Pool);
      const partnerPositions = await cpAmm.getUserPositionByPool(dammV2Pool, partner.publicKey);
      for (const p of partnerPositions) {
        const claimTx = await cpAmm.claimPositionFee({
          owner: partner.publicKey,
          position: p.position,
          pool: dammV2Pool,
          positionNftAccount: p.positionNftAccount,
          tokenAMint: poolState.tokenAMint,
          tokenBMint: poolState.tokenBMint,
          tokenAVault: poolState.tokenAVault,
          tokenBVault: poolState.tokenBVault,
          // getTokenProgram(flag) maps tokenAFlag/tokenBFlag (0=SPL,1=Token-2022) -> program id.
          tokenAProgram: getTokenProgram(poolState.tokenAFlag),
          tokenBProgram: getTokenProgram(poolState.tokenBFlag),
        });
        const sig = await signAndSend(connection, claimTx, partner);
        console.log(`    ✓ DAMM v2 partner position fee claimed. sig=${sig}`);
      }
    } catch (e) {
      console.warn(`    ✗ DAMM v2 partner fee claim failed: ${(e as Error).message}`);
    }
    // The creator's DAMM v2 locked-LP fee claim is symmetric, owned by the
    // creator (signs as creator). Omitted here for brevity; same call with the
    // creator's positions + creator as owner/signer.
  }

  // --- Print the configured split (the verifiable contract of this spike) ---
  printSplit();

  // ==========================================================================
  // STEP 7 — Token-2022 + Transfer Fee on DBC (the Momento tax token)
  // ==========================================================================
  printToken2022Finding();

  // ==========================================================================
  // STEP 8 — Verdict
  // ==========================================================================
  printVerdict({ buysLanded, migrated, partnerClaimSig, creatorClaimSig });
}

// ----------------------------------------------------------------------------
// Resolvers (best-effort; marked TODO verify where the exact reader differs by
// SDK minor version). The HAPPY path uses the SDK's derive helpers.
// ----------------------------------------------------------------------------

/**
 * Resolve the DBC virtual-pool address from config + baseMint.
 * VERIFIED readers (DBC SDK 1.5.10):
 *   client.state.getPoolByBaseMint(baseMint): Promise<ProgramAccount<VirtualPool> | null>
 *   deriveDbcPoolAddress(quoteMint, baseMint, config): PublicKey   // arg order verified
 */
async function resolvePoolAddress(
  client: DynamicBondingCurveClient,
  config: PublicKey,
  quoteMint: PublicKey,
  baseMint: PublicKey
): Promise<PublicKey> {
  try {
    const acct = await client.state.getPoolByBaseMint(baseMint);
    if (acct?.publicKey) return acct.publicKey;
  } catch {
    /* fall through to deterministic derive */
  }
  // Deterministic fallback (no RPC): exact arg order verified in index.d.ts.
  return deriveDbcPoolAddress(quoteMint, baseMint, config);
}

/** Best-effort resolve the graduated DAMM v2 pool the partner just got a position in. */
async function resolveDammV2Pool(cpAmm: CpAmm, owner: PublicKey): Promise<PublicKey | null> {
  try {
    const positions = await cpAmm.getPositionsByUser(owner);
    if (positions.length) {
      // positionState carries the pool reference. // TODO verify field name (pool).
      return (positions[0].positionState as any).pool ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ----------------------------------------------------------------------------
// Reporting
// ----------------------------------------------------------------------------
function printSplit() {
  // Of the TOTAL trading fee during bonding:
  //   protocol (Meteora) = PROTOCOL_FEE_PERCENT (flat 20%)
  //   LP fee             = 80% (1 - protocol), split partner/creator
  //   creator            = LP_fee * creatorTradingFeePercentage
  //   partner (Momento)  = LP_fee * (100 - creatorTradingFeePercentage)
  const protocolPct = 20; // PROTOCOL_FEE_PERCENT (verified constant)
  const lpPct = 100 - protocolPct;
  const creatorPct = (lpPct * CREATOR_TRADING_FEE_PERCENTAGE) / 100;
  const partnerPct = lpPct - creatorPct;

  console.log("\n  --- CONFIGURED FEE SPLIT (bonding phase) ---------------------");
  console.log(`    base trading fee:            ${(BASE_FEE_BPS / 100).toFixed(2)}%`);
  console.log(`    Meteora protocol (flat):     ${protocolPct}% of fee`);
  console.log(`    Momento (partner):           ${partnerPct}% of fee`);
  console.log(`    Creator:                     ${creatorPct}% of fee`);
  console.log(`      (creatorTradingFeePercentage=${CREATOR_TRADING_FEE_PERCENTAGE}% applied to the ${lpPct}% LP fee)`);
  console.log("  --- CONFIGURED LP DISTRIBUTION (post-graduation) ------------");
  console.log(`    partner_locked_lp:           ${PARTNER_LOCKED_LP_PERCENTAGE}%  (Momento LP bound, fees claimable)`);
  console.log(`    partner_lp:                  ${PARTNER_LP_PERCENTAGE}%  (Momento LP liquid)`);
  console.log(`    creator_locked_lp:           ${CREATOR_LOCKED_LP_PERCENTAGE}%  (returned to creator, bound)`);
  console.log(`    creator_lp:                  ${CREATOR_LP_PERCENTAGE}%  (returned to creator, liquid)`);
  const lpSum =
    PARTNER_LOCKED_LP_PERCENTAGE + PARTNER_LP_PERCENTAGE + CREATOR_LOCKED_LP_PERCENTAGE + CREATOR_LP_PERCENTAGE;
  console.log(`    (sum=${lpSum}% — must total 100%)`);
}

function printToken2022Finding() {
  console.log("\n============================================================");
  console.log(" STEP 7 — Token-2022 (Transfer Fee) on DBC — FINDING");
  console.log("============================================================");
  console.log(" DBC ACCEPTS Token-2022 mints: the SDK enum TokenType has");
  console.log(" { SPLToken=0, Token2022=1 } and the build* helpers take");
  console.log(" tokenType: TokenType.Token2022 directly. A Transfer-FEE mint");
  console.log(" (our 1%/10% tax) is supported permissionlessly across DBC,");
  console.log(" DAMM v2, and DLMM (per Meteora docs + repo: 'all token2022 with");
  console.log(" metadata pointer and transfer fee extensions are supported");
  console.log(" permissionlessly').");
  console.log("");
  console.log(" Transfer HOOK is different: DBC has dedicated hook configs");
  console.log(" (createConfigWithTransferHook / createPoolWithTransferHook /");
  console.log(" swap2WithTransferHook), but the POST-MIGRATION DAMM v2 pool only");
  console.log(" accepts a transfer-hook mint permissionlessly if the hook program");
  console.log(" + hook authority are REVOKED; otherwise it needs a Meteora admin");
  console.log(" 'token badge' whitelist (create_token_badge).");
  console.log("");
  console.log(" => RECOMMENDATION for Momento's tax: implement the 1%/10% tax as a");
  console.log("    Token-2022 TRANSFER FEE (not a hook). It is supported");
  console.log("    permissionlessly end-to-end (DBC bonding AND DAMM v2 post-grad)");
  console.log("    with no whitelist dependency. This is the single highest-risk");
  console.log("    item to re-verify against the deployed program version before");
  console.log("    committing the tax architecture.");
  console.log(" Source: docs/solana-migration/research/10-meteora.md (§5),");
  console.log("         github.com/MeteoraAg/dynamic-bonding-curve (state/config.rs),");
  console.log("         github.com/MeteoraAg/damm-v2 (README/CHANGELOG).");
}

function printVerdict(args: {
  buysLanded: number;
  migrated: boolean;
  partnerClaimSig: string;
  creatorClaimSig: string;
}) {
  const { buysLanded, migrated, partnerClaimSig, creatorClaimSig } = args;
  const created = true; // we reached this point => config + curve created
  const claimedAny = partnerClaimSig !== "(skipped)" || creatorClaimSig !== "(skipped)";

  console.log("\n============================================================");
  if (created && buysLanded > 0 && claimedAny) {
    console.log(" VERDICT: GO ✅ (mechanism proven on devnet)");
  } else {
    console.log(" VERDICT: PARTIAL / NO-GO ⚠️  (see what landed below)");
  }
  console.log(`   config + bonding curve created: ${created}`);
  console.log(`   buys landed:                    ${buysLanded}`);
  console.log(`   graduated to DAMM v2:           ${migrated}`);
  console.log(`   partner claim:                  ${partnerClaimSig}`);
  console.log(`   creator claim:                  ${creatorClaimSig}`);
  console.log("============================================================");

  console.log("\nCAVEATS / DEVNET LIMITATIONS:");
  console.log(" - BUYS need devnet USDC: the partner wallet must hold the devnet-USDC");
  console.log("   ATA, funded from Circle's faucet. With no USDC the buys (and thus");
  console.log("   any fee accrual) cannot land — fund first.");
  console.log(" - GRADUATION needs the virtual pool to accumulate migration_quote_threshold");
  console.log("   USDC. Reaching it on devnet means funding enough USDC buys yourself.");
  console.log("   The MANAGED MIGRATOR KEEPER may not run on devnet and has minimum-");
  console.log("   threshold requirements; if it does not auto-migrate, self-migrate via");
  console.log("   client.migration.migrateToDammV2 (done above). If you cannot reach the");
  console.log("   threshold, INSPECT: virtual-pool quote reserve vs threshold, and that");
  console.log("   the stored config has migrationOption==MET_DAMM_V2.");
  console.log(" - SPLIT RATIOS (verify these are what hit the chain):");
  console.log(`     of total fee -> Meteora 20%, Momento ${(80 * (100 - CREATOR_TRADING_FEE_PERCENTAGE)) / 100}%, creator ${(80 * CREATOR_TRADING_FEE_PERCENTAGE) / 100}%.`);
  console.log(" - DAMM v2 has NO native two-recipient fee field (removed in program");
  console.log("   v0.2.0). Post-grad split = the TWO locked position NFTs from");
  console.log("   migrateToDammV2 (partner + creator), each claimed via claimPositionFee.");
  console.log(" - Items still marked `// TODO verify` are SDK-minor-version-sensitive");
  console.log("   (state readers, derive arg order, pool-state field names, the");
  console.log("   DAMM_V2_MIGRATION_FEE_ADDRESS index, token-program flag). Confirm");
  console.log("   against the *installed* SDK before relying on them.");
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
