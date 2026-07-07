import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { walletAddress, authType, credentialId } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }

    // For passkey wallets, also store the credentialId with the challenge
    // so the verify step can look it up
    if (authType === 'passkey' && !credentialId) {
      return NextResponse.json({ error: 'credentialId required for passkey auth' }, { status: 400 });
    }

    const nonce = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.authChallenge.upsert({
      where: { walletAddress },
      update: { nonce, expiresAt },
      create: { walletAddress, nonce, expiresAt },
    });

    return NextResponse.json({ nonce });

  } catch (error) {
    console.error('Challenge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
