import { createBrowserClient } from '@supabase/ssr'

import { publicEnv } from '@/lib/env'
import type { Database } from '@/lib/supabase/database.types'

export function createClient() {
  // a singleton in the browser: the same client for every component
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
  )
}

/**
 * Call before `channel.subscribe()`. With the cookie session the user's token is
 * not on the Realtime socket yet when a component mounts: a channel would join
 * as anon and RLS could not let any change through (QA 28/09/2026). Token
 * refreshes afterwards are handled by supabase-js itself.
 */
export async function autenticaRealtime(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.auth.getSession()
  if (data.session) await supabase.realtime.setAuth(data.session.access_token)
}
