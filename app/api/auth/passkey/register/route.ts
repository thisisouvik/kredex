import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * POST /api/auth/passkey/register
 * 
 * Called after a new passkey is created on the device.
 * Stores the credentialId and public key against a wallet handle in the DB.
 */
export async function POST(req: Request) {
  try {
    const { walletHandle, credentialId, publicKeyBase64 } = await req.json();

    if (!walletHandle || !credentialId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const kycData = publicKeyBase64
      ? { credentialId, publicKeyBase64 }
      : { credentialId };

    // Store the passkey wallet profile
    const profile = await prisma.walletProfile.upsert({
      where: { walletAddress: walletHandle },
      update: { kycData },
      create: {
        walletAddress: walletHandle,
        kycData,
      },
    });

    return NextResponse.json({ success: true, profileId: profile.id, walletAddress: profile.walletAddress });

  } catch (error) {
    console.error('Passkey register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
