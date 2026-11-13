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

/**
 * Client router cache (Dany, 09/10/2026: "il quanto più smooth possibile"). A page
 * seen in the last N seconds reopens from the browser. Every server action that
 * writes calls revalidatePath, which empties it: one's own changes show at once,
 * other people's within N seconds (the overview refreshes itself on return,
 * components/panoramica/aggiornamento-live.tsx). 0 = always fresh. `static` (pages
 * prefetched in full on intent, components/shell/link-nav.tsx) cannot go below 30:
 * Next's config schema refuses it (config-schema.js, gte(30)).
 */
const CACHE_NAVIGAZIONE_SECONDI = 30

const nextConfig: NextConfig = {
  // The binary of ffmpeg-static is run by the reel steps, never imported: the file tracing
  // would not see it, so it is listed for the routes that run it (1.36.0, CLAUDE.md section 30).
  outputFileTracingIncludes: {
    '/api/cron/marketing': ['./node_modules/ffmpeg-static/ffmpeg'],
  },
  experimental: {
    staleTimes: {
      dynamic: CACHE_NAVIGAZIONE_SECONDI,
      static: Math.max(30, CACHE_NAVIGAZIONE_SECONDI),
    },
  },
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
  // never indexed, and never sent as a referrer to another site. same-origin, not
  // no-referrer: with no-referrer browsers send `Origin: null` on a native form POST,
  // and Next's Origin check on server actions refuses it. Every tap before the page is
  // hydrated (slow bundles on a phone's network, the usual case in the first seconds)
  // and every tap of a page whose bundles never arrive is that native POST. Going to
  // claude.ai, claude.com or the loopback, no Referer leaves either way.
  async headers() {
    return [
      {
        source: '/oauth/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
      // The client's way in and area (1.78.0): never indexed, never framed, no referrer to
      // another site; the personal link and /entra never cached (the link page reads a
      // token). The Content-Security-Policy with its nonce is written by the proxy.
      ...['/join/:path*', '/entra'].map((source) => ({
        source,
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      })),
      {
        source: '/percorso/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default nextConfig
