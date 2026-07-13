import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Keep Database Active (Simple query)
    const activeWallets = await prisma.user.count();

    // 2. Auth challenges are now in Redis so we don't need to delete them here
    const deleteResult = { count: 0 };

    return NextResponse.json({
      success: true,
      activeWallets,
      deletedChallenges: deleteResult.count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
