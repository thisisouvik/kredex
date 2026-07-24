import type { NextConfig } from "next";

// Note: NODE_TLS_REJECT_UNAUTHORIZED is intentionally NOT disabled here.
// Use the NeonDB connection pooler URL in DATABASE_URL for production
// (postgres://...neon.tech/neondb?sslmode=require&pgbouncer=true)

const securityHeaders = [
  // Content Security Policy — restricts where resources can load from
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs 'unsafe-inline' for its inline styles; nonces would be ideal but require extra infra
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // Stellar APIs + Vercel Analytics
      "connect-src 'self' https://horizon-testnet.stellar.org https://horizon.stellar.org https://soroban-testnet.stellar.org https://soroban.stellar.org https://rpc-mainnet.stellar.org https://friendbot.stellar.org https://vitals.vercel-insights.com",
      "img-src 'self' data: blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  // Prevent clickjacking — only allow iframes from same origin
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent MIME type sniffing attacks
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Block XSS reflected attacks in legacy browsers
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // Control what referrer info is sent
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict browser features
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Force HTTPS for 1 year (preload-ready)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
