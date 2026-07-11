import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

// Force Node.js runtime — cookies().set() works here, NOT in edge runtime
export const runtime = 'nodejs';

const JWT_SECRET = process.env.JWT_SECRET as string;

/**
 * GET /api/auth/set-session?t=<jwt>
 *
 * After the client verifies a wallet signature and receives a JWT from
 * /api/auth/verify, it redirects HERE instead of doing document.cookie.
 * This route sets an httpOnly server-side cookie (immune to Vercel edge
 * header stripping) and then redirects the user to /dashboard.
 *
 * The token is short-lived in the URL — it's immediately consumed and
 * replaced with an httpOnly cookie, so the risk window is minimal.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get('t');

  if (!token) {
    return NextResponse.redirect(`${origin}/auth?error=missing_token`);
  }

  // Fully verify the JWT — reject tampered or expired tokens
  try {
    if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
    jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.error('[set-session] JWT verification failed:', err);
    return NextResponse.redirect(`${origin}/auth?error=invalid_token`);
  }

  // Redirect to dashboard and set the session cookie on the response.
  // NextResponse.redirect() in a Node.js Route Handler correctly sets
  // Set-Cookie headers that flow through to the browser.
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
