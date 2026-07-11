import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

// Temporary debug endpoint — safe to call, returns NO sensitive data
// Call this from the deployed site to diagnose session issues
export async function GET() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const sessionCookie = cookieStore.get("Kredex_session");

  const result: Record<string, unknown> = {
    cookieCount: allCookies.length,
    cookieNames: allCookies.map((c) => c.name),
    hasKredexSession: !!sessionCookie?.value,
    jwtSecretPresent: !!JWT_SECRET,
    jwtSecretLength: JWT_SECRET?.length ?? 0,
    nodeEnv: process.env.NODE_ENV,
  };

  if (sessionCookie?.value) {
    const tokenPreview = sessionCookie.value.slice(0, 20) + "...";
    result.tokenPreview = tokenPreview;
    result.tokenPartCount = sessionCookie.value.split(".").length;

    try {
      const decoded = jwt.verify(sessionCookie.value, JWT_SECRET) as {
        sub: string;
        wallet: string;
        exp: number;
      };
      result.jwtValid = true;
      result.jwtSub = decoded.sub ? decoded.sub.slice(0, 8) + "..." : null;
      result.jwtWallet = decoded.wallet
        ? decoded.wallet.slice(0, 6) + "..." + decoded.wallet.slice(-4)
        : null;
      result.jwtExpiry = new Date(decoded.exp * 1000).toISOString();
    } catch (e) {
      result.jwtValid = false;
      result.jwtError = (e as Error).message;
    }
  }

  return NextResponse.json(result);
}
