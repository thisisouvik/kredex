import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis/client';

/**
 * POST /api/auth/passkey/register
 * 
 * Called after a new passkey is created on the device.
 * Stores the credentialId and public key in Redis so verify can look it up.
 * Also persists to DB best-effort via raw pg (no Prisma to avoid connection issues).
 */
export async function POST(req: Request) {
  try {
    const { walletHandle, credentialId, publicKeyBase64 } = await req.json();

    if (!walletHandle || !credentialId) {
      return NextResponse.json({ error: 'Missing fields: walletHandle and credentialId are required' }, { status: 400 });
    }

    // Store passkey data in Redis (primary, fast lookup for auth)
    const passkeyKey = `passkey:profile:${walletHandle}`;
    await redis.set(passkeyKey, JSON.stringify({ walletHandle, credentialId, publicKeyBase64 }));

    // Also persist to DB (best-effort, non-blocking)
    try {
      const { Client } = await import('pg');
      const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });
      await client.connect();

      const kycData = JSON.stringify(publicKeyBase64 ? { credentialId, publicKeyBase64 } : { credentialId });
      await client.query(
        `INSERT INTO wallet_profiles (wallet_address, kyc_data)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (wallet_address)
         DO UPDATE SET kyc_data = EXCLUDED.kyc_data, updated_at = now()`,
        [walletHandle, kycData]
      );
      await client.end();
    } catch (dbErr) {
      console.warn('Passkey DB persist failed (non-fatal):', dbErr);
    }

    return NextResponse.json({ success: true, walletAddress: walletHandle });

  } catch (error) {
    console.error('Passkey register error:', error);
    return NextResponse.json({ error: 'Failed to register passkey' }, { status: 500 });
  }
}
