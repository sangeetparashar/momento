import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getWalletForChain, type AuthUser } from '@/lib/auth';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { CHAIN_CONFIG } from '@momento/shared';
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
    const { recipientAddress, amount, token, chain = 'solana' } = body;

    // Validate inputs
    if (!recipientAddress || !amount || !token) {
      return NextResponse.json(
        { success: false, error: 'recipientAddress, amount, and token are required' },
        { status: 400 },
      );
    }

    if (!['SOL', 'USDC', 'ETH'].includes(token)) {
      return NextResponse.json(
        { success: false, error: 'token must be SOL, USDC, or ETH' },
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

    // --- BASE CHAIN ---
    if (chain === 'base') {
      return handleBaseSend(user, recipientAddress, parsedAmount, token);
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

/**
 * Builds an unsigned EVM transaction for Base chain.
 * Returns raw EVM tx params (to/value/data) instead of a serialized transaction —
 * the mobile client signs and submits via the Privy ETH wallet provider.
 */
function handleBaseSend(
  user: AuthUser,
  recipientAddress: string,
  amount: number,
  token: string,
) {
  const walletAddress = getWalletForChain(user, 'base');
  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'No Base wallet found for user' },
      { status: 400 },
    );
  }

  // Validate Base address format (0x + 40 hex chars)
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
    return NextResponse.json(
      { success: false, error: 'Invalid Base/Ethereum address' },
      { status: 400 },
    );
  }

  // Prevent self-send (case-insensitive for hex addresses)
  if (recipientAddress.toLowerCase() === walletAddress.toLowerCase()) {
    return NextResponse.json(
      { success: false, error: 'Cannot send to yourself' },
      { status: 400 },
    );
  }

  if (token === 'ETH') {
    // Native ETH transfer — simple value transfer
    const weiAmount = BigInt(Math.floor(amount * 1e18));

    return NextResponse.json({
      success: true,
      data: {
        chain: 'base',
        transactionType: 'native',
        to: recipientAddress,
        value: '0x' + weiAmount.toString(16),
        from: walletAddress,
        chainId: 8453,
      },
    });
  }

  if (token === 'USDC') {
    // ERC-20 transfer — encode transfer(address,uint256) calldata
    const usdcAddress = CHAIN_CONFIG.base.usdcAddress;
    const usdcDecimals = CHAIN_CONFIG.base.usdcDecimals; // 6
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, usdcDecimals)));

    // Function selector for transfer(address,uint256): 0xa9059cbb
    const recipientPadded = recipientAddress.slice(2).toLowerCase().padStart(64, '0');
    const amountPadded = rawAmount.toString(16).padStart(64, '0');
    const data = '0xa9059cbb' + recipientPadded + amountPadded;

    return NextResponse.json({
      success: true,
      data: {
        chain: 'base',
        transactionType: 'erc20',
        to: usdcAddress,
        value: '0x0',
        data,
        from: walletAddress,
        chainId: 8453,
      },
    });
  }

  return NextResponse.json(
    { success: false, error: 'Unsupported token for Base chain. Use ETH or USDC.' },
    { status: 400 },
  );
}
