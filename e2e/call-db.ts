import { createClient } from '@supabase/supabase-js'

import type { Database } from '../lib/supabase/database.types'
import { dbLocale } from './db'
import { PASSWORD_SEED, UTENTI } from './utenti'

/**
 * The call work in the end-to-end tests (1.37.0): the local dev server answers /api/cron/call,
 * and without CALL_URL_PASSO the database never posts a step by itself. eseguiPassiCall plays the
 * scheduler (post a step with CRON_SECRET, wait for its lease to clear, post the next, until
 * nothing is due). The Fathom key lives in the local Vault only while a test needs it.
 */

type Stato = Database['public']['Tables']['call_lavori_stato']['Row']

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const FINTO_FATHOM = process.env.E2E_FATHOM_FINTO
export const FINTO_CLAUDE = process.env.E2E_CLAUDE_FINTO
export const CHIAVE_FINTA = 'e2eFintoChiaveFathom0123456789'

export async function raggiungibile(url: string | undefined, percorso: string) {
  if (!url) return false
  return (await fetch(`${url}${percorso}`).catch(() => null))?.ok === true
}

export async function statoLavoriCall(): Promise<Stato> {
  const { data, error } = await dbLocale().from('call_lavori_stato').select('*').eq('id', true).single()
  if (error) throw error
  return data
}

/** The row as it is, to put it back at the end of a test (the month's cost and counters included). */
export async function rimettiLavoriCall(prima: Stato) {
  const { id: _id, created_at: _c, updated_at: _u, ...resto } = prima
  void _id
  void _c
  void _u
  const { error } = await dbLocale().from('call_lavori_stato').update(resto).eq('id', true)
  if (error) throw error
}

async function attendiPasso(scadenza: number) {
  for (;;) {
    const s = await statoLavoriCall()
    if (s.passo_id === null) return s
    if (Date.now() > scadenza) throw new Error('Il passo non è finito in tempo')
    await pausa(300)
  }
}

/** Posts steps until none is due. Returns how many ran. */
export async function eseguiPassiCall(opzioni: { timeoutMs?: number; base?: string } = {}): Promise<number> {
  const base = opzioni.base ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000'
  const segreto = process.env.CRON_SECRET
  if (!segreto) throw new Error('Manca CRON_SECRET in .env.local')
  const scadenza = Date.now() + (opzioni.timeoutMs ?? 150_000)
  let eseguiti = 0
  for (;;) {
    await attendiPasso(scadenza)
    const r = await fetch(`${base}/api/cron/call`, { method: 'POST', headers: { authorization: `Bearer ${segreto}` } })
    if (r.status === 204) return eseguiti
    if (r.status !== 202) throw new Error(`Passo rifiutato: HTTP ${r.status}`)
    eseguiti++
    await pausa(200)
    if (Date.now() > scadenza) throw new Error('I passi non sono finiti in tempo')
  }
}

/** A seed user's own session on the local database (what RLS lets him read). */
export async function sessioneDb(ruolo: keyof typeof UTENTI) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !chiave || !url.includes('127.0.0.1')) throw new Error('I test e2e girano solo contro il Supabase locale')
  const db = createClient<Database>(url, chiave, { auth: { persistSession: false } })
  const { error } = await db.auth.signInWithPassword({ email: UTENTI[ruolo].email, password: PASSWORD_SEED })
  if (error) throw error
  return db
}

/** The admin's own session, for the functions only the admin can call. */
export async function sessioneAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !chiave || !url.includes('127.0.0.1')) throw new Error('I test e2e girano solo contro il Supabase locale')
  const db = createClient<Database>(url, chiave, { auth: { persistSession: false } })
  const { error } = await db.auth.signInWithPassword({ email: UTENTI.admin.email, password: PASSWORD_SEED })
  if (error) throw error
  return db
}

/** Puts the fake key in the local Vault; returns false when a key is already there (the test then skips). */
export async function mettiChiaveFathom(): Promise<boolean> {
  const { data: presente } = await dbLocale().rpc('fathom_chiave')
  if (presente) return false
  const admin = await sessioneAdminDb()
  const { error } = await admin.rpc('fathom_imposta_chiave', { p_chiave: CHIAVE_FINTA })
  if (error) throw error
  return true
}

export async function togliChiaveFathom() {
  const admin = await sessioneAdminDb()
  await admin.rpc('fathom_togli_chiave')
}
