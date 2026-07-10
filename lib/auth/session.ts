import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";

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
      
      // Upsert dev profile to avoid foreign key errors (e.g. loans_borrower_id_fkey)
      try {
        const { getServiceRoleClient } = await import('@/lib/supabase/server');
        const srClient = getServiceRoleClient();
        if (srClient) {
          await srClient.from('profiles').upsert({ id: bypassUserId, wallet_address: "GBYPASSADDRESS0000000000000000000000000000000000000000000", role: bypassRole, full_name: `Dev Bypass ${bypassRole}` });
          await srClient.from('wallet_profiles').upsert({ id: bypassUserId, wallet_address: "GBYPASSADDRESS0000000000000000000000000000000000000000000" });
        }
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
      const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; wallet: string };
      
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded.sub);
      if (!isUUID) throw new Error("Legacy token");

      // ── JWT is cryptographically valid. Trust it. ────────────────────────────
      // We only do a DB check as a best-effort to enrich the user object.
      // If DB is unreachable we still let the user through — the JWT itself
      // is the source of truth (signed with our secret, 7-day expiry).
      let dbEmail = "";
      let dbEmailConfirmedAt = "";
      try {
        const { getServiceRoleClient } = await import('@/lib/supabase/server');
        const srClient = getServiceRoleClient();
        if (srClient) {
          // Check wallet_profiles exists for this user
          const { data: wpData } = await srClient
            .from('wallet_profiles')
            .select('id')
            .eq('id', decoded.sub)
            .maybeSingle();

          // If wallet profile is missing AND we can connect to DB, the cookie is stale
          // (e.g. DB was wiped). In that case, re-upsert rather than killing the session.
          if (!wpData) {
            // Re-upsert the wallet profile using data from the JWT
            await srClient.from('wallet_profiles').upsert({
              id: decoded.sub,
              wallet_address: decoded.wallet,
            });
          }
          
          // Optionally fetch email from profiles if linked
          const { data: pData } = await srClient
            .from('profiles')
            .select('email, email_confirmed_at')
            .eq('id', decoded.sub)
            .maybeSingle();
          if (pData) {
            dbEmail = pData.email || "";
            dbEmailConfirmedAt = pData.email_confirmed_at || "";
          }
        }
      } catch (dbErr) {
        // DB is unreachable — log but DO NOT invalidate the session.
        // The JWT is still cryptographically valid.
        console.warn("[session] DB check failed (non-fatal), continuing with JWT-only session:", (dbErr as Error).message);
      }

      return {
        user: {
          id: decoded.sub,
          wallet: decoded.wallet,
          email: dbEmail,
          user_metadata: { 
            account_type: 'borrower',
            full_name: 'Wallet User',
            wallet_address: decoded.wallet
          },
          email_confirmed_at: dbEmailConfirmedAt,
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
        },
        role: 'borrower'
      };
    } catch (error) {
      // Only redirect to signout if the JWT itself is invalid/expired
      console.warn("[session] JWT verification failed, clearing session:", (error as Error).message);
      return redirect("/api/auth/signout?reason=invalid");
    }
  }

  // Fallback to Supabase Auth (for Google users)
  try {
    const { getServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = await getServerSupabaseClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Find wallet linked to this user
        const { data: profile } = await supabase.from('profiles').select('wallet_address, role').eq('id', user.id).maybeSingle();
        if (!profile?.wallet_address) {
           // User logged in via Google but hasn't linked a wallet yet!
           redirect("/auth/link-wallet");
        }
        return {
          user: {
            ...user,
            wallet: profile.wallet_address
          },
          role: profile.role || 'borrower'
        };
      }
    }
  } catch (err) {
    // Ignore and redirect
  }

  redirect("/auth");
}

export async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("Kredex_session")?.value;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; wallet: string };
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded.sub);
      if (!isUUID) throw new Error("Legacy token");

      return {
        user: {
          id: decoded.sub,
          wallet: decoded.wallet,
        }
      };
    } catch (error) {
      // Fallback
    }
  }

  try {
    const { getServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = await getServerSupabaseClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('wallet_address').eq('id', user.id).maybeSingle();
        return {
          user: {
            id: user.id,
            wallet: profile?.wallet_address || '',
          }
        };
      }
    }
  } catch (err) {}

  return null;
}

export async function requireTradeVaultAdmin() {
  const session = await requireAuthenticatedUser();
  const ADMIN_WALLET = process.env.ADMIN_WALLET_ADDRESS;

  // Security check: Only allow the specific admin wallet address
  if (!ADMIN_WALLET || session.user.wallet !== ADMIN_WALLET) {
    redirect("/dashboard/borrower");
  }

  return session;
}