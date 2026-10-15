import 'server-only'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import type { FiltriAnalisi } from '@/lib/marketing/analisi/filtri'
import type { Database } from '@/lib/supabase/database.types'
import type { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

/** One row of the page, as v_analisi_reel gives it. */
export type RigaReel = Database['public']['Views']['v_analisi_reel']['Row']

/** The reels the page lists at most. */
export const REEL_MAX = 200

/** The columns of the list (never the speech or the card: the panel reads them). */
export const COLONNE_REEL = [
  'media_id', 'shortcode', 'permalink', 'copertina_url', 'pubblicato_il', 'giorno', 'durata_ms', 'video_disponibile',
  'eliminato', 'media_type', 'stato_collegamento', 'contenuto_id', 'nome', 'reel_type', 'formato', 'status',
  'metriche_stato', 'metriche_il', 'numeri_parziali', 'eta_ore',
  'views', 'reach', 'saved', 'shares', 'likes', 'comments', 'like_count', 'comments_count', 'avg_watch_ms', 'skip_rate',
  'views_3g', 'views_7g', 'tasso_salvataggi', 'tasso_condivisioni', 'visione_su_durata',
  'eta_confronto', 'confronto', 'views_all_eta', 'views_confronto', 'views_rapporto', 'salvataggi_rapporto',
  'visione_media_s', 'quota_vista', 'fascia_pubblico', 'fascia_lead', 'verdetto_oggi',
  'lead_contati', 'lead_completi', 'dm_14g', 'in_target_14g', 'call_14g', 'dm', 'lead_in_target', 'call_prenotate',
  'lettura_stato', 'lettura_richiesta', 'lettura_video', 'trascrizione_esito', 'visione_esito', 'fonte_visione', 'lettura_errore',
  'analisi_id', 'analisi_stato', 'analisi_verdetto', 'analisi_eta_ore', 'analisi_eta_confronto', 'analisi_finita_il',
  'analisi_errore', 'analisi_motivo',
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

/** The reels of the period with the filters, in the order asked: at most 200. Throws on a read error. */
export async function leggiReel(db: Db, f: FiltriAnalisi, adesso: Date = new Date()): Promise<RigaReel[]> {
  const dal = aggiungiGiorni(oggiRoma(adesso), -f.periodo)
  let q = db.from('v_analisi_reel').select(COLONNE_REEL).gte('giorno', dal)
  if (f.senzaContenuto) q = q.is('contenuto_id', null)
  if (f.verdetto === 'da_analizzare') q = q.eq('eliminato', false).or('analisi_stato.is.null,analisi_stato.neq.pronta')
  else if (f.verdetto !== 'tutti') q = q.eq('verdetto_oggi', f.verdetto)
  if (f.ordine === 'views') q = q.order('views', { ascending: false, nullsFirst: false })
  else if (f.ordine === 'lead') q = q.order('in_target_14g', { ascending: false, nullsFirst: false }).order('dm_14g', { ascending: false, nullsFirst: false })
  q = q.order('pubblicato_il', { ascending: false }).limit(REEL_MAX)
  const { data, error } = await q
  if (error) throw new Error(`reel non letti (${error.code ?? 'errore'})`)
  return (data ?? []) as unknown as RigaReel[]
}

/** The tiles for the same period. Throws on a read error. */
export async function leggiRiepilogo(db: Db, f: FiltriAnalisi, adesso: Date = new Date()): Promise<Riepilogo> {
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
