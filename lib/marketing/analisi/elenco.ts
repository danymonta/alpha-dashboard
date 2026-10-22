import 'server-only'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { RICHIESTE_AL_GIORNO } from '@/lib/marketing/analisi/costi'
import type { Database } from '@/lib/supabase/database.types'
import type { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

/**
 * One row of the Pubblicati page, as v_pubblicati gives it (25/10/2026): every post of the account, with the columns
 * of the reel panel (verdict, score, reading, analysis) filled for the reels and empty for the others. The name
 * stays the reel panel's: the panel, the badges and the verdicts were made for the reels, and a post that is not a
 * reel simply has none of them.
 */
export type RigaReel = Database['public']['Views']['v_pubblicati']['Row']

/** The columns of the list and of the panel's first paint (never the speech or the card: the panel reads them). */
export const COLONNE_REEL = [
  'media_id', 'shortcode', 'permalink', 'copertina_url', 'pubblicato_il', 'giorno', 'durata_ms', 'video_disponibile',
  'eliminato', 'media_type', 'reel', 'didascalia_inizio', 'contenuto_id', 'nome', 'reel_type', 'formato', 'status',
  'view_count', 'view_count_da_instagram',
  'metriche_stato', 'metriche_il', 'numeri_parziali', 'eta_ore',
  'views', 'reach', 'saved', 'shares', 'likes', 'comments', 'like_count', 'comments_count', 'avg_watch_ms', 'skip_rate',
  'views_3g', 'views_7g', 'tasso_salvataggi', 'tasso_condivisioni', 'visione_su_durata',
  'eta_confronto', 'confronto', 'views_all_eta', 'views_confronto', 'views_rapporto', 'salvataggi_rapporto',
  'visione_media_s', 'quota_vista', 'fascia_pubblico', 'fascia_lead', 'verdetto_oggi',
  'lead_contati', 'lead_completi', 'dm_14g', 'in_target_14g', 'call_14g', 'dm', 'lead_in_target', 'call_prenotate',
  'lettura_stato', 'lettura_richiesta', 'lettura_video', 'trascrizione_esito', 'visione_esito', 'fonte_visione', 'lettura_errore',
  'analisi_id', 'analisi_stato', 'analisi_verdetto', 'analisi_eta_ore', 'analisi_eta_confronto', 'analisi_finita_il',
  'analisi_errore', 'analisi_motivo', 'punteggio_totale', 'punteggio_fascia', 'punteggio_tipo',
].join(', ')

export type Riepilogo = {
  reel: number
  views_3g_mediana: number | null
  dm_14g: number
  in_target_14g: number
  reel_contati: number
  reel_non_contati: number
  da_cambiare: number
}

/** The tiles for the same period. Throws on a read error. */
export async function leggiRiepilogo(db: Db, f: { periodo: number }, adesso: Date = new Date()): Promise<Riepilogo> {
  const oggi = oggiRoma(adesso)
  const { data, error } = await db.rpc('analisi_riepilogo', { p_da: aggiungiGiorni(oggi, -f.periodo), p_a: oggi })
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`riepilogo non letto (${error?.code ?? 'errore'})`)
  const r = data as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' ? v : 0)
  return {
    reel: n(r.reel),
    views_3g_mediana: typeof r.views_3g_mediana === 'number' ? r.views_3g_mediana : null,
    dm_14g: n(r.dm_14g),
    in_target_14g: n(r.in_target_14g),
    reel_contati: n(r.reel_contati),
    reel_non_contati: n(r.reel_non_contati),
    da_cambiare: n(r.da_cambiare),
  }
}

export type Situazione = {
  automatiche: 'attive' | 'in_pausa_spesa' | 'ferme_chiave' | 'spente'
  ultimo_passo_il: string | null
  in_coda: number
  /** the admin only */
  costo_mese?: number
  costo_max?: number
  note_team?: boolean
  automatiche_accese?: boolean
  ultimo_errore?: string | null
  ultimo_tick_il?: string | null
  ultimo_esito?: string | null
}

/** The state of the work (marketing_lavori_situazione): null when it cannot be read. */
export async function leggiSituazione(db: Db): Promise<Situazione | null> {
  const { data, error } = await db.rpc('marketing_lavori_situazione')
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as unknown as Situazione
}

export type StatoStatistiche = {
  permesso: boolean | null
  tokenPresente: boolean | null
}

/** Whether Meta said the permission for the statistics is missing (null: never tried). */
export async function leggiPermesso(db: Db): Promise<boolean | null> {
  const { data } = await db.from('instagram_contenuti_stato').select('permesso_insights').maybeSingle()
  return data?.permesso_insights ?? null
}

/**
 * How many requests of «Analizza» the team can still make today (10 a day for everybody; a failed one does not
 * count, as the database counts them). A read that fails says 0: the button then asks nothing it could not do.
 */
export async function leggiRichiesteRimaste(db: Db, adesso: Date = new Date()): Promise<number> {
  const { data, error } = await db
    .from('marketing_analisi')
    .select('created_at')
    .eq('motivo', 'richiesta')
    .neq('stato', 'fallita')
    .gte('created_at', new Date(adesso.getTime() - 36 * 3_600_000).toISOString())
  if (error) return 0
  const oggi = oggiRoma(adesso)
  const fatte = (data ?? []).filter((x) => oggiRoma(new Date(x.created_at)) === oggi).length
  return Math.max(0, RICHIESTE_AL_GIORNO - fatte)
}
