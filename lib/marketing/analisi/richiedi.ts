import 'server-only'

import { urlPassoMarketing } from '@/lib/marketing/analisi/config'
import { VERSIONE_PROMPT_VISIONE } from '@/lib/marketing/analisi/prompt'
import { dovrebbeRileggere } from '@/lib/marketing/analisi/rileggere'
import { trascrizioneAttiva } from '@/lib/marketing/trascrizione'
import { createAdminClient } from '@/lib/supabase/admin'
import type { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

/** The roles that ask for an analysis (Dany, 09/10/2026): the admin and marketing; the video editor reads. */
export const RUOLI_ANALIZZA = ['admin', 'marketing'] as const
export const SOLO_CHI_ANALIZZA = 'Le analisi le chiedono l’admin e il marketing.'

export { COSTO_STIMATO_PER_REEL_USD, RICHIESTE_AL_GIORNO } from '@/lib/marketing/analisi/costi'

export type EsitoRichiesta = { ok: true; id: string } | { ok: false; errore: string }

/**
 * One click on «Analizza» (the reading of the reel, Claude's analysis and its score, 1.39.0): puts the analysis in
 * the queue with the session of whoever asks, so the database checks the role, the limits (10 requests a day
 * for the team, the month's spending) and what is already going, and answers in its own sentences. The
 * reading is redone when it is missing, only the speech, not ready, made with an older prompt, or lost to a
 * cause that can pass. Does not wake the chain: `svegliaCatena` does, once, after one or many requests.
 */
export async function richiediAnalisi(supabase: Db, mediaId: string): Promise<EsitoRichiesta> {
  const { data: lettura } = await supabase
    .from('instagram_letture')
    .select('richiesta, stato, visione_esito, versione_prompt_visione, video, trascrizione_esito')
    .eq('media_id', mediaId)
    .maybeSingle()
  const rileggi = dovrebbeRileggere(lettura, { versionePrompt: VERSIONE_PROMPT_VISIONE, trascrizioneAttiva: trascrizioneAttiva() })

  const { data: id, error } = await supabase.rpc('marketing_analisi_richiedi', { p_media_id: mediaId, p_rileggi: rileggi })
  if (error || !id) {
    // the database's own sentences (in Italian) for a refusal it explains; anything else is generic
    const frase = error && ['22023', '42501', 'P0002'].includes(error.code) ? error.message : 'Analisi non partita. Riprova.'
    return { ok: false, errore: frase }
  }
  return { ok: true, id }
}

/** Writes the address of the steps (never from the request) and wakes the chain if the lease is free. Never throws. */
export async function svegliaCatena(): Promise<void> {
  try {
    const db = createAdminClient()
    await db.rpc('marketing_imposta_url', { p_url: urlPassoMarketing() as never })
    await db.rpc('marketing_sveglia')
  } catch (e) {
    // the analysis is queued: the scheduler (every 5 minutes) picks it up anyway
    console.error('[analisi] catena non svegliata:', e instanceof Error ? e.name : 'errore')
  }
}

/** The request comes from a page of this app (the browser sends Origin on a POST). */
export function stessaOrigine(request: { headers: Headers }): boolean {
  const origine = request.headers.get('origin')
  if (!origine) return false
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return Boolean(host) && new URL(origine).host === host
  } catch {
    return false
  }
}
