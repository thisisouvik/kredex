import { type NextRequest, NextResponse } from "next/server";

// ── In-memory rate limiter (resets on server restart) ─────────────────────────
// For production, replace with Redis/Upstash for persistence across instances.
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;   // 1-minute window
const MAX_REQUESTS = 30;     // 30 API requests per IP per minute
// SECURITY: bypass is disabled in production regardless of env var
const DEV_BYPASS_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.ENABLE_DEV_AUTH_BYPASS === "true";

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "unknown";
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ── ① Short-circuit for static assets — no auth check needed ────────────────
  const isStatic =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|css|js|map)$/.test(pathname);
  if (isStatic) return NextResponse.next({ request });

  const bypassUserId = request.headers.get("x-dev-user-id")?.trim() ?? "";
  const bypassRoleRaw = request.headers.get("x-dev-role")?.trim();
  const bypassActive = DEV_BYPASS_ENABLED && !!bypassUserId && isValidUuid(bypassUserId);

  // ── ② Rate limiting on API routes ───────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    const key = getRateLimitKey(request);
    const now = Date.now();
    const record = requestCounts.get(key);

    if (!record || now > record.resetAt) {
      requestCounts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      record.count++;
      if (record.count > MAX_REQUESTS) {
        return NextResponse.json(
          { error: "Too many requests, please slow down." },
          {
            status: 429,
            headers: { "Retry-After": String(Math.ceil((record.resetAt - now) / 1000)) },
          }
        );
      }
    }
  }

  // ── ③ Session Cookie Check ──────────────────────────────────────────────────
  // The proxy runs in Vercel Edge Runtime where crypto APIs are limited.
  // We do a lightweight STRUCTURAL check here — three non-empty base64url segments
  // is the universal shape of a JWT. Full signature + expiry verification happens
  // in session.ts which runs in the Node.js runtime.
  const sessionCookie = request.cookies.get("Kredex_session");
  let hasSession = false;
  if (sessionCookie?.value) {
    const parts = sessionCookie.value.split('.');
    // A valid JWT always has exactly 3 non-empty segments
    hasSession = parts.length === 3 && parts.every(p => p.length > 10);
  }

  const effectiveUser = bypassActive ? true : hasSession;

  const isDashboardPath = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAuthEntryPath = pathname === "/auth";

  if (isDashboardPath && !effectiveUser) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthEntryPath && effectiveUser) {
    // User already has a valid session — send them to the role picker dashboard
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next({ request });
}

// Exported so middleware.ts can re-export it
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};