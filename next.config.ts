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
}

export default nextConfig
