import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  const status: { db: boolean; timestamp: string } = {
    db: false,
    timestamp: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    status.db = true;
  } catch {
    // DB check failed
  }

  const isHealthy = status.db;

  return NextResponse.json(
    {
      success: isHealthy,
      data: {
        status: isHealthy ? 'healthy' : 'degraded',
        ...status,
      },
    },
    { status: isHealthy ? 200 : 503 }
  );
}
