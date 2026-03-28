/**
 * create-fee-atas-send.ts
 *
 * Creates Associated Token Accounts (ATAs) for the Momento fee wallet,
 * then signs and submits the transaction using a local keypair.
 *
 * Supports wSOL, USDC, and top Solana tokens so the platform fee (4%)
 * is collected on ALL swap output tokens.
 *
 * Usage:
 *   KEYPAIR_PATH=~/.config/solana/id.json npx tsx scripts/create-fee-atas-send.ts
 *
 * Or with Helius RPC:
 *   HELIUS_RPC_URL=https://rpc.helius.xyz/?api-key=... KEYPAIR_PATH=~/.config/solana/id.json npx tsx scripts/create-fee-atas-send.ts
 *
 * Cost: ~0.002 SOL per ATA (rent-exempt, refundable).
 * Any wallet can pay — no fee wallet private key needed.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Fee Wallet
// ---------------------------------------------------------------------------

const FEE_WALLET = new PublicKey(
  "5U29gHgfeY8rnLcttjcQVLba1KGub9YUt6MP4yDc55yD"
);

// ---------------------------------------------------------------------------
// Token mints to create ATAs for.
// The fee is always taken from the OUTPUT token of a swap.
// We need an ATA for every token the user might swap INTO.
// ---------------------------------------------------------------------------

const TOKEN_MINTS: Record<string, string> = {
  // Core
  wSOL:   "So11111111111111111111111111111111111111112",
  USDC:   "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT:   "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",

  // Top meme/utility tokens (by Solana volume)
  BONK:   "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  JUP:    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  WIF:    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  PYTH:   "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  RAY:    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  ORCA:   "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  RENDER: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
};

// ---------------------------------------------------------------------------
// Solana program constants
// ---------------------------------------------------------------------------

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveATA(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

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
    data: Buffer.from([1]), // 1 = CreateIdempotent (no-op if exists)
  });
}

function loadKeypair(): Keypair {
  const keypairPath =
    process.env.KEYPAIR_PATH ||
    path.join(process.env.HOME || "~", ".config", "solana", "id.json");

  if (!fs.existsSync(keypairPath)) {
    console.error(`\nKeypair file not found: ${keypairPath}`);
    console.error("Set KEYPAIR_PATH env var to your keypair JSON file.");
    console.error(
      "Generate one with: solana-keygen new --outfile ~/my-keypair.json\n"
    );
    process.exit(1);
  }

  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rpcUrl =
    process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  console.log("=== Momento Fee Wallet — Multi-Token ATA Creator ===\n");
  console.log(
    `RPC:         ${rpcUrl.includes("helius") ? "(Helius private)" : rpcUrl}`
  );
  console.log(`Fee wallet:  ${FEE_WALLET.toBase58()}`);
  console.log(`Tokens:      ${Object.keys(TOKEN_MINTS).join(", ")}\n`);

  // Check which ATAs need to be created
  const toCreate: { symbol: string; mint: PublicKey; ata: PublicKey }[] = [];
  const alreadyExists: string[] = [];

  for (const [symbol, mintStr] of Object.entries(TOKEN_MINTS)) {
    const mint = new PublicKey(mintStr);
    const ata = deriveATA(FEE_WALLET, mint);

    const accountInfo = await connection.getAccountInfo(ata);
    if (accountInfo !== null) {
      alreadyExists.push(symbol);
      console.log(`  ✅ ${symbol.padEnd(8)} ATA exists:   ${ata.toBase58()}`);
    } else {
      toCreate.push({ symbol, mint, ata });
      console.log(`  ❌ ${symbol.padEnd(8)} ATA missing:  ${ata.toBase58()}`);
    }
  }

  console.log(
    `\nExisting: ${alreadyExists.length} | Need creation: ${toCreate.length}\n`
  );

  if (toCreate.length === 0) {
    console.log("All ATAs already exist. Nothing to do! 🎉");
    process.exit(0);
  }

  // Load keypair for signing
  const payer = loadKeypair();
  console.log(`Payer:       ${payer.publicKey.toBase58()}`);

  const payerBalance = await connection.getBalance(payer.publicKey);
  const payerSol = payerBalance / 1e9;
  const estimatedCost = toCreate.length * 0.00204;
  console.log(`Balance:     ${payerSol.toFixed(4)} SOL`);
  console.log(
    `Est. cost:   ~${estimatedCost.toFixed(4)} SOL (${toCreate.length} ATAs × ~0.00204 SOL rent)\n`
  );

  if (payerSol < estimatedCost + 0.001) {
    console.error(
      `Insufficient balance. Need ~${(estimatedCost + 0.001).toFixed(4)} SOL.`
    );
    process.exit(1);
  }

  // Build transaction(s) — max ~5 ATAs per tx to stay under compute budget
  const BATCH_SIZE = 5;
  let created = 0;

  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);
    const batchSymbols = batch.map((b) => b.symbol).join(", ");

    console.log(
      `--- Batch ${Math.floor(i / BATCH_SIZE) + 1}: Creating ATAs for ${batchSymbols} ---`
    );

    const tx = new Transaction();
    for (const { mint, ata } of batch) {
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          ata,
          FEE_WALLET,
          mint
        )
      );
    }

    try {
      const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
        commitment: "confirmed",
      });
      created += batch.length;
      console.log(`  ✅ Confirmed: https://solscan.io/tx/${sig}`);
    } catch (err: any) {
      console.error(`  ❌ Failed: ${err.message}`);
      console.error("    Continuing with remaining batches...\n");
    }
  }

  console.log(`\n=== Done! Created ${created}/${toCreate.length} ATAs ===`);
  console.log(
    "The Momento platform will now collect 4% fees on swaps to these tokens."
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
