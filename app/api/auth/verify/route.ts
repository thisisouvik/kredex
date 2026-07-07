import { NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'trustlend-super-secret-jwt-key-change-in-prod';

export async function POST(req: Request) {
  try {
    const { walletAddress, signature } = await req.json();

    if (!walletAddress || !signature) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. Fetch challenge
    const challenge = await prisma.authChallenge.findUnique({
      where: { walletAddress },
    });

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found or expired' }, { status: 404 });
    }

    // 2. Validate expiration
    if (new Date() > challenge.expiresAt) {
      await prisma.authChallenge.delete({ where: { walletAddress } });
      return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });
    }

    // 3. Verify Signature
    let isValid = false;
    try {
      const keypair = Keypair.fromPublicKey(walletAddress);
      // Freighter/Albedo/xBull signs the message directly.
      isValid = keypair.verify(Buffer.from(challenge.nonce), Buffer.from(signature, 'base64'));
    } catch (e) {
      console.error('Signature verification failed:', e);
      return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 4. Get or Create Wallet Profile
    let profile = await prisma.walletProfile.findUnique({
      where: { walletAddress },
    });

    if (!profile) {
      profile = await prisma.walletProfile.create({
        data: {
          walletAddress,
        },
      });
    }

    // 5. Clean up challenge
    await prisma.authChallenge.delete({ where: { walletAddress } });

    // 6. Issue JWT Session
    const token = jwt.sign(
      { sub: profile.id, wallet: walletAddress },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set HTTP-only cookie
    (await cookies()).set({
      name: 'trustlend_session',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
