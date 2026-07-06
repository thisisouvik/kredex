import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { walletAddress } = await req.json();

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }

    // Generate a secure random nonce
    const nonce = crypto.randomBytes(32).toString('hex');
    
    // Set expiration to 5 minutes from now
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Upsert to handle retries for the same wallet
    const challenge = await prisma.authChallenge.upsert({
      where: { walletAddress },
      update: {
        nonce,
        expiresAt,
      },
      create: {
        walletAddress,
        nonce,
        expiresAt,
      },
    });

    return NextResponse.json({ nonce: challenge.nonce });
  } catch (error) {
    console.error('Challenge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
