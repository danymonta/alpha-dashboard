'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { insightConfigurato, UrlPassoNonValido, urlPasso } from '@/lib/insight/config'
import { AGGIORNA } from '@/lib/insight/parole'
import { salvaUrlPasso, URL_PASSO_NON_SALVATO } from '@/lib/insight/url-passo'
import { createClient } from '@/lib/supabase/server'
import { segnaFattoSchema, URL_PASSO_MANCANTE, type SegnaFattoInput } from '@/lib/validation/insight'

/**
 * The two taps of the Insight page (1.35.0, CLAUDE.md section 29), with the
 * session of whoever taps: RLS decides (insight_puo_leggere(), the admin in
 * insight_richiedi), the role check here only turns a refusal into words. The
 * one thing the service role does is writing the address of the steps, built
 * here from APP_URL (lib/insight/url-passo.ts), after the admin was checked.
 */

export type EsitoFatto = { ok: true } | { ok: false; errore: string; solaLettura?: true }
export type EsitoAggiorna = { ok: true; esecuzione: string | null } | { ok: false; errore: string }

const SOLO_INSIGHT = 'L’Insight lo vedono l’admin e i setter.'
const NON_SALVATO = 'Non salvato, riprova.'
const RECAP_SPARITO = 'Questo recap non c’è più: ricarica la pagina.'

/**
 * One «Fatto» switch of one recap (giorno, canale), shared by the admin and
 * the setters: an upsert of a boolean, never a delete, so a Realtime UPDATE
 * carries the whole row to the others.
 *
 * No revalidatePath, on purpose (the exception CLAUDE.md section 10
 * «Fluidità» allows, spec 1.35.0 N17): the switch is optimistic in the
 * browser, Realtime brings it to the other viewers and the page reads the set
 * again when it comes back, while a redraw would send the whole recap (up to
 * 400 KB) again at every tap.
 */
export async function segnaFatto(input: SegnaFattoInput): Promise<EsitoFatto> {
  const negato = await negaSeNon(['admin', 'setter'], SOLO_INSIGHT)
  if (negato) return { ok: false, errore: negato, solaLettura: true }

  const letto = segnaFattoSchema.safeParse(input)
  if (!letto.success) return { ok: false, errore: letto.error.issues[0]?.message ?? NON_SALVATO }
  const { fonte, giorno, chiave, fatto } = letto.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('insight_fatto')
    .upsert({ giorno, canale: fonte, chiave, fatto }, { onConflict: 'giorno,canale,chiave' })
  if (!error) return { ok: true }
  // RLS refused the row: the account lost the Insight while the page was open
  if (error.code === '42501') return { ok: false, errore: SOLO_INSIGHT, solaLettura: true }
  // the recap went (the nightly cleanup after 30 days): its switches go with it
  if (error.code === '23503') return { ok: false, errore: RECAP_SPARITO }
  return { ok: false, errore: NON_SALVATO }
}

/**
 * «Aggiorna dati» (admin): a new run of the Insight now. A fast RPC
 * (insight_richiedi queues the run and sends its first step with pg_net), so
 * a server action is fine (CLAUDE.md section 10: only long work goes to a
 * route). Without ANTHROPIC_API_KEY no run is created (D23); without a valid
 * address of the app nothing is called (D18). The database's sentences (an
 * update already running, the eighth of the day) pass as written.
 */
export async function aggiornaDati(): Promise<EsitoAggiorna> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  if (!insightConfigurato()) return { ok: false, errore: AGGIORNA.chiaveMancante }

  let url: string | null
  try {
    url = urlPasso()
  } catch (e) {
    if (e instanceof UrlPassoNonValido) return { ok: false, errore: URL_PASSO_MANCANTE }
    throw e
  }

  // null: no address to send the step to (INSIGHT_URL_PASSO=manuale), the run waits.
  // The address is written by the server, never chosen by the session that asks for the run
  if (url !== null && !(await salvaUrlPasso(url))) return { ok: false, errore: URL_PASSO_NON_SALVATO }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('insight_richiedi')
  if (error) return { ok: false, errore: messaggioErrore(error, AGGIORNA.nonAvviato) }

  revalidatePath('/insight')
  return { ok: true, esecuzione: typeof data === 'string' ? data : null }
}
