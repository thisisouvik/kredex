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
      // ── Pure JWT validation. No database calls. ──────────────────────────────
      // The JWT is signed with our secret and has a 7-day expiry.
      // We trust it completely. Supabase is NOT queried here to avoid
      // cold-start failures and connection timeouts on Vercel serverless.
      const decoded = jwt.verify(token, JWT_SECRET) as {
        sub: string;
        wallet: string;
        authType?: string;
      };

      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          decoded.sub
        );
      if (!isUUID) throw new Error("Invalid token subject");

      // JWT is valid — return the user object immediately.
      return {
        user: {
          id: decoded.sub,
          wallet: decoded.wallet,
          email: "",
          user_metadata: {
            account_type: "borrower",
            full_name: "Wallet User",
            wallet_address: decoded.wallet,
          },
          email_confirmed_at: "",
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
        },
        role: "borrower",
      };
    } catch (jwtError) {
      // JWT is expired or tampered — clear and redirect to sign in.
      console.error("[session] JWT invalid:", (jwtError as Error).message);
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

  // TEMPORARY BYPASS: Do not redirect to auth.
  // Read the wallet address from the JWT cookie (even if verification is disabled)
  // so each browser/user gets their own actual wallet profile.
  console.error("[session] Auth missing, attempting cookie-based profile lookup for bypass");
  try {
    const { getServiceRoleClient } = await import("@/lib/supabase/server");
    const supabase = getServiceRoleClient();

    if (supabase) {
      // Try to decode the JWT cookie to find the real wallet address
      const bypassCookieStore = await cookies();
      const rawToken = bypassCookieStore.get("Kredex_session")?.value;
      if (rawToken) {
        const parts = rawToken.split('.');
        if (parts.length === 3) {
          try {
            // Decode without verification — we just need the wallet address for lookup
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = (4 - (base64.length % 4)) % 4;
            const payloadStr = Buffer.from(base64 + '='.repeat(pad), 'base64').toString('utf-8');
            const payload = JSON.parse(payloadStr) as { sub?: string; wallet?: string };

            if (payload.wallet) {
              // Look up real profile by wallet address
              const { data: walletProfile } = await supabase
                .from('wallet_profiles')
                .select('id, wallet_address')
                .eq('wallet_address', payload.wallet)
                .maybeSingle();

              const profileId = walletProfile?.id || payload.sub;
              if (profileId) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', profileId)
                  .maybeSingle();

                const resolvedRole = profile?.role || expectedRole || 'borrower';
                return {
                  user: {
                    id: profileId,
                    wallet: payload.wallet,
                    email: profile?.email || '',
                    user_metadata: {
                      account_type: resolvedRole,
                      full_name: profile?.full_name || 'Wallet User',
                      wallet_address: payload.wallet,
                    },
                    email_confirmed_at: profile?.email_confirmed_at || '',
                    created_at: profile?.created_at || new Date().toISOString(),
                    last_sign_in_at: new Date().toISOString(),
                  },
                  role: resolvedRole,
                };
              }
            }
          } catch (_e) {
            // ignore decode errors
          }
        }
      }

      // No cookie or decode failed — fall back to first DB user
      const { data: firstProfile } = await supabase.from('profiles').select('*').limit(1).single();
      if (firstProfile) {
        return {
          user: {
            id: firstProfile.id,
            wallet: firstProfile.wallet_address || 'GBYPASSADDRESS0000000000000000000000000000000000000000000',
            email: firstProfile.email || 'testing@kredex.dev',
            user_metadata: {
              account_type: firstProfile.role || expectedRole || 'borrower',
              full_name: firstProfile.full_name || 'Testing User',
              wallet_address: firstProfile.wallet_address || 'GBYPASSADDRESS0000000000000000000000000000000000000000000',
            },
            email_confirmed_at: firstProfile.email_confirmed_at || '',
            created_at: firstProfile.created_at || new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
          },
          role: firstProfile.role || expectedRole || 'borrower',
        };
      }
    }
  } catch (err) {
    console.error('[session] Bypass DB lookup failed:', err);
  }

  // Last resort fallback
  return {
    user: {
      id: '00000000-0000-4000-8000-000000000000',
      wallet: 'GBYPASSADDRESS0000000000000000000000000000000000000000000',
      email: 'testing@kredex.dev',
      user_metadata: {
        account_type: expectedRole || 'borrower',
        full_name: 'Testing User',
        wallet_address: 'GBYPASSADDRESS0000000000000000000000000000000000000000000',
      },
      email_confirmed_at: '',
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
    },
    role: expectedRole || 'borrower',
  };
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

  if (!ADMIN_WALLET) {
    // No admin wallet configured — allow access in testing bypass mode
    console.warn('[admin] ADMIN_WALLET_ADDRESS not set — bypassing admin check for testing');
    return session;
  }

  // Security check: Only allow the specific admin wallet address
  if (session.user.wallet !== ADMIN_WALLET) {
    redirect("/dashboard/borrower");
  }

  return session;
}