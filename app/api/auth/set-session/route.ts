import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime — cookies().set() works here, NOT in edge runtime
export const runtime = 'nodejs';

/**
 * GET /api/auth/set-session?t=<jwt>
 *
 * Method 2 of session cookie setting: client redirects here after getting
 * the JWT from /api/auth/verify. This route sets the cookie server-side via
 * a redirect response and sends the user to /dashboard.
 *
 * NOTE: Full JWT signature + expiry verification happens in session.ts
 * (Node.js runtime). This route only does structural validation to avoid
 * having a second point of failure with jwt.verify.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get('t');

  if (!token) {
    return NextResponse.redirect(`${origin}/auth?error=missing_token`);
  }

  // Structural validation only: a JWT has exactly 3 non-empty base64url segments
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every(p => p.length > 10)) {
    return NextResponse.redirect(`${origin}/auth?error=malformed_token`);
  }

  // Set the session cookie and redirect to dashboard
  const response = NextResponse.redirect(`${origin}/dashboard`);
  response.cookies.set('Kredex_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });

  return response;
}
