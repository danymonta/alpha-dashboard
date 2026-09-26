import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { publicEnv } from '@/lib/env'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Bypasses RLS. Only for operations the app must do on behalf of the system
 * (invites, keep-alive, imports). Never import this from a 'use client' file.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!secretKey) {
    throw new Error("Variabile d'ambiente mancante: SUPABASE_SECRET_KEY")
  }

  return createSupabaseClient<Database>(publicEnv.supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
