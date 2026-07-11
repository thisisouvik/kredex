"use server";

import { cookies } from "next/headers";

/**
 * Server Action: setSessionCookie
 *
 * This is the ONLY 100% reliable way to set cookies in Next.js on Vercel.
 * Server Actions use Next.js's own cookie mutation API which works in all
 * environments including Vercel edge/serverless. No header stripping occurs.
 *
 * Called from AuthPageClient after receiving the JWT from /api/auth/verify.
 */
export async function setSessionCookie(token: string): Promise<void> {
  if (!token || token.split(".").length !== 3) {
    throw new Error("Invalid token format");
  }

  const cookieStore = await cookies();
  cookieStore.set("Kredex_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  });
}

/**
 * Server Action: clearSessionCookie
 *
 * Clears the session cookie — used on sign out.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("Kredex_session");
}
