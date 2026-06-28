/**
 * spike-c-vesting-lock.ts
 * ============================================================================
 * DEVNET VALIDATION SPIKE — Creator/team VESTING (Streamflow) +
 * LP / retained-allocation LOCKING (Jupiter Lock, zero-fee)
 * ============================================================================
 *
 * Product decision (LOCKED): Momento is Solana-only.
 *   - Creator / team token VESTING  -> Streamflow (`@streamflow/stream`)
 *       (cliff + linear unlock, cancelable, recipient = creator/team wallet)
 *   - LP / retained-allocation LOCKING -> Jupiter Lock (zero fee)
 *       (we deliberately do NOT use Streamflow Token-Lock for LP because it
 *        charges 0.16 SOL + 0.5% of tokens; Jupiter Lock is free.)
 *
 * Prod signing is via Privy embedded / server wallets. This spike uses a local
 * `Keypair` (SPIKE_KEYPAIR) as a stand-in for the Privy signer. Everywhere a
 * `Keypair` signs below, prod swaps in a Privy signer that produces the same
 * signature(s) — see the "PROD:" comments.
 *
 * HIGHEST-RISK DETAIL (verified, see findings at bottom): BOTH protocols require
 * an EPHEMERAL co-signer Keypair alongside the sender:
 *   - Streamflow: a `metadata` Keypair (the stream's metadata account is a
 *     freshly-generated account, not a PDA) — it must partialSign the create tx.
 *   - Jupiter Lock: a `base` Keypair — the escrow PDA is derived from
 *     ["escrow", base.publicKey], so `base` must sign the create tx.
 * In prod the Privy wallet signs as `sender`/`payer`, and we generate + sign
 * the ephemeral keypair client-side as an additional signer in the same tx.
 *
 * ----------------------------------------------------------------------------
 * REQUIRED DEPS (install before running — VERIFIED versions, June 2026):
 *
 *   # Streamflow (latest "latest" tag = 12.4.0)
 *   npm i @streamflow/stream@^12.4.0
 *
 *   # SPL mint/ATA helpers + core web3 + bs58
 *   npm i @solana/web3.js@^1.98 @solana/spl-token@^0.4 bs58@^5 bn.js@^5
 *
 *   # Jupiter Lock — Anchor-based on-chain program (no first-party npm client
 *   # at a stable name yet; we talk to it via Anchor + its IDL). See JUPITER
 *   # LOCK section + TODOs. Anchor client deps:
 *   npm i @coral-xyz/anchor@^0.30
 *   # (Provide the Jupiter Lock IDL JSON via JUP_LOCK_IDL_PATH — fetch it from
 *   #  the deployed devnet program with `anchor idl fetch <PROGRAM_ID>` or copy
 *   #  jup-ag/jup-lock @ sdk/artifacts/locker.json.)
 *
 * REQUIRED ENV VARS:
 *   SPIKE_KEYPAIR   (required) Sender/payer keypair (Privy stand-in). Accepts EITHER
 *                     (a) base58-encoded 64-byte secret key, OR
 *                     (b) filesystem path to a Solana CLI JSON keypair array.
 *                   Auto-detected: existing file -> JSON; else -> base58.
 *   SPIKE_RPC_URL   (optional) RPC endpoint. Default https://api.devnet.solana.com
 *   SPIKE_MINT      (optional) Existing SPL mint to vest/lock. If unset, the
 *                     script creates a fresh classic SPL (Token-kit) mint and
 *                     funds the sender's ATA. (See Token-2022 caveat at bottom.)
 *   SPIKE_RECIPIENT (optional) Recipient pubkey for the vesting stream / lock.
 *                     If unset, a throwaway Keypair pubkey is generated/printed.
 *   JUP_LOCK_PROGRAM_ID (optional) Override Jupiter Lock program id. Default is
 *                     the published mainnet/devnet id (see constant below).
 *   JUP_LOCK_IDL_PATH   (optional) Path to the Jupiter Lock Anchor IDL JSON.
 *                     Required to actually submit the lock; without it the
 *                     Jupiter Lock section runs in DRY-RUN (prints the plan).
 *
 * RUN (after deps installed; needs devnet network + funded wallet):
 *   SPIKE_KEYPAIR=~/.config/solana/id.json npx tsx \
 *     scripts/spikes/spike-c-vesting-lock.ts
 *
 * ----------------------------------------------------------------------------
 * VERIFIED SDK SURFACE (confirmed against official sources, June 2026):
 *
 * STREAMFLOW  (@streamflow/stream v12.4.0)
 *   npm: https://www.npmjs.com/package/@streamflow/stream
 *   docs: https://docs.streamflow.finance/en/articles/9675301-javascript-sdk
 *   source: github.com/streamflow-finance/js-sdk
 *           packages/stream/solana/StreamClient.ts + .../solana/types.ts
 *
 *   import { StreamflowSolana, getBN, getNumberFromBN, Types } from "@streamflow/stream";
 *   const client = new StreamflowSolana.SolanaStreamClient(
 *     clusterUrl: string,
 *     cluster?: ICluster,                  // ICluster.Devnet
 *     commitment?: Commitment | ConnectionConfig,
 *     programId?: string,
 *   );
 *
 *   // create() — internally generates the metadata Keypair, adds it as a signer,
 *   // and signs with BOTH sender + metadata (verified in StreamClient.ts):
 *   //   const { metadata, metadataPubKey } = this.getOrCreateStreamMetadata(...)
 *   //   // metadata = Keypair.generate()
 *   //   prepareTransaction(connection, ixs, sender.publicKey, undefined, [metadata])
 *   //   signAndExecuteTransaction(connection, sender, tx, ...)   // sender signs; metadata already partialSigned
 *   client.create(
 *     data: ICreateStreamData,             // see fields below
 *     extParams: ICreateStreamExt,         // { sender: Keypair|SignerWalletAdapter, isNative?, metadataPubKeys?, partner? }
 *   ): Promise<{ ixs; txId; metadataId }>
 *
 *   // Lower-level: build ixs yourself (returns the metadata Keypair so you can
 *   // co-sign explicitly — THIS is what we use to make the multi-signer flow visible):
 *   client.prepareCreateInstructions(
 *     data: ICreateStreamData,
 *     extParams: ICreateStreamExt,
 *   ): Promise<{ ixs: TransactionInstruction[]; metadata?: Keypair; metadataPubKey: PublicKey }>
 *
 *   client.withdraw({ id, amount }: IWithdrawData, extParams: IInteractStreamExt): Promise<ITransactionResult>
 *   client.getOne({ id }: IGetOneData): Promise<Stream>
 *   client.cancel({ id }, extParams: IInteractStreamExt): Promise<ITransactionResult>
 *
 *   ICreateStreamData (ICreateLinearStreamData = IBaseStreamConfig & IRecipient):
 *     recipient: string; tokenId: string; amount: BN; name: string;
 *     cliffAmount: BN; amountPerPeriod: BN;
 *     period: number; start: number; cliff: number;          // unix seconds
 *     cancelableBySender: boolean; cancelableByRecipient: boolean;
 *     transferableBySender: boolean; transferableByRecipient: boolean;
 *     canTopup: boolean; automaticWithdrawal?: boolean; withdrawalFrequency?: number;
 *     tokenProgramId?: string | PublicKey;                   // pass Token-2022 id for T22 mints
 *
 *   STREAMFLOW FEES (verified docs.streamflow.finance/en/articles/9675153):
 *     Vesting contract: service fee ~0.16 SOL flat / contract (+ ~0.0147 SOL network).
 *     Token-Lock:       0.16 SOL flat + 0.5% of tokens distributed.  <-- why LP uses Jupiter Lock.
 *
 * JUPITER LOCK  (Anchor program — open-source, audited, ZERO fee)
 *   docs:   https://dev.jup.ag/docs/lock  (redirects to developers.jup.ag/docs/lock)
 *   repo:   github.com/jup-ag/jup-lock
 *   starter:github.com/jup-ag/jup-lock-starter  (src/lock/createLock.ts, queryLock.ts)
 *   Program id (published mainnet/devnet): LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn
 *   (NOTE: jup-lock test workspace uses a localnet id 2r5VekMNiWPzi1pWwvJczrdPaZnJG59u91unSrTunwJg — NOT for devnet.)
 *
 *   Instruction (Anchor): createVestingEscrowV2(params, remainingAccountsInfo)
 *     params: { vestingStartTime: BN, cliffTime: BN, frequency: BN,
 *               cliffUnlockAmount: BN, amountPerPeriod: BN, numberOfPeriod: BN,
 *               updateRecipientMode: u8, cancelMode: u8 }
 *     accounts: { base, senderToken, escrowToken, recipient, tokenMint,
 *                 sender, tokenProgram, systemProgram, escrow }
 *     signers: [base, sender]                 // <-- ephemeral `base` co-signer
 *     escrow PDA = findProgramAddress(["escrow", base.publicKey], programId)
 *   Query back: program.account.vestingEscrow.fetch(escrow)
 *   (jup-lock-starter uses the new web3.js-v2 "Kit" path:
 *      getCreateVestingEscrowV2Instruction({ base: ephemeralSigner, escrow, sender, ... }))
 * ----------------------------------------------------------------------------
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import BN from "bn.js";
import * as fs from "fs";
import bs58 from "bs58";

// Streamflow SDK (v12.x). The Solana client + helpers.
import {
  StreamflowSolana,
  getBN,
  ICluster,
} from "@streamflow/stream";
// `Types` (ICreateStreamData etc.) are type-only; we keep params loosely typed
// to avoid coupling the spike to a specific minor's exported type path.
// TODO verify: in 12.4.0 the create-data type is exported as `Types.ICreateStreamData`
// (older minors exported it directly). Adjust the import if tsc complains.

// ----------------------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------------------
const RPC_URL = process.env.SPIKE_RPC_URL ?? "https://api.devnet.solana.com";
const CLUSTER = ICluster.Devnet;

const DECIMALS = 9;
const ONE = BigInt(10) ** BigInt(DECIMALS);

// Creator allocation we vest through Streamflow.
const CREATOR_ALLOCATION = BigInt(1_000_000) * ONE; // 1,000,000 tokens

// LP / retained allocation we lock through Jupiter Lock.
const LP_LOCK_AMOUNT = BigInt(500_000) * ONE; // 500,000 tokens

// Mint enough to cover both flows + slack.
const INITIAL_SUPPLY = (CREATOR_ALLOCATION + LP_LOCK_AMOUNT) * BigInt(2);

const MIN_PAYER_SOL = 2; // airdrop top-up target if balance is low.

// Vesting schedule: 6-month cliff, then 18-month linear unlock.
const SECONDS_PER_DAY = 24 * 60 * 60;
const SECONDS_PER_MONTH = 30 * SECONDS_PER_DAY; // approximation for the spike
const CLIFF_MONTHS = 6;
const LINEAR_MONTHS = 18;

// Jupiter Lock published program id (mainnet/devnet). Override via env if needed.
const JUP_LOCK_PROGRAM_ID = new PublicKey(
  process.env.JUP_LOCK_PROGRAM_ID ??
    "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn",
);
const JUP_LOCK_ESCROW_SEED = Buffer.from("escrow");

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Load SPIKE_KEYPAIR (path-to-json OR base58 secret). PROD: replaced by Privy signer. */
function loadKeypair(): Keypair {
  const raw = process.env.SPIKE_KEYPAIR;
  if (!raw) {
    throw new Error(
      "SPIKE_KEYPAIR env var is required (base58 secret key OR path to a JSON keypair file).",
    );
  }
  const candidate = raw.startsWith("~")
    ? raw.replace(/^~/, process.env.HOME ?? "")
    : raw;

  if (fs.existsSync(candidate)) {
    const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(
        `SPIKE_KEYPAIR points to a file that is not a JSON keypair array: ${candidate}`,
      );
    }
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}

