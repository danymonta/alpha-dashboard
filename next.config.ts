import type { NextConfig } from 'next'

/**
 * Public values the browser needs (the project URL, the publishable key, the app
 * URL). Vercel can force Production variables to be sensitive and then refuses
 * the NEXT_PUBLIC_ prefix on them: the same values are also accepted without the
 * prefix and inlined here at build time. Never list a secret here.
 */
const pubbliche = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL,
}

const nextConfig: NextConfig = {
  env: Object.fromEntries(
    Object.entries(pubbliche).filter((voce): voce is [string, string] => Boolean(voce[1])),
  ),
  // The floating dev badge sits on top of the navigation and pollutes `npm run shots`.
  devIndicators: false,
  // Dev only: lets a phone on the same Wi-Fi load the JS bundles
  // (http://<Mac IP>:3000), which the setter test in PROCEDURA step 5 needs.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  // The consent page of Claude's connection (/oauth/consent, 09/10/2026) may carry an
  // authorization code in a hidden field: never framed (clickjacking), never cached,
  // never sent as a referrer, never indexed.
  async headers() {
    return [
      {
        source: '/oauth/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
    ]
  },
}

export default nextConfig
