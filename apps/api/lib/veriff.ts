import crypto from 'crypto';
import { KycStatus } from '@momento/shared';

const VERIFF_API_KEY = process.env.VERIFF_API_KEY!;
const VERIFF_SHARED_SECRET = process.env.VERIFF_SHARED_SECRET!;
const VERIFF_BASE_URL = 'https://stationapi.veriff.com/v1';

interface VeriffSession {
  id: string;
  url: string;
  status: string;
}

interface VeriffSessionResponse {
  status: string;
  verification: VeriffSession;
}

/**
 * Creates a new Veriff KYC verification session for a user.
 */
export async function createVeriffSession(
  userId: string,
  firstName?: string,
  lastName?: string
): Promise<VeriffSession> {
  const payload = {
    verification: {
      callback: `${process.env.NEXT_PUBLIC_API_URL}/api/kyc/webhook`,
      person: {
        firstName: firstName || 'Momento',
        lastName: lastName || 'User',
        idNumber: userId,
      },
      vendorData: userId,
      timestamp: new Date().toISOString(),
    },
  };

  const response = await fetch(`${VERIFF_BASE_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AUTH-CLIENT': VERIFF_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Veriff session creation failed: ${response.status} ${errorText}`);
  }

  const data: VeriffSessionResponse = await response.json();
  return data.verification;
}

/**
 * Verifies the HMAC signature of a Veriff webhook payload.
 * Returns true if the signature is valid.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', VERIFF_SHARED_SECRET)
    .update(Buffer.from(payload, 'utf8'))
    .digest('hex')
    .toLowerCase();

  return crypto.timingSafeEqual(
    Buffer.from(signature.toLowerCase()),
    Buffer.from(expectedSignature)
  );
}

/**
 * Maps a Veriff decision status code to our internal KycStatus enum.
 */
export function mapVeriffStatus(veriffStatusCode: number): KycStatus {
  switch (veriffStatusCode) {
    case 9001: // approved
      return KycStatus.VERIFIED;
    case 9102: // declined
    case 9103: // resubmission requested
    case 9104: // expired
      return KycStatus.REJECTED;
    default:
      return KycStatus.PENDING;
  }
}

/**
 * Parses the Veriff webhook event to extract decision data.
 */
export function parseVeriffWebhookEvent(body: any): {
  sessionId: string;
  statusCode: number;
  decision: any;
  person: any;
} {
  return {
    sessionId: body.verification?.id || body.id,
    statusCode: body.verification?.code || body.code,
    decision: body.verification || body,
    person: body.verification?.person || body.person || null,
  };
}