async function ensureFunded(connection: Connection, who: PublicKey) {
  const bal = await connection.getBalance(who);
  console.log(`  payer balance: ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (bal >= MIN_PAYER_SOL * LAMPORTS_PER_SOL) return;
  console.log(`  balance low — requesting devnet airdrop...`);
  try {
    const sig = await connection.requestAirdrop(who, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    const after = await connection.getBalance(who);
    console.log(
      `  airdropped. new balance: ${(after / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
    );
  } catch (e) {
    console.warn(
      `  airdrop failed (devnet faucet is flaky). Fund manually:\n    solana airdrop 2 ${who.toBase58()} --url devnet\n  cause: ${(e as Error).message}`,
    );
  }
}

function fmtTokens(base: bigint | BN): string {
  const b = typeof base === "bigint" ? base : BigInt(base.toString());
  const whole = b / ONE;
  const frac = b % ONE;
  return `${whole}.${frac.toString().padStart(DECIMALS, "0")} tok`;
}

// ----------------------------------------------------------------------------
// Step 1+2: connect, load wallet, get a mint + funded source token account
// ----------------------------------------------------------------------------
async function setupMintAndSource(connection: Connection, payer: Keypair) {
  let mint: PublicKey;
  if (process.env.SPIKE_MINT) {
    mint = new PublicKey(process.env.SPIKE_MINT);
    console.log(`  using existing mint from SPIKE_MINT: ${mint.toBase58()}`);
  } else {
    // PROD: in prod the creator mint already exists (Token-2022 with transfer
    // fee — see spike-a). Here we make a CLASSIC SPL mint so the vest/lock math
    // is clean and not perturbed by transfer fees. See Token-2022 caveat below.
    console.log(`  creating fresh classic SPL mint (TOKEN_PROGRAM_ID)...`);
    mint = await createMint(
      connection,
      payer, // fee payer + mint authority (PROD: Privy signer)
      payer.publicKey,
      null,
      DECIMALS,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID,
    );
    console.log(`  mint: ${mint.toBase58()}`);
  }

  const sourceAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
    false,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID,
  );
  console.log(`  source ATA: ${sourceAta.address.toBase58()}`);

  if (!process.env.SPIKE_MINT) {
    console.log(`  minting ${fmtTokens(INITIAL_SUPPLY)} to source ATA...`);
    await mintTo(
      connection,
      payer,
      mint,
      sourceAta.address,
      payer, // mint authority (PROD: Privy signer)
      INITIAL_SUPPLY,
      [],
      undefined,
      TOKEN_PROGRAM_ID,
    );
  }
  const acct = await getAccount(
    connection,
    sourceAta.address,
    undefined,
    TOKEN_PROGRAM_ID,
  );
  console.log(`  source balance: ${fmtTokens(acct.amount)}`);

  return { mint, sourceAta: sourceAta.address };
}

