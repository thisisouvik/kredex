import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  try {
    const authData = await getAuthenticatedUser();
    if (!authData?.user) {
      return NextResponse.json({ notifications: [] }, { status: 200 });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: authData.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ notifications });
  } catch (err) {
    console.warn("Notifications fetch error:", err);
    return NextResponse.json({ notifications: [] }, { status: 200 });
  }
}
