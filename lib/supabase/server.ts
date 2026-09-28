import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { publicEnv } from '@/lib/env'
import type { Database } from '@/lib/supabase/database.types'

/** The session cookie and its chunks (`sb-<ref>-auth-token`, `.0`, `.1`…), not the PKCE verifiers. */
const COOKIE_SESSIONE = /^sb-.+-auth-token(\.\d+)?$/

/**
 * Client for Server Components and Server Actions. Runs as the signed-in user.
 *
 * `ignoraSessione`: for the OAuth landing only. A dead session left in the
 * browser (yesterday's, revoked) fails to refresh when the client starts, and
 * auth-js then clears every PKCE verifier with it: the code from Google could
 * never be exchanged. Without the old session the verifier survives, and the
 * exchange writes the new session over the old one.
 */
export async function createClient({ ignoraSessione = false }: { ignoraSessione?: boolean } = {}) {
  const cookieStore = await cookies()

  if (ignoraSessione) {
    // cleared on the way out too: the new session is written over it, and a
    // stale chunk (".2") must never be glued to the new one
    for (const { name } of cookieStore.getAll()) {
      if (COOKIE_SESSIONE.test(name)) cookieStore.delete(name)
    }
  }

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