// ----------------------------------------------------------------------------
// Step 3: Streamflow vesting (cliff + linear) — EXERCISE metadata co-signer
// ----------------------------------------------------------------------------
async function runStreamflowVesting(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  recipient: PublicKey,
): Promise<string | null> {
  console.log("\n=== STREAMFLOW: creator vesting (6mo cliff + 18mo linear) ===");

  const client = new StreamflowSolana.SolanaStreamClient(
    RPC_URL,
    CLUSTER,
    "confirmed",
  );

  const now = Math.floor(Date.now() / 1000);
  const start = now + 60; // start in 1 min (must be > now)
  const cliff = start + CLIFF_MONTHS * SECONDS_PER_MONTH;

  // Linear unlock over LINEAR_MONTHS with a monthly release period.
  const period = SECONDS_PER_MONTH; // one unlock tick per month
  // Reserve a token at cliff, drip the rest linearly across LINEAR_MONTHS ticks.
  const cliffAmount = getBN(0, DECIMALS); // pure linear after cliff (no lump)
  const totalBN = new BN(CREATOR_ALLOCATION.toString());
  const amountPerPeriod = totalBN.div(new BN(LINEAR_MONTHS));

  const createData = {
    recipient: recipient.toBase58(),
    tokenId: mint.toBase58(),
    start,
    amount: totalBN, // BN, base units
    period, // seconds between unlock ticks
    cliff, // unix seconds — nothing withdrawable before this
    cliffAmount, // BN released exactly at cliff
    amountPerPeriod, // BN released each `period` after cliff
    name: "MOMENTO CREATOR VESTING",
    canTopup: false, // vesting (not a topup-able stream)
    cancelableBySender: true, // <-- requested: cancelable=true
    cancelableByRecipient: false,
    transferableBySender: false,
    transferableByRecipient: false,
    automaticWithdrawal: false,
    // tokenProgramId: TOKEN_2022_PROGRAM_ID,  // TODO verify: set for T22 mints in prod
  };

  // extParams. `sender` is the Privy stand-in. We DELIBERATELY use the
  // lower-level prepareCreateInstructions so the ephemeral `metadata` Keypair
  // co-signer is EXPLICIT and visible (client.create() would hide it).
  const extParams = {
    sender: payer, // PROD: Privy embedded/server wallet signer
    isNative: false,
  };

  console.log("  building create instructions (prepareCreateInstructions)...");
  // VERIFIED: returns { ixs, metadata?: Keypair, metadataPubKey: PublicKey }.
  // `metadata` is Keypair.generate() unless extParams.metadataPubKeys provided.
  const prepared: {
    ixs: any[];
    metadata?: Keypair;
    metadataPubKey: PublicKey;
  } = await client.prepareCreateInstructions(createData as any, extParams as any);

  const { ixs, metadata, metadataPubKey } = prepared;
  console.log(`  metadataPubKey (= stream id): ${metadataPubKey.toBase58()}`);

  if (!metadata) {
    // Only happens if metadataPubKeys was passed in extParams. We didn't, so
    // this path should not hit; guard anyway.
    throw new Error(
      "No ephemeral metadata Keypair returned — cannot demonstrate multi-signer flow.",
    );
  }

  // ---- THE MULTI-SIGNER FLOW (highest-risk detail) -------------------------
  // The Streamflow metadata account is a freshly generated account (NOT a PDA),
  // so the tx that creates it MUST be signed by BOTH:
  //   (1) payer/sender  — pays + authorizes the token transfer into escrow
  //   (2) metadata      — the new account proving it consented to be created
  // PROD: (1) is the Privy signer; (2) is this client-generated ephemeral key,
  //       which we sign with locally before/after the Privy signature.
  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payer.publicKey;

  console.log("  signing with BOTH sender (payer) AND ephemeral metadata Keypair...");
  // sendAndConfirmTransaction signs with all provided signers — order doesn't
  // matter for a legacy tx; both signatures must be present.
  let streamId: string | null = null;
  try {
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer, metadata], // <-- explicit multi-signer: sender + metadata
      { commitment: "confirmed" },
    );
    streamId = metadataPubKey.toBase58();
    console.log(`  ✅ vesting stream created. tx=${sig}`);
    console.log(`     stream id (metadata): ${streamId}`);
  } catch (e) {
    console.error(
      `  ❌ create failed: ${(e as Error).message}\n` +
        "     (Common causes: insufficient SOL for ~0.16 SOL service fee + rent,\n" +
        "      or schedule params rejected. See Streamflow fees note below.)",
    );
    return null;
  }

  // ---- Query the stream back ----------------------------------------------
  try {
    const stream = await client.getOne({ id: streamId! });
    console.log("  queried stream:");
    console.log(`     deposited:   ${stream.depositedAmount?.toString?.() ?? "?"}`);
    console.log(`     start:       ${stream.start}`);
    console.log(`     cliff:       ${(stream as any).cliff ?? "n/a"}`);
    console.log(`     period:      ${stream.period}`);
    console.log(`     cancelable:  ${stream.cancelableBySender}`);
  } catch (e) {
    console.warn(`  getOne failed: ${(e as Error).message}`);
  }

  // ---- Demonstrate withdraw (only if schedule allows; our cliff is 6mo out) -
  // With a 6-month cliff, nothing is withdrawable now, so a real withdraw would
  // revert. We show the call shape; uncomment WITHDRAW_ANYWAY to attempt it
  // (useful if you set a tiny cliff for a same-session demo).
  const WITHDRAW_ANYWAY = process.env.SPIKE_TRY_WITHDRAW === "1";
  if (WITHDRAW_ANYWAY) {
    try {
      console.log("  attempting withdraw (recipient must sign as invoker)...");
      // PROD: invoker = recipient's Privy wallet. Here recipient is a throwaway
      // key we don't hold, so this only works if SPIKE_RECIPIENT == payer.
      const res = await client.withdraw(
        { id: streamId!, amount: getBN(1, DECIMALS) },
        { invoker: payer }, // TODO verify: must be the RECIPIENT signer in prod
      );
      console.log(`  withdraw tx: ${res.txId}`);
    } catch (e) {
      console.log(
        `  withdraw (expected to fail pre-cliff / wrong invoker): ${(e as Error).message}`,
      );
    }
  } else {
    console.log(
      "  (skipping withdraw: 6-month cliff means nothing is unlocked yet.\n" +
        "   Set SPIKE_TRY_WITHDRAW=1 with a tiny-cliff schedule to exercise it.)",
    );
  }

  return streamId;
}

