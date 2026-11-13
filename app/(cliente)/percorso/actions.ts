'use server'

import { revalidatePath } from 'next/cache'

import * as percorso from '@/lib/percorso/operazioni'
import type { EsitoConsenso, EsitoInvia, EsitoPercorso, EsitoSalva, EsitoTogli } from '@/lib/percorso/operazioni'
import { createClient } from '@/lib/supabase/server'

export type { EsitoConsenso, EsitoInvia, EsitoPercorso, EsitoSalva, EsitoTogli } from '@/lib/percorso/operazioni'

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

/** «Invia il questionario»: the step done, the next one open. */
export async function inviaQuestionario(input: unknown): Promise<EsitoInvia> {
  const esito = await percorso.inviaQuestionario(await createClient(), input)
  revalidatePath('/percorso', 'layout')
  return esito
}

/** A file of the questionnaire removed before sending (the evening cron removes the object). */
export async function togliAllegato(input: unknown): Promise<EsitoTogli> {
  return percorso.togliAllegato(await createClient(), input)
}
