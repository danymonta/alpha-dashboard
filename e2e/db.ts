import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import type { Database } from '../lib/supabase/database.types'

config({ path: '.env.local', quiet: true })

/** Local database with the secret key: only to put fixtures in a known state. */
export function dbLocale() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chiave = process.env.SUPABASE_SECRET_KEY
  if (!url || !chiave || !url.includes('127.0.0.1')) {
    throw new Error('I test e2e girano solo contro il Supabase locale')
  }
  return createClient<Database>(url, chiave, { auth: { persistSession: false } })
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

export const PRODOTTO_3_MESI = 'aaaaaaa1-0000-4000-8000-000000000001'
export const PRODOTTO_6_MESI = 'aaaaaaa1-0000-4000-8000-000000000002'

/** The closer said "Chiusa". */
export async function chiudiCall(callId: string) {
  const { error } = await dbLocale()
    .from('calls')
    .update({ stato: 'svolta', qualificata: true, esito: 'chiusa' })
    .eq('id', callId)
  if (error) throw error
}

/** A client with a first, already finished, "nuovo" sale: ready for a renewal. */
export async function creaClienteConVendita(nome: string, closerId: string) {
  const db = dbLocale()
  const { data: cliente, error: e1 } = await db
    .from('clients')
    .insert({ nome, cognome: 'Rinnovo', setter_id: ID_SETTER, closer_id: closerId, fonte: 'referral' })
    .select('id')
    .single()
  if (e1) throw e1

  const { error: e2 } = await db.from('sales').insert({
    client_id: cliente.id,
    product_id: PRODOTTO_3_MESI,
    tipo: 'nuovo',
    setter_id: ID_SETTER,
    closer_id: closerId,
    data_vendita: '2026-01-10',
    data_inizio: '2026-01-10',
    data_fine: '2026-04-09',
    valore_contratto: 1500,
    numero_rate: 1,
  })
  if (e2) throw e2

  return cliente.id as string
}

/** Removes everything a sales test created, children first (no cascades there). */
export async function pulisciVendite(prefisso: string) {
  const db = dbLocale()
  const { data: clienti } = await db.from('clients').select('id').like('nome', `${prefisso}%`)
  const idClienti = (clienti ?? []).map((c) => c.id)
  if (idClienti.length > 0) {
    await db.from('sales').delete().in('client_id', idClienti)
    await db.from('clients').delete().in('id', idClienti)
  }
  await db.from('leads').delete().like('nome', `${prefisso}%`)
}

/** Pages whose URL depends on data: the most recent sale the role can open. */
export async function pagineDinamiche(ruolo: 'admin' | 'setter' | 'closer') {
  if (ruolo === 'setter') return []
  let query = dbLocale().from('sales').select('id').order('data_vendita', { ascending: false }).limit(1)
  if (ruolo === 'closer') query = query.eq('closer_id', ID_CLOSER)
  const { data } = await query
  return data && data.length > 0 ? [{ nome: 'dettaglio-vendita', url: `/sales/${data[0].id}` }] : []
}

/** A client with one sale whose plan starts `giorniFa` days ago (payments by the trigger). */
export async function creaVenditaDiProva(
  nome: string,
  closerId: string,
  { valore = 900, rate = 3, giorniFa = 40 }: { valore?: number; rate?: number; giorniFa?: number } = {},
) {
  const db = dbLocale()
  const { data: cliente, error: e1 } = await db
    .from('clients')
    .insert({ nome, cognome: 'Incassi', setter_id: ID_SETTER, closer_id: closerId, fonte: 'dm_inbound' })
    .select('id')
    .single()
  if (e1) throw e1

  const data = new Date(Date.now() - giorniFa * 86_400_000).toISOString().slice(0, 10)
  const { data: vendita, error: e2 } = await db
    .from('sales')
    .insert({
      client_id: cliente.id,
      product_id: PRODOTTO_3_MESI,
      tipo: 'nuovo',
      setter_id: ID_SETTER,
      closer_id: closerId,
      data_vendita: data,
      data_inizio: data,
      data_fine: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
      valore_contratto: valore,
      numero_rate: rate,
    })
    .select('id')
    .single()
  if (e2) throw e2

  return vendita.id as string
}