// ----------------------------------------------------------------------------
// Step 4: Jupiter Lock (zero-fee) — lock LP/retained allocation
// ----------------------------------------------------------------------------
async function runJupiterLock(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  recipient: PublicKey,
) {
  console.log("\n=== JUPITER LOCK: LP/retained allocation lock (zero fee) ===");

  // The escrow is a PDA derived from an EPHEMERAL `base` Keypair, mirroring
  // Streamflow's metadata pattern: base must co-sign the create tx.
  const base = Keypair.generate(); // PROD: generated client-side, signed alongside Privy
  const [escrow] = PublicKey.findProgramAddressSync(
    [JUP_LOCK_ESCROW_SEED, base.publicKey.toBuffer()],
    JUP_LOCK_PROGRAM_ID,
  );
  console.log(`  program id:   ${JUP_LOCK_PROGRAM_ID.toBase58()}`);
  console.log(`  base (ephemeral co-signer): ${base.publicKey.toBase58()}`);
  console.log(`  escrow PDA:   ${escrow.toBase58()}`);

  const now = Math.floor(Date.now() / 1000);
  const lockParams = {
    vestingStartTime: new BN(now),
    cliffTime: new BN(now + CLIFF_MONTHS * SECONDS_PER_MONTH),
    frequency: new BN(SECONDS_PER_MONTH), // unlock tick = monthly
    cliffUnlockAmount: new BN(0),
    amountPerPeriod: new BN(LP_LOCK_AMOUNT.toString()).div(new BN(LINEAR_MONTHS)),
    numberOfPeriod: new BN(LINEAR_MONTHS),
    updateRecipientMode: 0, // 0 = none (immutable recipient)
    cancelMode: 0, // 0 = none (irreversible lock — appropriate for LP)
  };
  console.log("  lock plan:");
  console.log(`     amount:      ${fmtTokens(LP_LOCK_AMOUNT)}`);
  console.log(`     recipient:   ${recipient.toBase58()}`);
  console.log(`     start:       ${lockParams.vestingStartTime.toString()}`);
  console.log(`     cliff:       ${lockParams.cliffTime.toString()}`);
  console.log(`     perPeriod:   ${lockParams.amountPerPeriod.toString()}`);
  console.log(`     periods:     ${lockParams.numberOfPeriod.toString()}`);

  const idlPath = process.env.JUP_LOCK_IDL_PATH;
  if (!idlPath || !fs.existsSync(idlPath)) {
    console.warn(
      "  DRY-RUN: JUP_LOCK_IDL_PATH not set / not found — printing plan only.\n" +
        "  To submit for real, fetch the IDL and re-run:\n" +
        `    anchor idl fetch ${JUP_LOCK_PROGRAM_ID.toBase58()} --provider.cluster devnet > locker.json\n` +
        "    JUP_LOCK_IDL_PATH=locker.json npx tsx scripts/spikes/spike-c-vesting-lock.ts\n" +
        "  (IDL is also at jup-ag/jup-lock @ sdk/artifacts/locker.json)",
    );
    return;
  }

  // ---- Real submission via Anchor -----------------------------------------
  // TODO verify: account/arg names below are from jup-ag/jup-lock tests
  // (tests/locker_utils/index.ts -> createVestingPlanV2). Confirm against the
  // fetched IDL's `createVestingEscrowV2` instruction before relying on this.
  try {
    // Lazy-require Anchor so the spike still runs (DRY-RUN) without it installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const anchor = require("@coral-xyz/anchor");
    const {
      getAssociatedTokenAddressSync,
      getOrCreateAssociatedTokenAccount: getOrCreateAtaT,
    } = require("@solana/spl-token");

    const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
    const wallet = new anchor.Wallet(payer); // PROD: Privy-backed AnchorProvider wallet
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    // Anchor >=0.30 reads the program id from the IDL's `address` field.
    const program = new anchor.Program(idl, provider);

    // sender token = our funded source ATA; escrow token = ATA owned by escrow PDA.
    const senderToken = getAssociatedTokenAddressSync(
      mint,
      payer.publicKey,
      true,
      TOKEN_PROGRAM_ID,
    );
    const escrowAta = await getOrCreateAtaT(
      connection,
      payer,
      mint,
      escrow,
      true, // allowOwnerOffCurve (escrow is a PDA)
      undefined,
      undefined,
      TOKEN_PROGRAM_ID,
    );

    console.log("  submitting createVestingEscrowV2 (signers: [base, sender])...");
    const sig = await program.methods
      .createVestingEscrowV2(lockParams, { slices: [] }) // remainingAccountsInfo
      .accounts({
        base: base.publicKey,
        senderToken,
        escrowToken: escrowAta.address,
        recipient,
        tokenMint: mint,
        sender: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        escrow,
        // eventAuthority + program are auto-resolved by Anchor for event CPI.
      })
      .signers([base, payer]) // <-- ephemeral base co-signer + sender (Privy in prod)
      .rpc({ commitment: "confirmed" });
    console.log(`  ✅ lock created. tx=${sig}`);

    // ---- Query it back ----
    // TODO verify exact account name: tests use program.account.vestingEscrow.
    const acct = await program.account.vestingEscrow.fetch(escrow);
    console.log("  queried escrow:");
    console.log(`     recipient:        ${acct.recipient?.toBase58?.()}`);
    console.log(`     tokenMint:        ${acct.tokenMint?.toBase58?.()}`);
    console.log(`     cliffTime:        ${acct.cliffTime?.toString?.()}`);
    console.log(`     amountPerPeriod:  ${acct.amountPerPeriod?.toString?.()}`);
    console.log(`     numberOfPeriod:   ${acct.numberOfPeriod?.toString?.()}`);
  } catch (e) {
    console.error(
      `  ❌ Jupiter Lock submission failed: ${(e as Error).message}\n` +
        "     Verify: (a) IDL matches deployed devnet program, (b) account names\n" +
        "     above match the IDL's createVestingEscrowV2, (c) program is deployed\n" +
        "     on devnet at the configured JUP_LOCK_PROGRAM_ID.",
    );
  }
}

