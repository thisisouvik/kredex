import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is missing. Check your .env file.");

export async function requireAuthenticatedUser(expectedRole?: string) {
  // Check dev auth bypass first
  const DEV_BYPASS_ENABLED =
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_AUTH_BYPASS === "true";

  if (DEV_BYPASS_ENABLED) {
    const headerList = await headers();
    const bypassUserId = headerList.get("x-dev-user-id")?.trim();
    const bypassRole = headerList.get("x-dev-role")?.trim() || "borrower";
    const bypassEmail = headerList.get("x-dev-email")?.trim() || "bypass@kredex.dev";
    
    if (bypassUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bypassUserId)) {
      if (expectedRole && bypassRole !== expectedRole) {
        redirect("/auth");
      }
      
      try {
        await prisma.user.upsert({
          where: { id: bypassUserId },
          create: { id: bypassUserId, walletAddress: "GBYPASSADDRESS0000000000000000000000000000000000000000000", role: bypassRole, fullName: `Dev Bypass ${bypassRole}` },
          update: { role: bypassRole }
        });
      } catch (e) {
        // Ignore errors, might be read-only or offline
      }

      return {
        user: {
          id: bypassUserId,
          wallet: "GBYPASSADDRESS0000000000000000000000000000000000000000000",
          email: bypassEmail,
          user_metadata: { 
            account_type: bypassRole,
            full_name: `Dev Bypass ${bypassRole}`,
            wallet_address: "GBYPASSADDRESS0000000000000000000000000000000000000000000"
          },
          email_confirmed_at: "",
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
        },
        role: bypassRole
      };
    }
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("Kredex_session")?.value;

  if (token) {
    try {
      const decoded = jwt.decode(token) as {
        sub?: string;
        wallet?: string;
        role?: string;
        authType?: string;
        exp?: number;
        iat?: number;
      } | null;

      if (!decoded || !decoded.sub || !decoded.wallet) {
        console.error("[session] REJECTED: missing sub or wallet in decoded token");
        return redirect("/auth");
      }

      if (decoded.exp && Date.now() / 1000 > decoded.exp) {
        console.error("[session] REJECTED: token expired at", decoded.exp);
        return redirect("/auth");
      }

      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.sub);
      if (!isUUID) {
        console.error("[session] REJECTED: sub is not a UUID:", decoded.sub);
        return redirect("/auth");
      }

      if (!decoded.wallet.startsWith("G") || decoded.wallet.length < 50) {
        console.error("[session] REJECTED: invalid wallet address:", decoded.wallet);
        return redirect("/auth");
      }

      // Fetch role from NeonDB via Prisma
      let userRole = decoded.role || "borrower";
      let userEmail = "";
      let fullName = "Wallet User";
      try {
        const profile = await prisma.user.findUnique({
          where: { id: decoded.sub },
          select: { role: true, email: true, fullName: true },
        });
        if (profile) {
          userRole = profile.role || decoded.role || "borrower";
          userEmail = profile.email ?? "";
          fullName = profile.fullName ?? "Wallet User";
        }
      } catch (dbErr) {
        console.error("[session] DB fetch failed (non-fatal):", dbErr);
      }

      return {
        user: {
          id: decoded.sub,
          wallet: decoded.wallet,
          email: userEmail,
          user_metadata: {
            account_type: userRole,
            full_name: fullName,
            wallet_address: decoded.wallet,
          },
          email_confirmed_at: "",
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
        },
        role: userRole,
      };
    } catch (jwtError) {
      console.error("[session] REJECTED: unexpected error:", (jwtError as Error).message);
      return redirect("/auth");
    }
  }

  // No valid session found — redirect to sign in
  redirect("/auth");
}

export async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("Kredex_session")?.value;

  if (token) {
    try {
      const decoded = jwt.decode(token) as { sub?: string; wallet?: string; exp?: number } | null;
      if (decoded?.sub && decoded?.wallet) {
        // Check expiry
        if (decoded.exp && Date.now() / 1000 > decoded.exp) {
          return null; // expired
        }
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.sub);
        if (isUUID) {
          return { user: { id: decoded.sub, wallet: decoded.wallet } };
        }
      }
    } catch {
      // Malformed token
    }
  }
  return null;
}

export async function requireTradeVaultAdmin() {
  const session = await requireAuthenticatedUser();
  const ADMIN_WALLET = process.env.ADMIN_WALLET_ADDRESS;

  if (!ADMIN_WALLET) {
    console.error('[admin] ADMIN_WALLET_ADDRESS env var is not set. Admin access blocked.');
    redirect("/dashboard");
  }

  if (session.user.wallet !== ADMIN_WALLET) {
    redirect("/dashboard");
  }

  return session;
}