/**
 * Moves everything recorded under a placeholder profile (scripts/profilo-segnaposto.ts)
 * to the real profile of the same person, then deactivates the placeholder.
 * Run it once the person has signed in with Google (their profile exists).
 *
 *   npx tsx --env-file=.env.cloud.local scripts/collega-profilo.ts \
 *     --da loris.setter@segnaposto.invalid --a <email reale> --cloud [--prova]
 */
import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'

import type { Database } from '../lib/supabase/database.types'

const { values: o } = parseArgs({
  options: {
    da: { type: 'string' },
    a: { type: 'string' },
    cloud: { type: 'boolean', default: false },
    prova: { type: 'boolean', default: false },
  },
})

function esci(messaggio: string): never {
  console.error(`\n✗ ${messaggio}\n`)
  process.exit(1)
}

if (!o.da?.endsWith('.invalid')) esci('--da deve essere il profilo segnaposto (indirizzo .invalid)')
if (!o.a) esci('Serve --a <email reale>')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const chiave = process.env.SUPABASE_SECRET_KEY
if (!url || !chiave) esci('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY: lancia con --env-file')
const locale = ['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
if (!locale && !o.cloud) esci('Il database non è quello locale: aggiungi --cloud se è voluto')

const db = createClient<Database>(url, chiave, { auth: { persistSession: false, autoRefreshToken: false } })

type Tabella = keyof Database['public']['Tables']

// every column that points to a person, except who created a row and the audit trail
const COLONNE: [Tabella, string][] = [
  ['leads', 'setter_id'],
  ['calls', 'setter_id'],
  ['calls', 'closer_id'],
  ['clients', 'setter_id'],
  ['clients', 'closer_id'],
  ['sales', 'setter_id'],
  ['sales', 'closer_id'],
  ['commission_rules', 'profile_id'],
  ['commission_payouts', 'profile_id'],
  ['pm_progetti', 'responsabile_id'],
  ['pm_task', 'assegnatario_id'],
  ['pm_tempo', 'profile_id'],
  ['pm_note', 'autore_id'],
]

async function profilo(email: string) {
  const { data, error } = await db.from('profiles').select('id, nome, ruolo, attivo').ilike('email', email).maybeSingle()
  if (error) esci(error.message)
  if (!data) esci(`${email}: nessun profilo. La persona deve prima fare l'accesso con Google.`)
  return data
}

async function principale() {
  const da = await profilo(o.da!)
  const a = await profilo(o.a!)
  console.log(`\nDa ${da.nome} (${o.da}) a ${a.nome} (${o.a})${o.prova ? ' · PROVA' : ''}\n`)

  // daily reports: one per person and day, the real one wins
  const { data: reportDa } = await db.from('setter_daily_reports').select('id, data').eq('setter_id', da.id)
  const { data: reportA } = await db.from('setter_daily_reports').select('data').eq('setter_id', a.id)
  const giorniA = new Set((reportA ?? []).map((r) => r.data))
  const spostabili = (reportDa ?? []).filter((r) => !giorniA.has(r.data))
  console.log(`  report giornalieri: ${spostabili.length} da spostare, ${(reportDa ?? []).length - spostabili.length} già presenti sul profilo reale`)
  if (!o.prova && spostabili.length > 0) {
    const { error } = await db.from('setter_daily_reports').update({ setter_id: a.id }).in('id', spostabili.map((r) => r.id))
    if (error) esci(`report: ${error.message}`)
  }

  // project memberships: unique per project
  const { data: membriDa } = await db.from('pm_membri').select('id, progetto_id').eq('profile_id', da.id)
  const { data: membriA } = await db.from('pm_membri').select('progetto_id').eq('profile_id', a.id)
  const progettiA = new Set((membriA ?? []).map((m) => m.progetto_id))
  const nuoviMembri = (membriDa ?? []).filter((m) => !progettiA.has(m.progetto_id))
  console.log(`  progetti: ${nuoviMembri.length} da spostare`)
  if (!o.prova && nuoviMembri.length > 0) {
    const { error } = await db.from('pm_membri').update({ profile_id: a.id }).in('id', nuoviMembri.map((m) => m.id))
    if (error) esci(`membri: ${error.message}`)
  }

  for (const [tabella, colonna] of COLONNE) {
    const { count } = await db.from(tabella).select('*', { count: 'exact', head: true }).eq(colonna, da.id)
    console.log(`  ${tabella}.${colonna}: ${count ?? 0}`)
    if (!o.prova && (count ?? 0) > 0) {
      const { error } = await db.from(tabella).update({ [colonna]: a.id } as never).eq(colonna, da.id)
      if (error) esci(`${tabella}.${colonna}: ${error.message}`)
    }
  }

  if (!o.prova) {
    await db.from('profiles').update({ attivo: false }).eq('id', da.id)
    await db.from('invites').update({ revocato: true }).ilike('email', o.da!)
    console.log(`\n✓ Fatto. ${da.nome} è disattivato: lo trovi in Team, puoi lasciarlo così.\n`)
  }
}

principale().catch((e) => esci(e instanceof Error ? e.message : String(e)))
