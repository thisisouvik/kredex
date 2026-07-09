import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId, walletAddress } = await req.json();

    if (!userId || !walletAddress) {
      return NextResponse.json({ error: 'Missing userId or walletAddress' }, { status: 400 });
    }

    const { Client } = await import('pg');
    const rawUrl = process.env.DATABASE_URL?.split('?')[0];
    const client = new Client({
      connectionString: rawUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    
    await client.connect();
    
    // Update profiles
    await client.query(
      `UPDATE profiles SET wallet_address = $1 WHERE id = $2`,
      [walletAddress, userId]
    );

    // Sync wallet_profiles
    await client.query(
      `INSERT INTO wallet_profiles (id, wallet_address) VALUES ($1, $2)
       ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()`,
      [userId, walletAddress]
    );

    await client.end();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Link wallet error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
