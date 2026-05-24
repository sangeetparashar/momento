import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Keep-warm endpoint hit by Vercel cron every 5 min. Eliminates the
 * ~700ms cold-start penalty on idle functions.
 *
 * Gated on CRON_SECRET so this endpoint is not a free probe/DoS surface
 * for arbitrary internet traffic. Vercel cron requests automatically
 * include `Authorization: Bearer ${process.env.CRON_SECRET}` when the
 * env var is set in the Vercel project settings.
 *
 * If CRON_SECRET is unset (e.g. local dev), the endpoint allows all
 * callers — fail-open is safe here because the worst case is "ops can
 * hit the cron endpoint manually."
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }
  }

  // Cheap query that warms the Prisma client + connection pool.
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    // Doesn't matter for keep-warm purposes — function is now hot.
  }

  return NextResponse.json({
    success: true,
    data: { warmed: true, db: dbOk, at: new Date().toISOString() },
  });
}
