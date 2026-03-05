import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWebhookSignature, mapVeriffStatus, parseVeriffWebhookEvent } from '@/lib/veriff';
import { invalidateCache, cacheKeys } from '@/lib/redis';
import { notifyCreatorApproval } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hmac-signature') || '';

    // Verify webhook signature
    if (!signature || !verifyWebhookSignature(rawBody, signature)) {
      console.error('Invalid Veriff webhook signature');
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody);
    const { sessionId, statusCode, decision, person } = parseVeriffWebhookEvent(body);

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Missing session ID' },
        { status: 400 }
      );
    }

    // Find the KYC record
    const kycRecord = await prisma.kycRecord.findUnique({
      where: { veriffSessionId: sessionId },
      include: { user: { select: { id: true } } },
    });

    if (!kycRecord) {
      console.error('KYC record not found for session:', sessionId);
      return NextResponse.json(
        { success: false, error: 'KYC record not found' },
        { status: 404 }
      );
    }

    const kycStatus = mapVeriffStatus(statusCode);
    const isApproved = kycStatus === 'VERIFIED';

    // Update KYC record and user in a transaction
    await prisma.$transaction([
      prisma.kycRecord.update({
        where: { id: kycRecord.id },
        data: {
          status: kycStatus,
          veriffDecision: decision,
          veriffPerson: person,
          decidedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: kycRecord.user.id },
        data: {
          kycStatus,
          ...(isApproved && {
            role: 'CREATOR',
            isAdminApproved: true,
          }),
        },
      }),
    ]);

    // Invalidate user cache
    await invalidateCache(
      cacheKeys.userProfile(kycRecord.user.id),
      cacheKeys.creatorProfile(kycRecord.user.id)
    );

    // Notify the user about the decision
    notifyCreatorApproval(kycRecord.user.id, isApproved).catch((err) =>
      console.error('Failed to send KYC notification:', err)
    );

    return NextResponse.json({ success: true, data: { processed: true } });
  } catch (error) {
    console.error('KYC webhook error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process KYC webhook' },
      { status: 500 }
    );
  }
}
