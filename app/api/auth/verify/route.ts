import { NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { redis } from '@/lib/redis/client';

const JWT_SECRET = process.env.JWT_SECRET || 'Kredex-super-secret-jwt-key-change-in-prod';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { walletAddress, signature, authType } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 });
    }

    // ── Fetch Challenge from Redis ────────────────────────────────────────────
    const key = `auth:challenge:${walletAddress}`;
    const raw = await redis.get<string>(key);

    if (!raw) {
      return NextResponse.json({ error: 'Challenge not found or expired. Please request a new one.' }, { status: 404 });
    }

    const challengeData = typeof raw === 'string' ? JSON.parse(raw) : raw as { nonce: string };
    const { nonce } = challengeData;

    // ── Verify Signature by auth type ────────────────────────────────────────
    if (authType === 'passkey') {
      // WebAuthn passkey path — verify the nonce is embedded in the clientDataJSON
      const { credentialId, clientDataJSON, authenticatorData, signatureB64 } = body;
      if (!credentialId || !clientDataJSON || !authenticatorData || !signatureB64) {
        return NextResponse.json({ error: 'Missing passkey assertion fields' }, { status: 400 });
      }

      // Verify the nonce is embedded in the clientDataJSON challenge field
      const clientData = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
      const challengeInAssertion = Buffer.from(clientData.challenge, 'base64url').toString('utf8');

      if (challengeInAssertion !== nonce) {
        return NextResponse.json({ error: 'Challenge mismatch — passkey authentication failed.' }, { status: 401 });
      }

    } else {
      // Ed25519 path — Freighter / Albedo traditional wallet
      if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
      }

      let isValid = false;
      try {
        const keypair = Keypair.fromPublicKey(walletAddress);
        isValid = keypair.verify(Buffer.from(nonce), Buffer.from(signature, 'base64'));
      } catch (e) {
        console.error('Ed25519 verification failed:', e);
        return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
      }

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // ── Delete challenge (single-use) ─────────────────────────────────────────
    await redis.del(key);

    // ── Upsert Wallet Profile in DB ───────────────────────────────────────────
    let profileId: string;
    try {
      const profile = await prisma.walletProfile.upsert({
        where: { walletAddress },
        update: {},
        create: { walletAddress },
      });
      profileId = profile.id;
    } catch (dbError) {
      // If DB is unreachable, use wallet address as a stable ID so auth still works
      console.error('DB upsert failed (non-fatal):', dbError);
      profileId = walletAddress;
    }

    // ── Issue JWT Session ─────────────────────────────────────────────────────
    const token = jwt.sign(
      { sub: profileId, wallet: walletAddress, authType: authType ?? 'stellar' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    (await cookies()).set({
      name: 'Kredex_session',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return NextResponse.json({ success: true, wallet: walletAddress });

  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
