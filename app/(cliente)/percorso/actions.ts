'use server'

import { revalidatePath } from 'next/cache'
import { lavoraFoglioDopo } from '@/lib/percorso/foglio-lavoro'
import { avvisaQuestionarioInviatoDopo } from '@/lib/percorso/questionario-inviato'
import * as percorso from '@/lib/percorso/operazioni'
import type { EsitoConsenso, EsitoInvia, EsitoLezione, EsitoPercorso, EsitoSalva, EsitoTogli } from '@/lib/percorso/operazioni'
import { togliFileQuestionario } from '@/lib/percorso/pulizia'
import { createClient } from '@/lib/supabase/server'

export type { EsitoConsenso, EsitoInvia, EsitoLezione, EsitoPercorso, EsitoSalva, EsitoTogli } from '@/lib/percorso/operazioni'

/**
 * The client's writes from the area /percorso (release B1a): the core
 * (lib/percorso/operazioni.ts) with the client's cookie session, never the service role.
 * The database decides who the client is (cliente_corrente()) and what can move. They
 * revalidate only /percorso.
 */

/** A step completed with its action: «Ho guardato il video», «Accetto e vado avanti». */
export async function avanzaPasso(input: unknown): Promise<EsitoPercorso> {
  const esito = await percorso.avanzaPasso(await createClient(), input)
  revalidatePath('/percorso', 'layout')
  return esito
}

/** «Segna come completata» on a lesson of the Aula (1.83.0). */
export async function completaLezione(input: unknown): Promise<EsitoLezione> {
  const esito = await percorso.completaLezione(await createClient(), input)
  revalidatePath('/percorso', 'layout')
  return esito
}

/** A consent given again after its text changed. */
export async function daiConsenso(input: unknown): Promise<EsitoConsenso> {
  const esito = await percorso.daiConsenso(await createClient(), input)
  revalidatePath('/percorso', 'layout')
  return esito
}

/**
 * The questionnaire saved (release B1b), only over the version the page read. No
 * revalidatePath, on purpose: it runs a second after every change, and a redraw of the page
 * would send the whole questionnaire back each time; the page keeps its own state and the
 * path is redrawn by the sending.
 */
export async function salvaQuestionario(dati: FormData): Promise<EsitoSalva> {
  // the answers travel inside a FormData, never as plain arguments: `next dev` writes every call
  // with its arguments in the terminal, and these are health data
  let input: unknown = null
  const testo = dati instanceof FormData ? dati.get('dati') : null
  if (typeof testo === 'string' && testo.length <= 200_000) {
    try {
      input = JSON.parse(testo)
    } catch {
      input = null
    }
  }
  return percorso.salvaQuestionario(await createClient(), input)
}

/**
 * «Invia il questionario»: the step done, the next one open. After the answer (1.82.0) the row
 * goes to Dany's Google sheet with the service role (lib/percorso/foglio-lavoro.ts): the client
 * never waits for Google, and a failure retries from the queue.
 */
export async function inviaQuestionario(input: unknown): Promise<EsitoInvia> {
  const db = await createClient()
  const esito = await percorso.inviaQuestionario(db, input)
  revalidatePath('/percorso', 'layout')
  if (esito.ok && esito.esito === 'inviato') {
    lavoraFoglioDopo()
    // the email to the addresses of the settings (1.84.0): the client is the one of this session (his own row,
    // under RLS), never an id from the browser
    const { data } = await db.from('clienti_account').select('client_id').maybeSingle()
    if (data?.client_id) avvisaQuestionarioInviatoDopo(data.client_id)
  }
  return esito
}

/**
 * A file of the questionnaire removed before sending: the row da_cancellare, the object removed
 * now with the path the database gave (the evening cron removes it again, since a signed upload
 * URL outlives the removal). The path never goes back to the browser.
 */
export async function togliAllegato(input: unknown): Promise<EsitoTogli> {
  const esito = await percorso.togliAllegato(await createClient(), input)
  if (!esito.ok) return esito
  if (esito.percorso) await togliFileQuestionario([esito.percorso])
  return { ok: true, allegati: esito.allegati }
}
