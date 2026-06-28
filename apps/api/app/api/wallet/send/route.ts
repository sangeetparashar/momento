import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TokenAccountNotFoundError,
} from '@solana/spl-token';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// USDC mint on devnet and mainnet
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT = process.env.SOLANA_NETWORK === 'mainnet-beta' ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
const USDC_DECIMALS = 6;

/**
 * POST /api/wallet/send
 *
 * Constructs an unsigned transaction for sending SOL or USDC to another wallet.
 * The mobile client signs this with the Privy embedded wallet and submits it.
 *
 * Body:
 *   - recipientAddress: destination Solana wallet address
 *   - amount: human-readable amount (e.g. "1.5" for 1.5 SOL or "10" for 10 USDC)
 *   - token: "SOL" or "USDC"
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);

    const body = await request.json();
    const { recipientAddress, amount, token } = body;

    // Validate inputs
    if (!recipientAddress || !amount || !token) {
      return NextResponse.json(
        { success: false, error: 'recipientAddress, amount, and token are required' },
        { status: 400 },
      );
    }

    if (!['SOL', 'USDC'].includes(token)) {
      return NextResponse.json(
        { success: false, error: 'token must be SOL or USDC' },
        { status: 400 },
      );
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'amount must be a positive number' },
        { status: 400 },
      );
    }

    // Validate addresses
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipientAddress);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid recipient address' },
        { status: 400 },
      );
    }

    const senderAddress = user.walletAddress;
    if (!senderAddress) {
      return NextResponse.json(
        { success: false, error: 'No wallet address found for user' },
        { status: 400 },
      );
    }

    const senderPubkey = new PublicKey(senderAddress);
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    let transaction: Transaction;

    if (token === 'SOL') {
      // Simple SOL transfer
      const lamports = Math.round(parsedAmount * LAMPORTS_PER_SOL);

      transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderPubkey,
          toPubkey: recipientPubkey,
          lamports,
        }),
      );
    } else {
      // SPL token (USDC) transfer
      const mintPubkey = new PublicKey(USDC_MINT);
      const rawAmount = Math.round(parsedAmount * Math.pow(10, USDC_DECIMALS));

      // Get or create associated token accounts
      const senderAta = await getAssociatedTokenAddress(mintPubkey, senderPubkey);
      const recipientAta = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

      transaction = new Transaction();

      // Check if recipient ATA exists — if not, create it (sender pays)
      try {
        await getAccount(connection, recipientAta);
      } catch (err) {
        if (err instanceof TokenAccountNotFoundError) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              senderPubkey,    // payer
              recipientAta,    // ata to create
              recipientPubkey, // owner
              mintPubkey,      // mint
            ),
          );
        } else {
          throw err;
        }
      }

      transaction.add(
        createTransferInstruction(
          senderAta,
          recipientAta,
          senderPubkey,
          BigInt(rawAmount),
        ),
      );
    }

    // Set recent blockhash and fee payer
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = senderPubkey;

    // Serialize as base64 for the client to sign
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');

    return NextResponse.json({
      success: true,
      data: { transaction: serializedTx },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if ((error as any)?.status) return error as any;

    console.error('[wallet/send] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to build send transaction' },
      { status: 500 },
    );
  }
}
