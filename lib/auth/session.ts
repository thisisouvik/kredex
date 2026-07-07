import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || 'Kredex-super-secret-jwt-key-change-in-prod';

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
          email_confirmed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
        },
        role: bypassRole
      };
    }
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("Kredex_session")?.value;

  if (!token) {
    redirect("/auth");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; wallet: string };
    
    return {
      user: {
        id: decoded.sub,
        wallet: decoded.wallet,
        email: decoded.wallet,
        user_metadata: { 
          account_type: 'borrower',
          full_name: 'Wallet User',
          wallet_address: decoded.wallet
        },
        email_confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      },
      role: 'borrower'
    };
  } catch (error) {
    redirect("/auth");
  }
}

export async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("Kredex_session")?.value;

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; wallet: string };
    return {
      user: {
        id: decoded.sub,
        wallet: decoded.wallet,
      }
    };
  } catch (error) {
    return null;
  }
}

export async function requireTradeVaultAdmin() {
  return await requireAuthenticatedUser();
}