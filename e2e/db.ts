import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

/** Local database with the secret key: only to put fixtures in a known state. */
export function dbLocale() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chiave = process.env.SUPABASE_SECRET_KEY
  if (!url || !chiave || !url.includes('127.0.0.1')) {
    throw new Error('I test e2e girano solo contro il Supabase locale')
  }
  return createClient(url, chiave, { auth: { persistSession: false } })
}

export const ID_SETTER = '22222222-2222-4222-8222-222222222222'
