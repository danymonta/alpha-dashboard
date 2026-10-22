import 'server-only'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import type { Contesto } from './operazioni'

/** The core of projects and time from the app: the cookie session and its profile, read when the guard needs it. */
export async function contestoApp(): Promise<Contesto> {
  return { db: await createClient(), chi: getProfilo }
}
