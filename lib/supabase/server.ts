import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { publicEnv } from '@/lib/env'
import type { Database } from '@/lib/supabase/database.types'

/** The session cookie and its chunks (`sb-<ref>-auth-token`, `.0`, `.1`…), not the PKCE verifiers. */
export const COOKIE_SESSIONE = /^sb-.+-auth-token(\.\d+)?$/

/**
 * Client for Server Components and Server Actions. Runs as the signed-in user.
 *
 * `ignoraSessione`: for the OAuth landing only. The session in the browser is
 * hidden from the client, never deleted here: a dead one (yesterday's,
 * revoked) would fail to refresh when the client starts, and auth-js would
 * clear every PKCE verifier with it. The callback drops the old session only
 * after the new one is written (a failed exchange leaves a signed-in person
 * signed in).
 */
export async function createClient({ ignoraSessione = false }: { ignoraSessione?: boolean } = {}) {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          const tutti = cookieStore.getAll()
          return ignoraSessione ? tutti.filter((c) => !COOKIE_SESSIONE.test(c.name)) : tutti
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component: the middleware already refreshed
            // the session cookies, nothing to do here.
          }
        },
      },
    },
  )
}
