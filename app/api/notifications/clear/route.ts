import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export async function POST(_request: NextRequest) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Delete all notifications for this user
    await prisma.notification.deleteMany({
      where: { userId }
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (_error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