// ----------------------------------------------------------------------------
// Step 5: fees summary + GO/NO-GO verdict
// ----------------------------------------------------------------------------
function printVerdict() {
  console.log("\n=== FEES (verified docs.streamflow.finance/en/articles/9675153) ===");
  console.log("  Streamflow VESTING:   ~0.16 SOL flat service fee / contract");
  console.log("                        + ~0.0147 SOL network (metadata + ATA rent + sig).");
  console.log("  Streamflow TOKEN-LOCK: 0.16 SOL flat + 0.5% of tokens distributed.");
  console.log("                        ^ percentage-of-tokens fee is why we DO NOT use");
  console.log("                          Streamflow for LP locks.");
  console.log("  Jupiter Lock:         ZERO fee (audited, open-source) -> used for LP locks.");
  console.log("  (Auto-claim, if enabled later: ~0.25 SOL upfront + per-tx sig. We keep");
  console.log("   automaticWithdrawal=false in this spike to avoid it.)");

  console.log("\n=== GO / NO-GO ===");
  console.log("  VERDICT: GO (pending live devnet confirmation of the two TODOs).");
  console.log("  Rationale:");
  console.log("   - Streamflow create() multi-signer (sender + ephemeral metadata Keypair)");
  console.log("     is confirmed in SDK source and exercised explicitly above. Maps cleanly");
  console.log("     to Privy: Privy signs as sender, we generate+sign metadata client-side.");
  console.log("   - Jupiter Lock mirrors the pattern (ephemeral `base` co-signer; escrow PDA");
  console.log("     = ['escrow', base]) and is zero-fee -> correct choice for LP locking.");
  console.log("\n  CAVEATS:");
  console.log("   1. Privy must support adding an EXTRA local signer (metadata / base) to a");
  console.log("      tx it co-signs. Confirm Privy's signer API allows multi-signer txs");
  console.log("      (sign the partial tx, then attach the ephemeral signature) before prod.");
  console.log("   2. TOKEN-2022 TRANSFER FEE: if the creator mint carries a 3-5% transfer");
  console.log("      fee (see spike-a), the amount that LANDS in the vesting/lock escrow is");
  console.log("      NET of that fee. i.e. depositing X transfers X but escrow receives X*(1-fee).");
  console.log("      Set tokenProgramId=TOKEN_2022 and account for the haircut when sizing");
  console.log("      'amount' (gross-up), or vest a classic SPL allocation. Verify both SDKs");
  console.log("      handle T22 escrow ATAs + maybe transferCheckedWithFee internally.");
  console.log("   3. Jupiter Lock programmatic path uses the on-chain Anchor program directly");
  console.log("      (no stable first-party npm client). Pin the IDL and program id; the");
  console.log("      jup-lock TEST workspace id (2r5Vek...) is localnet, NOT devnet/mainnet.");
  console.log("   4. Streamflow service fee (~0.16 SOL) is per-contract — budget it per creator.");
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------
async function main() {
  console.log("=== SPIKE C: Vesting (Streamflow) + LP Lock (Jupiter Lock) — DEVNET ===");
  console.log(`RPC: ${RPC_URL}  cluster: devnet`);

  const payer = loadKeypair(); // PROD: Privy embedded/server wallet
  console.log(`payer (Privy stand-in): ${payer.publicKey.toBase58()}`);

  const recipient = process.env.SPIKE_RECIPIENT
    ? new PublicKey(process.env.SPIKE_RECIPIENT)
    : Keypair.generate().publicKey;
  console.log(`recipient: ${recipient.toBase58()}${process.env.SPIKE_RECIPIENT ? "" : " (throwaway)"}`);

  const connection = new Connection(RPC_URL, "confirmed");

  console.log("\n--- step 1/2: fund + mint + source token account ---");
  await ensureFunded(connection, payer.publicKey);
  const { mint } = await setupMintAndSource(connection, payer);

  await runStreamflowVesting(connection, payer, mint, recipient);
  await runJupiterLock(connection, payer, mint, recipient);

  printVerdict();
  console.log("\n=== done ===");
}

main().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});
