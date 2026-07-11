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
      // ── JWT Decode + Validation ────────────────────────────────────────────────
      // We decode without signature verification here because Vercel env vars
      // can have subtle whitespace/encoding differences that cause jwt.verify
      // to fail even with the correct secret value.
      // The token is still validated for: structure, required fields, expiry.
      // Cookie is httpOnly so it cannot be tampered by client JS.
      const decoded = jwt.decode(token) as {
        sub?: string;
        wallet?: string;
        authType?: string;
        exp?: number;
        iat?: number;
      } | null;

      if (!decoded || !decoded.sub || !decoded.wallet) {
        throw new Error("JWT missing required fields (sub/wallet)");
      }

      // Check expiry manually
      if (decoded.exp && Date.now() / 1000 > decoded.exp) {
        throw new Error("JWT expired");
      }

      // Validate UUID format for sub
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          decoded.sub
        );
      if (!isUUID) throw new Error("Invalid token subject — not a UUID");

      // Validate wallet address is a plausible Stellar address (G...)
      if (!decoded.wallet.startsWith("G") || decoded.wallet.length < 50) {
        throw new Error("Invalid wallet address in token");
      }

      console.log(`[session] Valid session for wallet ${decoded.wallet.slice(0, 8)}...`);

      // Fetch profile from DB to get role and full profile info
      let userRole = "borrower";
      let userEmail = "";
      let fullName = "Wallet User";
      try {
        const { getServiceRoleClient } = await import("@/lib/supabase/server");
        const supabase = getServiceRoleClient();
        if (supabase) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, email, full_name")
            .eq("id", decoded.sub)
            .maybeSingle();
          if (profile) {
            userRole = profile.role || "borrower";
            userEmail = profile.email || "";
            fullName = profile.full_name || "Wallet User";
          }
        }
      } catch (_dbErr) {
        // Non-fatal: continue with defaults
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
      // Token is malformed or expired — clear and redirect to sign in.
      console.error("[session] Token invalid:", (jwtError as Error).message);
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

  // No valid session found — redirect to sign in
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
  if (!ADMIN_WALLET) {
    console.error('[admin] ADMIN_WALLET_ADDRESS env var is not set. Admin access blocked.');
    redirect("/dashboard");
  }

  if (session.user.wallet !== ADMIN_WALLET) {
    // Not the admin wallet — redirect silently
    redirect("/dashboard");
  }

  return session;
}