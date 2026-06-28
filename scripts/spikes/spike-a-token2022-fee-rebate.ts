/**
 * spike-a-token2022-fee-rebate.ts
 * ============================================================================
 * DEVNET VALIDATION SPIKE — Token-2022 Transfer Fee + in-app rebate to ~1%
 * ============================================================================
 *
 * Product decision (LOCKED): Momento is Solana-only. Creator tokens are
 * Token-2022 mints carrying a 3–5% TransferFee (default 4% / 400 bps here).
 * The app rebates IN-APP trades down to ~1% effective via our own off-chain
 * rebate accounting + an on-chain rebate transfer from a rebate vault.
 *
 * This spike PROVES the end-to-end flow on devnet:
 *   - mint a Token-2022 mint with the TransferFeeConfig extension
 *   - move tokens with transferCheckedWithFee, watch the fee get WITHHELD
 *   - harvest + withdraw the withheld fee to our fee vault
 *   - apply rebate accounting so an in-app trade nets ~1% while an external
 *     (off-app) trade nets the full ~4%
 *
 * ----------------------------------------------------------------------------
 * REQUIRED DEPS (install before running):
 *   npm i @solana/web3.js@^1.98 @solana/spl-token@^0.4 bs58@^5
 *   # @solana/spl-token >=0.4 carries the Token-2022 / extension helpers.
 *   # spl-token@0.4 peer-deps @solana/web3.js ^1.95.5 (1.98 is compatible).
 *
 * REQUIRED ENV VARS:
 *   SPIKE_KEYPAIR   (required) The fee-payer / authority keypair. Accepts EITHER:
 *                     (a) a base58-encoded 64-byte secret key string, e.g.
 *                         the output of `solana-keygen` exported / Phantom export, OR
 *                     (b) a filesystem path to a JSON keypair file in the standard
 *                         Solana CLI format (a JSON array of 64 ints), e.g.
 *                         ~/.config/solana/id.json
 *                   The script auto-detects: if the value resolves to an existing
 *                   file it is parsed as a JSON keypair file, else it is treated as
 *                   a base58 secret key.
 *   SPIKE_RPC_URL   (optional) RPC endpoint. Default: https://api.devnet.solana.com
 *
 * RUN:
 *   SPIKE_KEYPAIR=~/.config/solana/id.json npx tsx \
 *     scripts/spikes/spike-a-token2022-fee-rebate.ts
 *
 * ----------------------------------------------------------------------------
 * VERIFIED SDK SURFACE (signatures confirmed against official sources):
 *   - solana.com Token-Extensions transfer-fee guide
 *     https://solana.com/developers/guides/token-extensions/transfer-fee
 *   - @solana/spl-token (token-2022) js-legacy source, branch main
 *     https://github.com/solana-program/token-2022/tree/main/clients/js-legacy
 *
 *   Mint setup (instruction builders):
 *     getMintLen(extensionTypes: ExtensionType[]): number
 *     createInitializeTransferFeeConfigInstruction(
 *       mint, transferFeeConfigAuthority, withdrawWithheldAuthority,
 *       transferFeeBasisPoints: number, maximumFee: bigint, programId)
 *     createInitializeMintInstruction(
 *       mint, decimals, mintAuthority, freezeAuthority | null, programId)
 *
 *   Transfer + fee lifecycle (high-level async actions):
 *     transferCheckedWithFee(connection, payer, source, mint, destination,
 *       owner, amount: bigint, decimals, fee: bigint, multiSigners?,
 *       confirmOptions?, programId = TOKEN_2022_PROGRAM_ID)
 *     harvestWithheldTokensToMint(connection, payer, mint, sources: PublicKey[],
 *       confirmOptions?, programId)
 *     withdrawWithheldTokensFromMint(connection, payer, mint, destination,
 *       authority, multiSigners?, confirmOptions?, programId)
 *     withdrawWithheldTokensFromAccounts(connection, payer, mint, destination,
 *       authority, multiSigners, sources: PublicKey[], confirmOptions?, programId)
 *
 *   State reads:
 *     getTransferFeeAmount(account: Account): { withheldAmount: bigint } | null
 *     getTransferFeeConfig(mint: Mint): TransferFeeConfig | null
 * ----------------------------------------------------------------------------
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  // account creation + ATA helpers
  createAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  // transfer-fee lifecycle (high-level async actions)
  transferCheckedWithFee,
  harvestWithheldTokensToMint,
  withdrawWithheldTokensFromMint,
  // state readers
  getTransferFeeAmount,
} from "@solana/spl-token";
import * as fs from "fs";
import bs58 from "bs58";

// ----------------------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------------------
const RPC_URL = process.env.SPIKE_RPC_URL ?? "https://api.devnet.solana.com";

const DECIMALS = 9;
const FEE_BPS = 400; // 4% on-chain transfer fee (locked product range 3–5%)
const TARGET_IN_APP_BPS = 100; // ~1% effective for in-app trades after rebate
// maxFee caps the absolute fee per transfer. Set high enough not to bind for
// the demo amounts so the % math is clean. (1_000_000 tokens worth of base units.)
const MAX_FEE = BigInt(1_000_000) * BigInt(10) ** BigInt(DECIMALS);

const INITIAL_SUPPLY = BigInt(10_000_000) * BigInt(10) ** BigInt(DECIMALS);

// Demo trade sizes (whole tokens, scaled to base units below)
const IN_APP_TRADE = BigInt(1_000) * BigInt(10) ** BigInt(DECIMALS);
const EXTERNAL_TRADE = BigInt(1_000) * BigInt(10) ** BigInt(DECIMALS);

const MIN_PAYER_SOL = 2; // airdrop top-up target if balance is low

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Load the fee-payer keypair from SPIKE_KEYPAIR (path-to-json OR base58 secret). */
function loadKeypair(): Keypair {
  const raw = process.env.SPIKE_KEYPAIR;
  if (!raw) {
    throw new Error(
      "SPIKE_KEYPAIR env var is required (base58 secret key OR path to a JSON keypair file)."
    );
  }
  const candidate = raw.startsWith("~")
    ? raw.replace(/^~/, process.env.HOME ?? "")
    : raw;

  // (a) JSON keypair file path
  if (fs.existsSync(candidate)) {
    const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(
        `SPIKE_KEYPAIR points to a file that is not a JSON keypair array: ${candidate}`
      );
    }
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }

  // (b) base58-encoded secret key string
  try {
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch (e) {
    throw new Error(
      `SPIKE_KEYPAIR is neither an existing file path nor a valid base58 secret key: ${(e as Error).message}`
    );
  }
}

