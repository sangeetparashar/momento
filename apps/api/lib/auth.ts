import { PrivyClient } from '@privy-io/server-auth';
import { NextRequest } from 'next/server';
import prisma from './prisma';

let _privy: PrivyClient | null = null;
function getPrivy(): PrivyClient {
  if (!_privy) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('Missing PRIVY_APP_ID or PRIVY_APP_SECRET environment variables');
    }
    _privy = new PrivyClient(appId, appSecret);
  }
  return _privy;
}

export interface AuthUser {
  id: string;
  privyUserId: string;
  walletAddress: string;
  role: string;
  isAdmin: boolean;
}

/**
 * Verifies the Privy auth token from the Authorization header.
 * Returns the Privy user claims or null if invalid.
 */
async function verifyToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    const claims = await getPrivy().verifyAuthToken(token);
    return claims;
  } catch (error: any) {
    console.error('Auth token verification failed:', error?.message || error, 'Token preview:', token.substring(0, 20) + '...');
    return null;
  }
}

/**
 * Gets the authenticated user from the database. Creates a new user record
 * if one doesn't exist yet (first login via Privy).
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const claims = await verifyToken(request);
  if (!claims) {
    return null;
  }

  const privyUserId = claims.userId;

  // Check if user already exists in our database
  let user = await prisma.user.findUnique({
    where: { privyUserId },
    select: {
      id: true,
      privyUserId: true,
      walletAddress: true,
      role: true,
      isAdmin: true,
    },
  });

  if (!user) {
    // Fetch Privy user to get wallet address and email
    const privyUser = await getPrivy().getUser(privyUserId);
    const wallet = privyUser.wallet;
    const email = privyUser.email?.address || privyUser.google?.email;
    // Use wallet address if available, otherwise generate a placeholder
    const walletAddress = wallet?.address || `pending-${privyUserId}`;

    // Use upsert to avoid race condition when two concurrent first-login
    // requests both pass the findUnique check above. The second request
    // will hit the `update` branch (no-op) instead of failing with a
    // unique constraint violation.
    user = await prisma.user.upsert({
      where: { privyUserId },
      update: {},
      create: {
        privyUserId,
        walletAddress,
        email: email || null,
      },
      select: {
        id: true,
        privyUserId: true,
        walletAddress: true,
        role: true,
        isAdmin: true,
      },
    });
  } else if (user.walletAddress.startsWith('pending-')) {
    // User exists but wallet was created after initial signup — sync it
    try {
      const privyUser = await getPrivy().getUser(privyUserId);
      const wallet = privyUser.wallet;
      if (wallet?.address) {
        user = await prisma.user.update({
          where: { privyUserId },
          data: { walletAddress: wallet.address },
          select: {
            id: true,
            privyUserId: true,
            walletAddress: true,
            role: true,
            isAdmin: true,
          },
        });
      }
    } catch (error: any) {
      console.error('Failed to sync wallet address:', error?.message || error);
    }
  }

  return user;
}

/**
 * Requires authentication. Returns the user or throws a response.
 */
export async function requireAuth(
  request: NextRequest
): Promise<AuthUser> {
  const user = await getAuthUser(request);
  if (!user) {
    throw new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return user;
}

/**
 * Requires the user to be a CREATOR role.
 */
export async function requireCreator(
  request: NextRequest
): Promise<AuthUser> {
  const user = await requireAuth(request);
  if (user.role !== 'CREATOR') {
    throw new Response(
      JSON.stringify({ success: false, error: 'Creator access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return user;
}

/**
 * Requires the user to be an admin.
 */
export async function requireAdmin(
  request: NextRequest
): Promise<AuthUser> {
  const user = await requireAuth(request);
  if (!user.isAdmin) {
    throw new Response(
      JSON.stringify({ success: false, error: 'Admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return user;
}
