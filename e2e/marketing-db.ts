import type { Database } from '../lib/supabase/database.types'
import { dbLocale } from './db'

/**
 * The reel work in the end-to-end tests (1.36.0): the local dev server answers
 * /api/cron/marketing, and without MARKETING_URL_PASSO the database never posts
 * a step by itself. eseguiPassiMarketing plays the scheduler: it posts a step
 * with CRON_SECRET, waits for it to end (its lease cleared by
 * marketing_passo_finito) and posts the next, until the queue is empty.
 */

type Stato = Database['public']['Tables']['marketing_lavori_stato']['Row']

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function statoLavori(): Promise<Stato> {
  const { data, error } = await dbLocale().from('marketing_lavori_stato').select('*').eq('id', true).single()
  if (error) throw error
  return data
}

/** The row as it is, to put it back at the end of a test (the month's cost and counters included). */
export async function rimettiLavori(prima: Stato) {
  const { id: _id, created_at: _c, updated_at: _u, ...resto } = prima
  void _id
  void _c
  void _u
  const { error } = await dbLocale().from('marketing_lavori_stato').update(resto).eq('id', true)
  if (error) throw error
}

async function attendiPasso(scadenza: number) {
  for (;;) {
    const s = await statoLavori()
    if (s.passo_id === null) return s
    if (Date.now() > scadenza) throw new Error('Il passo non è finito in tempo')
    await pausa(300)
  }
}

/** Posts steps until none is due. Returns how many ran. */
export async function eseguiPassiMarketing(opzioni: { timeoutMs?: number; base?: string } = {}): Promise<number> {
  const base = opzioni.base ?? process.env.E2E_BASE_URL ?? 'http://localhost:3200'
  const segreto = process.env.CRON_SECRET
  if (!segreto) throw new Error('Manca CRON_SECRET in .env.local')
  const scadenza = Date.now() + (opzioni.timeoutMs ?? 150_000)
  let eseguiti = 0
  for (;;) {
    await attendiPasso(scadenza)
    const r = await fetch(`${base}/api/cron/marketing`, { method: 'POST', headers: { authorization: `Bearer ${segreto}` } })
    if (r.status === 204) return eseguiti
    if (r.status !== 202) throw new Error(`Passo rifiutato: HTTP ${r.status}`)
    eseguiti++
    await pausa(200)
    if (Date.now() > scadenza) throw new Error('I passi non sono finiti in tempo')
  }
}