/** Ensure the payer has at least MIN_PAYER_SOL on devnet; airdrop if low. */
async function ensureSol(connection: Connection, payer: Keypair): Promise<void> {
  const bal = await connection.getBalance(payer.publicKey);
  console.log(`Payer balance: ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (bal >= MIN_PAYER_SOL * LAMPORTS_PER_SOL) return;

  console.log(`Balance low — requesting ${MIN_PAYER_SOL} SOL airdrop (devnet)...`);
  try {
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      MIN_PAYER_SOL * LAMPORTS_PER_SOL
    );
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      { signature: sig, ...bh },
      "confirmed"
    );
    const after = await connection.getBalance(payer.publicKey);
    console.log(`Airdrop confirmed. New balance: ${(after / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  } catch (e) {
    console.warn(
      `Airdrop failed (devnet faucet is rate-limited). Fund ${payer.publicKey.toBase58()} manually. (${(e as Error).message})`
    );
  }
}

const toWhole = (base: bigint) => Number(base) / 10 ** DECIMALS;
const fmt = (base: bigint) => toWhole(base).toLocaleString(undefined, { maximumFractionDigits: 4 });

/** Off-chain fee math mirroring the on-chain Token-2022 calculation (floor, capped at maxFee). */
function calcFee(amount: bigint, bps: number, maxFee: bigint): bigint {
  const fee = (amount * BigInt(bps)) / BigInt(10_000); // integer floor, matches program
  return fee > maxFee ? maxFee : fee;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  console.log("============================================================");
  console.log(" SPIKE A — Token-2022 Transfer Fee + in-app rebate (devnet)");
  console.log("============================================================\n");

  const connection = new Connection(RPC_URL, "confirmed");
  console.log(`RPC: ${RPC_URL}`);

  const payer = loadKeypair();
  console.log(`Fee-payer / authority: ${payer.publicKey.toBase58()}`);
  await ensureSol(connection, payer);

  // The payer doubles as: mint authority, transfer-fee-config authority,
  // withdraw-withheld authority, and the owner of the fee + rebate vaults.
  const mintAuthority = payer;
  const transferFeeConfigAuthority = payer; // can change fee bps later
  const withdrawWithheldAuthority = payer; // == our fee vault authority

  // --------------------------------------------------------------------------
  // 1) Create the Token-2022 mint WITH the TransferFeeConfig extension.
  //    Manual path: allocate sized account -> init extension -> init mint.
  //    Extension init MUST come before InitializeMint in the same tx.
  // --------------------------------------------------------------------------
  console.log("\n[1] Creating Token-2022 mint with TransferFeeConfig...");
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;

  const extensions = [ExtensionType.TransferFeeConfig];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mint,
      transferFeeConfigAuthority.publicKey,
      withdrawWithheldAuthority.publicKey,
      FEE_BPS,
      MAX_FEE,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint,
      DECIMALS,
      mintAuthority.publicKey,
      null, // no freeze authority for the spike
      TOKEN_2022_PROGRAM_ID
    )
  );

  const mintSig = await sendAndConfirmTransaction(
    connection,
    createMintTx,
    [payer, mintKp],
    { commitment: "confirmed" }
  );
  console.log(`    mint:    ${mint.toBase58()}`);
  console.log(`    fee:     ${FEE_BPS} bps (${FEE_BPS / 100}%)  maxFee=${fmt(MAX_FEE)}`);
  console.log(`    tx:      ${mintSig}`);

  // --------------------------------------------------------------------------
  // 2) Create token accounts.
  //    treasury  : holds initial supply (we use a fresh keypair-owned account)
  //    trader    : the in-app buyer (gets a rebate)
  //    external  : an off-app holder (no rebate)
  //    feeVault  : destination for withdrawn withheld fees
  //    rebateVault: pool we fund and pay rebates from to in-app traders
  //    All owned by `payer` here for simplicity (single signer in the spike).
  // --------------------------------------------------------------------------
  console.log("\n[2] Creating token accounts (treasury, trader, external, feeVault, rebateVault)...");

  // treasury — explicit non-ATA account owned by payer (initial supply holder)
  const treasuryKp = Keypair.generate();
  const treasury = await createAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
    treasuryKp,
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );

  // trader / external / feeVault / rebateVault — use distinct owners so the
  // accounting is legible. We synthesize owners as fresh keypairs but keep
  // `payer` as the signer/authority where a signature is needed (the trader
  // account owner only needs to sign for transfers it initiates; here all
  // initiating transfers are signed by the treasury/vault owner = payer).
  const traderOwner = Keypair.generate();
  const externalOwner = Keypair.generate();
  const feeVaultOwner = payer; // == withdrawWithheldAuthority
  const rebateVaultOwner = payer;

  const traderAcc = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, traderOwner.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID
  );
  const externalAcc = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, externalOwner.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID
  );
  const feeVault = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, feeVaultOwner.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID
  );
  const rebateVault = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, rebateVaultOwner.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID
  );

  const trader = traderAcc.address;
  const external = externalAcc.address;

  console.log(`    treasury:    ${treasury.toBase58()}`);
  console.log(`    trader:      ${trader.toBase58()}`);
  console.log(`    external:    ${external.toBase58()}`);
  console.log(`    feeVault:    ${feeVault.address.toBase58()}`);
  console.log(`    rebateVault: ${rebateVault.address.toBase58()}`);

  // Mint the full supply to treasury.
  await mintTo(
    connection, payer, mint, treasury, mintAuthority,
    INITIAL_SUPPLY, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
  );
  // Seed the rebate vault from treasury so it can pay rebates.
  // (Funding the rebate vault is itself a Token-2022 transfer and WILL incur a
  //  fee; for the spike we simply mint to it directly to keep accounting clean.)
  await mintTo(
    connection, payer, mint, rebateVault.address, mintAuthority,
    BigInt(100_000) * BigInt(10) ** BigInt(DECIMALS), [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
  );
  console.log(`    minted supply -> treasury: ${fmt(INITIAL_SUPPLY)}`);
  console.log(`    seeded rebateVault:        100,000`);

  // --------------------------------------------------------------------------
  // 3) IN-APP trade: treasury -> trader via transferCheckedWithFee.
  //    The fee is WITHHELD on the *recipient* (trader) account, not moved to
  //    the vault yet. We pass the exact fee we computed off-chain so the
  //    program validates client expectation == on-chain calc.
  // --------------------------------------------------------------------------
  console.log("\n[3] IN-APP trade: treasury -> trader (transferCheckedWithFee)...");
  const inAppFee = calcFee(IN_APP_TRADE, FEE_BPS, MAX_FEE);
  await transferCheckedWithFee(
    connection,
    payer,
    treasury,
    mint,
    trader,
    payer.publicKey, // owner/authority of `treasury`
    IN_APP_TRADE,
    DECIMALS,
    inAppFee,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );

  let traderAccState = await getAccount(connection, trader, "confirmed", TOKEN_2022_PROGRAM_ID);
  const traderWithheld = getTransferFeeAmount(traderAccState)?.withheldAmount ?? BigInt(0);
  console.log(`    gross sent:        ${fmt(IN_APP_TRADE)}`);
  console.log(`    fee charged:       ${fmt(inAppFee)}  (withheld on trader acct)`);
  console.log(`    trader balance:    ${fmt(traderAccState.amount)}  (incl. withheld until harvested)`);
  console.log(`    withheld on trader:${fmt(traderWithheld)}`);

  // --------------------------------------------------------------------------
  // 4) EXTERNAL trade: treasury -> external via transferCheckedWithFee.
  //    Same on-chain fee; the difference is purely that NO rebate is applied.
  // --------------------------------------------------------------------------
  console.log("\n[4] EXTERNAL trade: treasury -> external (transferCheckedWithFee)...");
  const externalFee = calcFee(EXTERNAL_TRADE, FEE_BPS, MAX_FEE);
  await transferCheckedWithFee(
    connection,
    payer,
    treasury,
    mint,
    external,
    payer.publicKey,
    EXTERNAL_TRADE,
    DECIMALS,
    externalFee,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  const externalAccState = await getAccount(connection, external, "confirmed", TOKEN_2022_PROGRAM_ID);
  const externalWithheld = getTransferFeeAmount(externalAccState)?.withheldAmount ?? BigInt(0);
  console.log(`    gross sent:        ${fmt(EXTERNAL_TRADE)}`);
  console.log(`    fee charged:       ${fmt(externalFee)}  (withheld on external acct)`);
  console.log(`    withheld on external:${fmt(externalWithheld)}`);

  // --------------------------------------------------------------------------
  // 5) Harvest withheld fees from the holder accounts to the mint, then
  //    withdraw them from the mint to our feeVault.
  //    (Alternative single-step: withdrawWithheldTokensFromAccounts straight
  //     to the vault — used by some flows; here we show the harvest path which
  //     is what permissionless crankers / DEX-touched accounts use.)
  // --------------------------------------------------------------------------
  console.log("\n[5] Harvest withheld -> mint, then withdraw mint -> feeVault...");
  await harvestWithheldTokensToMint(
    connection,
    payer,
    mint,
    [trader, external],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  await withdrawWithheldTokensFromMint(
    connection,
    payer,
    mint,
    feeVault.address,
    withdrawWithheldAuthority, // Signer
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  const feeVaultState = await getAccount(connection, feeVault.address, "confirmed", TOKEN_2022_PROGRAM_ID);
  const totalCollectedFee = inAppFee + externalFee;
  console.log(`    feeVault balance:  ${fmt(feeVaultState.amount)}  (expected ~${fmt(totalCollectedFee)})`);

  // --------------------------------------------------------------------------
  // 6) REBATE ACCOUNTING.
  //    in-app trade: rebate = chargedFee - targetFee(~1%); pay from rebateVault
  //                  back to trader. NOTE: the rebate transfer is itself a
  //                  Token-2022 transfer and incurs its own 4% fee, so to land
  //                  the *net* target we gross-up the rebate. We show both the
  //                  ideal (no-second-fee) figure and the grossed-up amount.
  //    external trade: NO rebate.
  // --------------------------------------------------------------------------
  console.log("\n[6] Rebate accounting...");

  // Ideal rebate so the trader's NET fee == ~1% target.
  const targetFeeInApp = calcFee(IN_APP_TRADE, TARGET_IN_APP_BPS, MAX_FEE);
  const idealRebate = inAppFee - targetFeeInApp; // tokens we want to return, net of fees

  // The rebate transfer ALSO incurs the 4% fee. Gross up so the trader nets
  // idealRebate:  net = gross - calcFee(gross). For bps=400, net = gross*0.96.
  // gross = ceil(net / 0.96). Use integer math with the bps.
  const grossRebate =
    (idealRebate * BigInt(10_000) + (BigInt(10_000 - FEE_BPS) - BigInt(1))) /
    BigInt(10_000 - FEE_BPS);
  const rebateTransferFee = calcFee(grossRebate, FEE_BPS, MAX_FEE);
  const netRebateToTrader = grossRebate - rebateTransferFee;

  await transferCheckedWithFee(
    connection,
    payer,
    rebateVault.address,
    mint,
    trader,
    rebateVaultOwner.publicKey,
    grossRebate,
    DECIMALS,
    rebateTransferFee,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`    in-app rebate (ideal/net): ${fmt(idealRebate)}`);
  console.log(`    in-app rebate (grossed-up sent): ${fmt(grossRebate)} (fee ${fmt(rebateTransferFee)} -> net ${fmt(netRebateToTrader)})`);
  console.log(`    external rebate: 0 (off-app, full fee retained)`);

  // --------------------------------------------------------------------------
  // 7) ACCOUNTING TABLE — effective rate visible.
  // --------------------------------------------------------------------------
  const inAppNetFee = inAppFee - netRebateToTrader; // what the trader effectively paid
  const inAppEffRate = (Number(inAppNetFee) / Number(IN_APP_TRADE)) * 100;
  const externalEffRate = (Number(externalFee) / Number(EXTERNAL_TRADE)) * 100;

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log("\n[7] ACCOUNTING (whole tokens)");
  console.log("----------------------------------------------------------------------------------");
  console.log(
    pad("trade", 12) + pad("gross", 14) + pad("feeCharged", 14) +
    pad("rebate(net)", 14) + pad("netFee", 12) + "effRate"
  );
  console.log("----------------------------------------------------------------------------------");
  console.log(
    pad("IN-APP", 12) + pad(fmt(IN_APP_TRADE), 14) + pad(fmt(inAppFee), 14) +
    pad(fmt(netRebateToTrader), 14) + pad(fmt(inAppNetFee), 12) +
    `${inAppEffRate.toFixed(2)}%`
  );
  console.log(
    pad("EXTERNAL", 12) + pad(fmt(EXTERNAL_TRADE), 14) + pad(fmt(externalFee), 14) +
    pad("0", 14) + pad(fmt(externalFee), 12) +
    `${externalEffRate.toFixed(2)}%`
  );
  console.log("----------------------------------------------------------------------------------");
  console.log(`On-chain fee config: ${FEE_BPS / 100}%   In-app target: ${TARGET_IN_APP_BPS / 100}%`);

  // --------------------------------------------------------------------------
  // 8) VERDICT
  // --------------------------------------------------------------------------
  const goInApp = Math.abs(inAppEffRate - TARGET_IN_APP_BPS / 100) < 0.25; // within 0.25pp of target
  const goExternal = Math.abs(externalEffRate - FEE_BPS / 100) < 0.05;
  const feeWithdrawn = feeVaultState.amount > BigInt(0);

  console.log("\n============================================================");
  if (goInApp && goExternal && feeWithdrawn) {
    console.log(" VERDICT: GO ✅");
    console.log(" - Token-2022 TransferFee mint created on devnet.");
    console.log(" - Fees withheld on transfer, harvested, and withdrawn to fee vault.");
    console.log(` - In-app effective rate ${inAppEffRate.toFixed(2)}% ≈ ${TARGET_IN_APP_BPS / 100}% target via rebate.`);
    console.log(` - External effective rate ${externalEffRate.toFixed(2)}% ≈ ${FEE_BPS / 100}% (no rebate).`);
  } else {
    console.log(" VERDICT: NO-GO ❌");
    console.log(`   goInApp=${goInApp} goExternal=${goExternal} feeWithdrawn=${feeWithdrawn}`);
  }
  console.log("============================================================");

  console.log("\nCAVEATS:");
  console.log(" - The rebate transfer ITSELF incurs the 4% fee; we gross-up to hit net ~1%.");
  console.log("   An alternative is paying rebates in a fee-exempt unit (SOL/USDC) instead of");
  console.log("   the creator token, which sidesteps the second fee entirely. Decide off-chain.");
  console.log(" - Whether external DEXs/AMMs HONOR or even allow Token-2022 TransferFee mints");
  console.log("   (and how they route fees) is OUT OF SCOPE here — covered by a separate spike.");
  console.log(" - maxFee caps absolute fee; ensure it does not bind for large trades in prod.");
  console.log(" - Withheld fees accrue on RECIPIENT accounts; a permissionless crank must");
  console.log("   harvest+withdraw periodically (we did it inline here).");
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
