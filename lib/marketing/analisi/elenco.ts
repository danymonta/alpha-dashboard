import 'server-only'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { RICHIESTE_AL_GIORNO } from '@/lib/marketing/analisi/costi'
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
  'eliminato', 'media_type', 'didascalia_inizio', 'stato_collegamento', 'contenuto_id', 'nome', 'reel_type', 'formato', 'status',
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

/** The reels of the page, and whether the verdicts could not be read (the list is then without them). */
export type LetturaReel = { righe: RigaReel[]; senzaVerdetti: boolean }

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
  if (f.verdetto !== 'tutti') q = q.eq('verdetto_oggi', f.verdetto)
  if (f.punteggio === 'non_valutato') q = q.eq('eliminato', false).is('punteggio_totale', null)
  else if (f.punteggio !== 'tutte') q = q.eq('punteggio_fascia', f.punteggio)
  if (f.ordine === 'punteggio') q = q.order('punteggio_totale', { ascending: false, nullsFirst: false })
  else if (f.ordine === 'views') q = q.order('views', { ascending: false, nullsFirst: false })
  else if (f.ordine === 'lead') q = q.order('in_target_14g', { ascending: false, nullsFirst: false }).order('dm_14g', { ascending: false, nullsFirst: false })
  q = q.order('pubblicato_il', { ascending: false }).limit(REEL_MAX)
  const { data, error } = await q
  if (error) throw new Error(`reel non letti (${error.code ?? 'errore'})`)
  return (data ?? []) as unknown as RigaReel[]
}

const COLONNE_NUMERI = [
  'media_id', 'shortcode', 'permalink', 'copertina_url', 'pubblicato_il', 'giorno', 'durata_ms', 'video_disponibile', 'eliminato',
  'media_type', 'metriche_stato', 'metriche_il', 'numeri_parziali', 'eta_ore', 'views', 'reach', 'saved', 'shares', 'likes',
  'comments', 'like_count', 'comments_count', 'avg_watch_ms', 'skip_rate', 'views_3g', 'views_7g', 'tasso_salvataggi',
  'tasso_condivisioni', 'visione_su_durata', 'lead_contati', 'lead_completi', 'dm_14g', 'in_target_14g', 'call_14g', 'dm',
  'lead_in_target', 'call_prenotate',
].join(', ')

/**
 * The same list without the verdicts, the comparison, the readings and the analyses: only the numbers of the
 * posts and their place in the calendar (v_instagram_numeri, v_instagram_post), which are plain reads. It is
 * the way out when v_analisi_reel does not answer (1.37.1): the page shows the reels and says what is missing.
 */
export async function leggiReelSenzaVerdetti(db: Db, f: FiltriAnalisi, adesso: Date = new Date()): Promise<RigaReel[]> {
  const dal = aggiungiGiorni(oggiRoma(adesso), -f.periodo)
  let q = db.from('v_instagram_numeri').select(COLONNE_NUMERI).gte('giorno', dal).or('reel.eq.true,media_type.eq.VIDEO')
  if (f.ordine === 'views') q = q.order('views', { ascending: false, nullsFirst: false })
  else if (f.ordine === 'lead') q = q.order('in_target_14g', { ascending: false, nullsFirst: false }).order('dm_14g', { ascending: false, nullsFirst: false })
  const { data, error } = await q.order('pubblicato_il', { ascending: false }).limit(REEL_MAX)
  if (error) throw new Error(`reel non letti (${error.code ?? 'errore'})`)
  const numeri = (data ?? []) as unknown as Record<string, unknown>[]
  if (numeri.length === 0) return []

  const ids = numeri.map((n) => n.media_id as string)
  const { data: post, error: errorePost } = await db
    .from('v_instagram_post')
    .select('media_id, didascalia, stato_collegamento, contenuto_id, contenuto_nome, contenuto_stato')
    .in('media_id', ids)
  if (errorePost) throw new Error(`reel non letti (${errorePost.code ?? 'errore'})`)
  const perId = new Map((post ?? []).map((p) => [p.media_id as string, p]))

  const righe = numeri.map((n) => {
    const p = perId.get(n.media_id as string)
    return {
      ...n,
      didascalia_inizio: p?.didascalia ? [...p.didascalia].slice(0, 140).join('') : null,
      stato_collegamento: p?.stato_collegamento ?? null,
      contenuto_id: p?.contenuto_id ?? null,
      nome: p?.contenuto_nome ?? null,
      status: p?.contenuto_stato ?? null,
      reel_type: null, formato: null, eta_confronto: null, confronto: null, views_all_eta: null, views_confronto: null,
      views_rapporto: null, salvataggi_rapporto: null, visione_media_s: null, quota_vista: null, fascia_pubblico: null,
      fascia_lead: null, verdetto_oggi: null, lettura_stato: null, lettura_richiesta: null, lettura_video: null,
      trascrizione_esito: null, visione_esito: null, fonte_visione: null, lettura_errore: null, analisi_id: null,
      analisi_stato: null, analisi_verdetto: null, analisi_eta_ore: null, analisi_eta_confronto: null,
      analisi_finita_il: null, analisi_errore: null, analisi_motivo: null,
      punteggio_totale: null, punteggio_fascia: null, punteggio_tipo: null,
    }
  }) as unknown as RigaReel[]
  return f.senzaContenuto ? righe.filter((r) => r.contenuto_id === null) : righe
}

/**
 * The reels of the page: the full list, or (only with the default verdict and score filters, the ones the page opens
 * with) the list without verdicts when the full one cannot be read. Throws when neither can.
 */
export async function leggiReelConRipiego(db: Db, f: FiltriAnalisi, adesso: Date = new Date()): Promise<LetturaReel> {
  try {
    return { righe: await leggiReel(db, f, adesso), senzaVerdetti: false }
  } catch (errore) {
    if (f.verdetto !== 'tutti' || f.punteggio !== 'tutte') throw errore
    try {
      const righe = await leggiReelSenzaVerdetti(db, f, adesso)
      console.error('[analisi] elenco dei reel senza verdetti:', errore instanceof Error ? errore.message : 'errore')
      return { righe, senzaVerdetti: true }
    } catch {
      throw errore
    }
  }
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
