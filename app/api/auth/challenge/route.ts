import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis/client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { walletAddress, authType, credentialId } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }

    // For passkey wallets, credentialId is required
    if (authType === 'passkey' && !credentialId) {
      return NextResponse.json({ error: 'credentialId required for passkey auth' }, { status: 400 });
    }

    const nonce = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

    // Store nonce in Redis with 5-minute TTL — no database needed!
    const key = `auth:challenge:${walletAddress}`;
    await redis.set(key, JSON.stringify({ nonce, authType, credentialId }), { ex: 5 * 60 });

    return NextResponse.json({ nonce });

  } catch (error) {
    console.error('Challenge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
