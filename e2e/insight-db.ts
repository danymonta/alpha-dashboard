import { oggiRoma } from '../lib/date'
import type { Database } from '../lib/supabase/database.types'
import { dbLocale } from './db'

/**
 * The runs of the Insight in the end-to-end tests (1.35.0): the local dev
 * server answers /api/cron/insight, and with INSIGHT_URL_PASSO=manuale the
 * database never sends a step by itself (insight_dispatch needs url_passo).
 * eseguiInsightFinoAllaFine plays the scheduler: it posts each step with
 * CRON_SECRET, waits for the step to end (its lease cleared by
 * insight_passo_finito), and posts the next, until the run is ready or failed.
 * Then the rows a test touched are put back (statoInsight, rimettiInsight).
 */

type Esecuzione = Database['public']['Tables']['insight_esecuzioni']['Row']

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function esecuzione(id: string): Promise<Esecuzione> {
  const { data, error } = await dbLocale().from('insight_esecuzioni').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

/** The latest run created from a moment on (the one «Aggiorna dati» just queued). */
export async function ultimaEsecuzione(dal: string): Promise<Esecuzione | null> {
  const { data, error } = await dbLocale()
    .from('insight_esecuzioni')
    .select('*')
    .gte('creata_il', dal)
    .order('creata_il', { ascending: false })
    .limit(1)
  if (error) throw error
  return data[0] ?? null
}

/** Posts one step of a run to the dev server; 202, or 409 when a step is already working. */
export async function mandaPasso(id: string, base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'): Promise<number> {
  const segreto = process.env.CRON_SECRET
  if (!segreto) throw new Error('Manca CRON_SECRET in .env.local')
  const r = await fetch(`${base}/api/cron/insight`, {
    method: 'POST',
    headers: { authorization: `Bearer ${segreto}`, 'content-type': 'application/json' },
    body: JSON.stringify({ esecuzione: id }),
  })
  if (r.status !== 202 && r.status !== 409) throw new Error(`Passo dell’Insight rifiutato: HTTP ${r.status}`)
  return r.status
}

/** Waits for the step that is working to end (its lease cleared). */
async function attendiPasso(id: string, scadenza: number): Promise<Esecuzione> {
  for (;;) {
    const riga = await esecuzione(id)
    if (riga.stato === 'pronta' || riga.stato === 'fallita' || riga.lease_fino_al === null) return riga
    if (Date.now() > scadenza) throw new Error('Il passo dell’Insight non è finito in tempo')
    await pausa(400)
  }
}

/** Plays the scheduler until the run is ready or failed; stops at `fino` (a step) when given. */
export async function eseguiInsightFinoAllaFine(
  id: string,
  opzioni: { timeoutMs?: number; fino?: Esecuzione['passo'] } = {},
): Promise<Esecuzione> {
  const scadenza = Date.now() + (opzioni.timeoutMs ?? 150_000)
  for (;;) {
    let riga = await attendiPasso(id, scadenza)
    if (riga.stato === 'pronta' || riga.stato === 'fallita') return riga
    if (opzioni.fino && riga.passo === opzioni.fino && riga.invocazioni > 0) return riga
    if (Date.now() > scadenza) throw new Error('L’esecuzione dell’Insight non è finita in tempo')
    const prima = riga.invocazioni
    await mandaPasso(id)
    // the step has taken its lease (or the run is over)
    for (;;) {
      riga = await esecuzione(id)
      if (riga.invocazioni > prima || riga.stato === 'pronta' || riga.stato === 'fallita') break
      if (Date.now() > scadenza) throw new Error('Il passo dell’Insight non è partito')
      await pausa(200)
    }
  }
}

// ---------------------------------------------------------------------------
// What a run touches, to put it back
// ---------------------------------------------------------------------------

export type StatoInsight = {
  dal: string
  impostazioni: Database['public']['Tables']['insight_impostazioni']['Row'] | null
  recapDiOggi: Database['public']['Tables']['insight_recap']['Row'][]
  chat: Database['public']['Tables']['insight_chat']['Row'][]
  profili: Database['public']['Tables']['insight_profili']['Row'][]
  conteggi: Database['public']['Tables']['instagram_contenuti_dm']['Row'][]
  giorniContati: Database['public']['Tables']['instagram_contenuti_dm_giorni']['Row'][]
  esclusi: string[]
  collegamentoInstagram: Database['public']['Tables']['instagram_collegamento']['Row'] | null
  collegamentoMessenger: Database['public']['Tables']['messenger_collegamento']['Row'] | null
}

/** The rows a run of the Insight writes, as they are before the test. */
export async function statoInsight(): Promise<StatoInsight> {
  const db = dbLocale()
  const dal = new Date().toISOString()
  const [impostazioni, recap, chat, profili, conteggi, giorniContati, esclusi, ig, fb] = await Promise.all([
    db.from('insight_impostazioni').select('*').maybeSingle(),
    db.from('insight_recap').select('*').eq('giorno', oggiRoma()),
    db.from('insight_chat').select('*'),
    db.from('insight_profili').select('*'),
    db.from('instagram_contenuti_dm').select('*'),
    db.from('instagram_contenuti_dm_giorni').select('*'),
    db.from('instagram_esclusi').select('username'),
    db.from('instagram_collegamento').select('*').maybeSingle(),
    db.from('messenger_collegamento').select('*').maybeSingle(),
  ])
  for (const r of [impostazioni, recap, chat, profili, conteggi, giorniContati, esclusi, ig, fb]) if (r.error) throw r.error
  return {
    dal,
    impostazioni: impostazioni.data,
    recapDiOggi: recap.data ?? [],
    chat: chat.data ?? [],
    profili: profili.data ?? [],
    conteggi: conteggi.data ?? [],
    giorniContati: giorniContati.data ?? [],
    esclusi: (esclusi.data ?? []).map((r) => r.username),
    collegamentoInstagram: ig.data,
    collegamentoMessenger: fb.data,
  }
}

/** Everything back as it was: the runs of the test go (blocks and cards with them), the fake posts too. */
export async function rimettiInsight(prima: StatoInsight) {
  const db = dbLocale()
  const verifica = (r: { error: unknown }) => {
    if (r.error) throw r.error
  }
  verifica(await db.from('insight_esecuzioni').delete().gte('creata_il', prima.dal))
  // the chats and profiles of the test go, the ones there before come back as they were
  verifica(await db.from('insight_chat').delete().not('id', 'in', `(${['00000000-0000-0000-0000-000000000000', ...prima.chat.map((c) => c.id)].join(',')})`))
  if (prima.chat.length) verifica(await db.from('insight_chat').upsert(prima.chat))
  const usernames = prima.profili.map((p) => p.username)
  verifica(
    usernames.length
      ? await db.from('insight_profili').delete().not('username', 'in', `(${usernames.map((u) => `"${u}"`).join(',')})`)
      : await db.from('insight_profili').delete().neq('username', ''),
  )
  if (prima.profili.length) verifica(await db.from('insight_profili').upsert(prima.profili))
  // the recaps of today: the seed's back (the Fatto rows stay: an upsert, never a delete)
  for (const r of prima.recapDiOggi) verifica(await db.from('insight_recap').upsert(r, { onConflict: 'giorno,canale' }))
  for (const canale of ['instagram', 'messenger'] as const) {
    if (!prima.recapDiOggi.some((r) => r.canale === canale)) {
      verifica(await db.from('insight_recap').delete().eq('giorno', oggiRoma()).eq('canale', canale))
    }
  }
  // the counts per post: the fake posts go (their counts by cascade), the others come back
  verifica(await db.from('instagram_contenuti').delete().like('shortcode', 'GraphFinto%'))
  verifica(await db.from('instagram_contenuti_dm').delete().gte('giorno', '1970-01-01'))
  if (prima.conteggi.length) verifica(await db.from('instagram_contenuti_dm').insert(prima.conteggi))
  // the counted days (1.36.0's R2): the ones the run marked go
  verifica(await db.from('instagram_contenuti_dm_giorni').delete().gte('giorno', '1970-01-01'))
  if (prima.giorniContati.length) verifica(await db.from('instagram_contenuti_dm_giorni').insert(prima.giorniContati))
  // exclusions, settings, connections
  verifica(
    prima.esclusi.length
      ? await db.from('instagram_esclusi').delete().not('username', 'in', `(${prima.esclusi.map((u) => `"${u}"`).join(',')})`)
      : await db.from('instagram_esclusi').delete().neq('username', ''),
  )
  if (prima.impostazioni) verifica(await db.from('insight_impostazioni').update(prima.impostazioni).eq('id', true))
  if (prima.collegamentoInstagram) verifica(await db.from('instagram_collegamento').update(prima.collegamentoInstagram).eq('id', true))
  if (prima.collegamentoMessenger) verifica(await db.from('messenger_collegamento').update(prima.collegamentoMessenger).eq('id', true))
}
