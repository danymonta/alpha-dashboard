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

export const ID_ADMIN = '11111111-1111-4111-8111-111111111111'
export const ID_SETTER = '22222222-2222-4222-8222-222222222222'
export const ID_CLOSER = '33333333-3333-4333-8333-333333333333'

/** A lead with one call booked by the seed setter, `oreFa` hours ago. */
export async function creaCallDiProva(nome: string, closerId: string, oreFa = 1) {
  const db = dbLocale()
  const { data: lead, error: e1 } = await db
    .from('leads')
    .insert({ nome, setter_id: ID_SETTER, fonte: 'dm_inbound', created_by: ID_SETTER })
    .select('id')
    .single()
  if (e1) throw e1

  const { data: call, error: e2 } = await db
    .from('calls')
    .insert({
      lead_id: lead.id,
      setter_id: ID_SETTER,
      closer_id: closerId,
      tipo: 'discovery',
      programmata_il: new Date(Date.now() - oreFa * 3_600_000).toISOString(),
      created_by: ID_SETTER,
    })
    .select('id')
    .single()
  if (e2) throw e2

  return call.id as string
}
