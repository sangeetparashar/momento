/**
 * POST /api/vesting/[id]/confirm — User (recipient OR sender/creator) · writeLimiter.
 *
 * The vesting confirm contract (P1 hardening). Both the create CLIENT path and the
 * withdraw path are recipient/creator self-submitted: the mobile client signs and
 * relays the tx itself, then calls THIS route with the landed signature. The old
 * /api/wallet/transactions/log route only ever handled swap/send/receive/fund and
 * never touched VestingSchedule, so client-path rows stayed PENDING forever and
 * releasedBaseUnits was never written — leaving a confirmed schedule looking fully
 * unwithdrawn on any DB-only read and permanently consuming a creator's allocation
 * ceiling via stuck-PENDING rows.
 *
 * This route NEVER trusts a client-supplied amount/status. It:
 *   1. requireAuth + authorize the caller as the recipient (beneficiaryUserId ===
 *      user.id, else beneficiaryWallet === wallet) OR the sender/creator
 *      (CreatorToken.userId === user.id).
 *   2. Fetch the supplied signature's confirmed tx and require it landed
 *      successfully (meta.err == null) AND references this schedule's streamId
 *      (the stream/escrow PDA) in its account keys — so a caller cannot point an
 *      unrelated signature at this row.
 *   3. Re-derive the authoritative funded/withdrawn totals from the on-chain
 *      stream/escrow account itself (getVestingState), and persist
 *      releasedBaseUnits + status (PENDING→ACTIVE on a confirmed create; →COMPLETED
 *      when fully withdrawn). Terminal CANCELED rows are left untouched.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth, getWalletForChain } from '@/lib/auth';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { isValidUuid, isValidMint } from '@/lib/validation';
import prisma from '@/lib/prisma';

import { getVestingState } from '@/lib/vesting';
import { getConnection } from '@/lib/solana';
import { SolanaTxError } from '@/lib/solana';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // G-1 (authz P1-A): auth-first per-user fail-closed limiting. IP/XFF keying lets
    // a caller rotate X-Forwarded-For for a fresh bucket per request and lets unauth
    // traffic pre-burn a NAT's bucket on this state-mutating write path.
    // failClosed: a Redis outage must not silently disable the cap.
    const user = await requireAuth(request);
    const rateLimitResponse = await applyRateLimit(request, writeLimiter, user.id, {
      failClosed: true,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const signature: unknown = body?.signature;
    // A Solana tx signature is base58 (same alphabet as a mint); reuse the guard.
    if (typeof signature !== 'string' || !isValidMint(signature)) {
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 });
    }

    const schedule = await prisma.vestingSchedule.findUnique({
      where: { id },
      include: { token: { select: { userId: true, tokenProgram: true } } },
    });
    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Vesting not found' }, { status: 404 });
    }

    // AuthZ: recipient (preferred via beneficiaryUserId, else wallet equality) OR
    // the sender/creator who owns the token.
    const wallet = getWalletForChain(user);
    const isRecipient =
      schedule.beneficiaryUserId != null
        ? schedule.beneficiaryUserId === user.id
        : wallet != null && schedule.beneficiaryWallet === wallet;
    const isSender = schedule.token?.userId === user.id;
    if (!isRecipient && !isSender) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (schedule.status === 'CANCELED') {
      return NextResponse.json({ success: false, error: 'Vesting is canceled' }, { status: 409 });
    }
    if (!schedule.streamId) {
      // No on-chain account to confirm against — the create tx never carried a PDA.
      return NextResponse.json(
        { success: false, error: 'Vesting has no on-chain stream/escrow to confirm' },
        { status: 409 },
      );
    }

    // (2) Verify the supplied signature actually landed AND references THIS
    // schedule's stream/escrow PDA — bind the confirmation to the real on-chain row.
    let tx: any = null;
    try {
      tx = await getConnection().getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      tx = null;
    }
    if (!tx || tx.meta == null || tx.meta.err != null) {
      return NextResponse.json(
        { success: false, error: 'Signature not confirmed on-chain' },
        { status: 409 },
      );
    }
    if (!txReferencesAccount(tx, schedule.streamId)) {
      return NextResponse.json(
        { success: false, error: 'Signature does not reference this vesting' },
        { status: 400 },
      );
    }

    // (3) Re-derive the authoritative state from the on-chain stream/escrow itself.
    // NEVER trust a client-supplied releasedBaseUnits — getVestingState reads the
    // actual deposited/withdrawn totals from the account.
    const isToken2022 = schedule.token?.tokenProgram === 'TOKEN_2022';
    const state = await getVestingState(schedule, { isToken2022 });

    // Persist re-derived truth. Only advance forward: never overwrite a terminal
    // CANCELED (guarded above) and never regress releasedBaseUnits below the stored
    // value (on-chain withdrawn is monotonic, but a stale read shouldn't shrink it).
    let released = schedule.releasedBaseUnits;
    try {
      const onchain = BigInt(state.withdrawnBase);
      const stored = BigInt(schedule.releasedBaseUnits);
      if (onchain > stored) released = onchain.toString();
    } catch {
      /* keep stored value on any parse hiccup */
    }

    const updated = await prisma.vestingSchedule.update({
      where: { id: schedule.id },
      data: {
        releasedBaseUnits: released,
        status: state.status,
        // Record the create signature once, when a client-path create confirms.
        ...(schedule.status === 'PENDING' && !schedule.createSignature
          ? { createSignature: signature }
          : {}),
      },
      select: { id: true, status: true, releasedBaseUnits: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        vestingId: updated.id,
        status: updated.status,
        releasedBase: updated.releasedBaseUnits,
        totalBase: state.totalBase,
        claimableBase: state.claimableBase,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof SolanaTxError) {
      const status = error.code === 'CONFIG_MISSING' || error.code === 'STUBBED' ? 500 : 502;
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status },
      );
    }
    // A unique-constraint race on createSignature (two confirms of the same client
    // create) is benign — surface a clean 409 rather than a 500.
    if ((error as any)?.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Already confirmed' }, { status: 409 });
    }
    console.error('Vesting confirm error:', error);
    return NextResponse.json({ success: false, error: 'Failed to confirm vesting' }, { status: 500 });
  }
}

/**
 * True if the confirmed tx references `account` (the stream/escrow PDA) anywhere in
 * its static or loaded (ALT) account keys. Handles both legacy and v0 message
 * shapes returned by getTransaction with maxSupportedTransactionVersion: 0.
 */
function txReferencesAccount(tx: any, account: string): boolean {
  try {
    const keys: string[] = [];
    const msg = tx?.transaction?.message;
    // Legacy: message.accountKeys is PublicKey[] (or string[]). v0: same field holds
    // the STATIC keys; loaded addresses live in meta.loadedAddresses.
    const rawKeys = msg?.accountKeys ?? msg?.staticAccountKeys ?? [];
    for (const k of rawKeys) keys.push(typeof k === 'string' ? k : k?.toBase58?.() ?? String(k));
    const loaded = tx?.meta?.loadedAddresses;
    for (const k of loaded?.writable ?? []) keys.push(typeof k === 'string' ? k : k?.toBase58?.() ?? String(k));
    for (const k of loaded?.readonly ?? []) keys.push(typeof k === 'string' ? k : k?.toBase58?.() ?? String(k));
    return keys.includes(account);
  } catch {
    return false;
  }
}
