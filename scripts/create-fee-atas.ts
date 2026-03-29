/**
 * create-fee-atas.ts
 *
 * Creates the wSOL Associated Token Account (ATA) for the Momento fee wallet.
 *
 * Fee wallet:  5U29gHgfeY8rnLcttjcQVLba1KGub9YUt6MP4yDc55yD
 * wSOL mint:   So11111111111111111111111111111111111111112
 * Expected ATA: CnjifXnj2QpiNe693xKHoA5WbpL42SFYNAxwEjUJtyBq
 *
 * ATA creation is permissionless -- ANY wallet can pay the rent (~0.002 SOL)
 * to create the account. No private key for the fee wallet is needed.
 *
 * Usage:
 *   npx tsx scripts/create-fee-atas.ts
 *
 * The script will:
 *   1. Check if the ATA already exists on-chain
 *   2. If not, build the createAssociatedTokenAccount instruction
 *   3. Output the transaction as base64 for external signing (e.g. Phantom)
 *
 * Set HELIUS_RPC_URL env var to use a private RPC, otherwise public mainnet is used.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEE_WALLET = new PublicKey(
  "5U29gHgfeY8rnLcttjcQVLba1KGub9YUt6MP4yDc55yD"
);
const WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);
const EXPECTED_ATA = new PublicKey(
  "CnjifXnj2QpiNe693xKHoA5WbpL42SFYNAxwEjUJtyBq"
);

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

// ---------------------------------------------------------------------------
// Derive the ATA address (mirrors getAssociatedTokenAddress from spl-token)
// ---------------------------------------------------------------------------

async function deriveATA(
  owner: PublicKey,
  mint: PublicKey
): Promise<PublicKey> {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

// ---------------------------------------------------------------------------
// Build the createAssociatedTokenAccountIdempotent instruction manually.
//
// The Associated Token Program supports two instructions:
//   0 = Create (fails if account exists)
//   1 = CreateIdempotent (no-op if account exists)
//
// We use instruction index 1 (CreateIdempotent) so the tx is safe to submit
// even if the ATA was created between our check and the actual submission.
//
// Accounts (all non-signer except payer):
//   0. [writable, signer] payer
//   1. [writable]         associated token account
//   2. []                 wallet (owner)
//   3. []                 token mint
//   4. []                 system program
//   5. []                 token program
// ---------------------------------------------------------------------------

function createAssociatedTokenAccountIdempotentInstruction(
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]), // instruction index 1 = CreateIdempotent
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rpcUrl =
    process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";

  console.log("=== Momento Fee Wallet ATA Creator ===\n");
  console.log(`RPC:        ${rpcUrl.includes("helius") ? "(Helius private)" : rpcUrl}`);
  console.log(`Fee wallet: ${FEE_WALLET.toBase58()}`);
  console.log(`wSOL mint:  ${WSOL_MINT.toBase58()}`);
  console.log(`Expected ATA: ${EXPECTED_ATA.toBase58()}\n`);

  // Verify our derivation matches the expected ATA
  const derivedAta = await deriveATA(FEE_WALLET, WSOL_MINT);
  if (!derivedAta.equals(EXPECTED_ATA)) {
    console.error(
      `ERROR: Derived ATA ${derivedAta.toBase58()} does not match expected ${EXPECTED_ATA.toBase58()}`
    );
    process.exit(1);
  }
  console.log("Derived ATA matches expected address.\n");

  // Connect and check if ATA already exists
  const connection = new Connection(rpcUrl, "confirmed");

  const accountInfo = await connection.getAccountInfo(EXPECTED_ATA);
  if (accountInfo !== null) {
    console.log("ATA already exists on-chain. Nothing to do.");
    console.log(`  Owner program: ${accountInfo.owner.toBase58()}`);
    console.log(`  Data length:   ${accountInfo.data.length} bytes`);
    console.log(`  Lamports:      ${accountInfo.lamports}`);
    process.exit(0);
  }

  console.log("ATA does NOT exist yet. Building transaction...\n");

  // Use a placeholder payer -- the actual signer will fill this in.
  // We use the fee wallet itself as a placeholder; the signing wallet
  // will replace feePayer before signing.
  const placeholderPayer = FEE_WALLET;

  const ix = createAssociatedTokenAccountIdempotentInstruction(
    placeholderPayer,
    EXPECTED_ATA,
    FEE_WALLET,
    WSOL_MINT
  );

  const tx = new Transaction().add(ix);

  // Fetch a recent blockhash so the serialised tx is valid
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = placeholderPayer;

  // Serialize WITHOUT requiring signatures (we want unsigned base64)
  const serialized = tx
    .serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
    .toString("base64");

  console.log("Transaction built successfully.\n");
  console.log("--- Base64 Transaction (unsigned) ---");
  console.log(serialized);
  console.log("--- End ---\n");

  console.log("How to submit this transaction:\n");
  console.log("Option A: Use Phantom or another wallet to sign and send.");
  console.log("  1. Decode the base64 into a Transaction object");
  console.log("  2. Set tx.feePayer to your wallet's public key");
  console.log("  3. Sign with your wallet and send via connection.sendRawTransaction\n");
  console.log("Option B: Use solana CLI (if you have a keypair file):");
  console.log(
    "  solana transfer --allow-unfunded-recipient " +
      EXPECTED_ATA.toBase58() +
      " 0 --fund-recipient"
  );
  console.log(
    "\nNote: Creating this ATA costs ~0.00203928 SOL in rent (refundable)."
  );
  console.log("Any wallet can pay -- no fee wallet private key needed.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
