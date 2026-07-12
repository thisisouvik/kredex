import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

/**
 * GET /api/auth/me
 * Returns the current user from the Kredex_session JWT cookie.
 * Used by client components that need to check auth status
 * without relying on Supabase Auth (which we don't use for wallet login).
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("Kredex_session")?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const decoded = jwt.decode(token) as {
      sub?: string;
      wallet?: string;
      role?: string;
      exp?: number;
    } | null;

    if (!decoded?.sub || !decoded?.wallet) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    if (decoded.exp && Date.now() / 1000 > decoded.exp) {
      return NextResponse.json({ authenticated: false, reason: "expired" }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: decoded.sub,
        wallet: decoded.wallet,
        role: decoded.role ?? "borrower",
      },
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
