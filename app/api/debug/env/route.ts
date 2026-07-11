import { NextResponse } from "next/server";

// Safe env check — shows only PRESENCE and basic validity, never actual values
export async function GET() {
  const checks = {
    // Auth
    JWT_SECRET: {
      present: !!process.env.JWT_SECRET,
      length: process.env.JWT_SECRET?.length ?? 0,
      looks_valid: (process.env.JWT_SECRET?.length ?? 0) >= 32,
    },

    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: {
      present: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      value_preview: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) + "...",
    },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: {
      present: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      length: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length ?? 0,
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
    },

    // Redis
    UPSTASH_REDIS_REST_URL: {
      present: !!process.env.UPSTASH_REDIS_REST_URL,
      value_preview: process.env.UPSTASH_REDIS_REST_URL?.slice(0, 30) + "...",
    },
    UPSTASH_REDIS_REST_TOKEN: {
      present: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      length: process.env.UPSTASH_REDIS_REST_TOKEN?.length ?? 0,
    },

    // Database
    DATABASE_URL: {
      present: !!process.env.DATABASE_URL,
      uses_pooler: process.env.DATABASE_URL?.includes("pooler") ?? false,
      uses_invalid_certs: process.env.DATABASE_URL?.includes("accept_invalid") ?? false,
    },

    // Site
    NEXT_PUBLIC_SITE_URL: {
      present: !!process.env.NEXT_PUBLIC_SITE_URL,
      value: process.env.NEXT_PUBLIC_SITE_URL,
      is_localhost: process.env.NEXT_PUBLIC_SITE_URL?.includes("localhost") ?? false,
    },

    // Runtime
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  // Overall health
  const critical_missing = [];
  if (!checks.JWT_SECRET.present) critical_missing.push("JWT_SECRET");
  if (!checks.NEXT_PUBLIC_SUPABASE_URL.present) critical_missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!checks.NEXT_PUBLIC_SUPABASE_ANON_KEY.present) critical_missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!checks.UPSTASH_REDIS_REST_URL.present) critical_missing.push("UPSTASH_REDIS_REST_URL");
  if (!checks.UPSTASH_REDIS_REST_TOKEN.present) critical_missing.push("UPSTASH_REDIS_REST_TOKEN");

  return NextResponse.json({
    status: critical_missing.length === 0 ? "OK" : "MISSING_VARS",
    critical_missing,
    checks,
  });
}
