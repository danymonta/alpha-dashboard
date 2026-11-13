'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { leggiColonna } from '@/lib/google/fogli'
import { ErroreGoogle, leggiChiave, tokenServizio } from '@/lib/google/service-account'
import { COLONNA_RIF } from '@/lib/onboarding/foglio'
import { lavoraFoglio } from '@/lib/percorso/foglio-lavoro'
import { FRASI_FOGLIO } from '@/lib/percorso/frasi-foglio'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * The Google service account of the onboarding sheet (1.82.0, CLAUDE.md section 34, release C).
 * The key arrives inside a FormData (field `chiave`, the text of the .json file), never as a plain
 * argument (`next dev` logs the arguments of every server function call), goes to Vault through
 * google_imposta_chiave with the admin's own session, and never comes back. Then one test with
 * the service role: a token and a read of column AH of the sheet. The queue runs with the
 * service role (lib/percorso/foglio-lavoro.ts), only after the admin check.
 */

const FILE_MAX = 20_000

export type EsitoChiaveGoogle = { ok: true; email: string; prova: string | null } | { ok: false; errore: string }
export type EsitoSemplice = { ok: true } | { ok: false; errore: string }
export type EsitoScrivi =
  | { ok: true; scritte: number; svuotate: number; errori: number; motivo?: string }
  | { ok: false; errore: string }

function rivalida() {
  revalidatePath('/settings/chiavi')
}

function frase(e: unknown): string {
  if (e instanceof ErroreGoogle) {
    if (e.tipo === 'chiave') return FRASI_FOGLIO.chiave
    if (e.tipo === 'permesso') return FRASI_FOGLIO.permesso
    if (e.tipo === 'non_trovato') return FRASI_FOGLIO.nonTrovato
  }
  return FRASI_FOGLIO.rete
}

/** One test of the key and of the sharing: null when Google answers and the sheet reads. */
async function prova(): Promise<string | null> {
  const admin = createAdminClient()
  const [{ data: testo }, { data: imp }] = await Promise.all([
    admin.rpc('google_chiave'),
    admin.from('onboarding_impostazioni').select('foglio_id, foglio_scheda').maybeSingle(),
  ])
  const chiave = leggiChiave(typeof testo === 'string' ? testo : null)
  if (!chiave || !imp) return FRASI_FOGLIO.senzaChiave
  try {
    const token = await tokenServizio(chiave)
    await leggiColonna({ id: imp.foglio_id, scheda: imp.foglio_scheda, token }, COLONNA_RIF)
    await admin.rpc('google_segna_errore', { p_errore: '' })
    return null
  } catch (e) {
    const testoErrore = frase(e)
    await admin.rpc('google_segna_errore', { p_errore: testoErrore })
    return testoErrore
  }
}

export async function salvaChiaveGoogle(dati: unknown): Promise<EsitoChiaveGoogle> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const testo = dati instanceof FormData ? dati.get('chiave') : null
  if (typeof testo !== 'string' || !testo.trim() || testo.length > FILE_MAX) {
    return { ok: false, errore: 'Questo non è il file JSON di un service account: scaricalo di nuovo da Google Cloud.' }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('google_imposta_chiave', { p_json: testo })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Chiave non salvata. Riprova.') }
  const esito = await prova()
  rivalida()
  return { ok: true, email: typeof data === 'string' ? data : '', prova: esito }
}

export async function togliChiaveGoogle(): Promise<EsitoSemplice> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const supabase = await createClient()
  const { error } = await supabase.rpc('google_togli_chiave')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Chiave non tolta. Riprova.') }
  rivalida()
  return { ok: true }
}

/** The ID of a sheet from its link («…/spreadsheets/d/<id>/edit…») or the ID itself. */
function idDaLink(testo: string): string | null {
  const t = testo.trim()
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/.exec(t)
  if (m) return m[1]
  return /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : null
}

export async function salvaFoglio(input: unknown): Promise<EsitoSemplice> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const r = (input && typeof input === 'object' ? input : {}) as { foglio?: unknown; scheda?: unknown }
  const id = typeof r.foglio === 'string' ? idDaLink(r.foglio) : null
  if (!id) return { ok: false, errore: 'L’ID del foglio non è valido: incolla il link del foglio.' }
  const scheda = typeof r.scheda === 'string' ? r.scheda.trim() : ''
  if (!scheda || scheda.length > 100 || /['!]/.test(scheda)) return { ok: false, errore: 'Il nome della scheda non è valido.' }
  const supabase = await createClient()
  const { error } = await supabase.from('onboarding_impostazioni').update({ foglio_id: id, foglio_scheda: scheda }).eq('id', true)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Foglio non salvato. Riprova.') }
  rivalida()
  return { ok: true }
}

/** «Scrivi ora sul foglio»: the rows waiting, at most 20, now. */
export async function scriviOraFoglio(): Promise<EsitoScrivi> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const esito = await lavoraFoglio(createAdminClient(), { limite: 20 })
  rivalida()
  if (esito.motivo === 'senza_chiave') return { ok: false, errore: FRASI_FOGLIO.senzaChiave }
  return { ok: true, scritte: esito.scritte, svuotate: esito.svuotate, errori: esito.errori, motivo: esito.motivo }
}
