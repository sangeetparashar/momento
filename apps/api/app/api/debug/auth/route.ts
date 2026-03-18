import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No Bearer token', hasHeader: !!authHeader });
  }

  const token = authHeader.slice(7);
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  try {
    const privy = new PrivyClient(appId!, appSecret!);
    const claims = await privy.verifyAuthToken(token);
    return NextResponse.json({
      success: true,
      claims,
      appId,
      tokenPreview: token.substring(0, 30),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || String(error),
      errorName: error?.name,
      appId,
      hasSecret: !!appSecret,
      tokenLength: token.length,
      tokenPreview: token.substring(0, 30),
    });
  }
}
