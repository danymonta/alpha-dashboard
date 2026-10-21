import 'server-only'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { COLONNE_REEL, type RigaReel } from '@/lib/marketing/analisi/elenco'
import { patternRicerca } from '@/lib/marketing/filtri'
import type { FiltriPubblicati } from '@/lib/marketing/pubblicati/filtri'
import type { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

/** The posts the page lists at most. */
export const POST_MAX = 200

/**
 * The posts of the period with the filters, the most recent first: at most 200, those not on Instagram any more left
 * out (a post that was deleted or archived is not «pubblicato»). Reads v_pubblicati, a plain read of the same views
 * the Analisi page read (numbers, leads, verdict, score) for every kind of post. The caption search takes every
 * character literally (`imatch`, never `ilike`: PostgREST reads `*` there as `%`). Throws on a read error.
 */
export async function leggiPubblicati(db: Db, f: FiltriPubblicati, adesso: Date = new Date()): Promise<RigaReel[]> {
  const dal = aggiungiGiorni(oggiRoma(adesso), -f.periodo)
  let q = db.from('v_pubblicati').select(COLONNE_REEL).eq('eliminato', false).gte('giorno', dal)
  if (f.tipo === 'reel') q = q.or('reel.eq.true,media_type.eq.VIDEO')
  else if (f.tipo === 'carosello') q = q.eq('media_type', 'CAROUSEL_ALBUM').eq('reel', false)
  else if (f.tipo === 'foto') q = q.eq('media_type', 'IMAGE').eq('reel', false)
  if (f.piano === 'nel_piano') q = q.not('contenuto_id', 'is', null)
  else if (f.piano === 'fuori') q = q.is('contenuto_id', null)
  if (f.cambiare) q = q.eq('verdetto_oggi', 'cambiare')
  if (f.q) q = q.regexIMatch('didascalia', patternRicerca(f.q))
  const { data, error } = await q.order('pubblicato_il', { ascending: false }).limit(POST_MAX)
  if (error) throw new Error(`post non letti (${error.code ?? 'errore'})`)
  return (data ?? []) as unknown as RigaReel[]
}

const COLONNE_NUMERI = [
  'media_id', 'shortcode', 'permalink', 'copertina_url', 'pubblicato_il', 'giorno', 'durata_ms', 'video_disponibile', 'eliminato',
  'media_type', 'reel', 'metriche_stato', 'metriche_il', 'numeri_parziali', 'eta_ore', 'views', 'reach', 'saved', 'shares', 'likes',
  'comments', 'like_count', 'comments_count', 'avg_watch_ms', 'skip_rate', 'views_3g', 'views_7g', 'tasso_salvataggi',
  'tasso_condivisioni', 'visione_su_durata', 'lead_contati', 'lead_completi', 'dm_14g', 'in_target_14g', 'call_14g', 'dm',
  'lead_in_target', 'call_prenotate',
].join(', ')

/**
 * The same list without the verdicts, the comparison, the readings and the analyses: only the numbers of the posts
 * (v_instagram_numeri), their captions and the content they are linked to, which are plain reads. It is the way out
 * when v_pubblicati does not answer (it computes the verdict of every reel, 1.37.1): the page shows the posts and
 * says what is missing. The «Da cambiare» filter has no verdicts to filter by: the list is then empty.
 */
export async function leggiPubblicatiSenzaVerdetti(db: Db, f: FiltriPubblicati, adesso: Date = new Date()): Promise<RigaReel[]> {
  if (f.cambiare) return []
  const dal = aggiungiGiorni(oggiRoma(adesso), -f.periodo)
  let q = db.from('v_instagram_numeri').select(COLONNE_NUMERI).eq('eliminato', false).gte('giorno', dal)
  if (f.tipo === 'reel') q = q.or('reel.eq.true,media_type.eq.VIDEO')
  else if (f.tipo === 'carosello') q = q.eq('media_type', 'CAROUSEL_ALBUM').eq('reel', false)
  else if (f.tipo === 'foto') q = q.eq('media_type', 'IMAGE').eq('reel', false)
  const { data, error } = await q.order('pubblicato_il', { ascending: false }).limit(POST_MAX)
  if (error) throw new Error(`post non letti (${error.code ?? 'errore'})`)
  const numeri = (data ?? []) as unknown as Record<string, unknown>[]
  if (numeri.length === 0) return []

  const codici = numeri.map((n) => n.shortcode as string)
  const [post, contenuti] = await Promise.all([
    db.from('instagram_contenuti').select('shortcode, didascalia').in('shortcode', codici),
    db.from('marketing_contenuti').select('id, nome, stato, reel_type, formato, view_count, view_count_da_instagram, instagram_shortcode').in('instagram_shortcode', codici),
  ])
  if (post.error || contenuti.error) throw new Error(`post non letti (${(post.error ?? contenuti.error)?.code ?? 'errore'})`)
  const didascalie = new Map((post.data ?? []).map((p) => [p.shortcode, p.didascalia]))
  const perCodice = new Map((contenuti.data ?? []).map((c) => [c.instagram_shortcode, c]))

  const righe = numeri.map((n) => {
    const c = perCodice.get(n.shortcode as string)
    const didascalia = didascalie.get(n.shortcode as string) ?? null
    return {
      ...n,
      didascalia_inizio: didascalia ? [...didascalia].slice(0, 140).join('') : null,
      contenuto_id: c?.id ?? null,
      nome: c?.nome ?? null,
      status: c?.stato ?? null,
      reel_type: c?.reel_type ?? null,
      formato: c?.formato ?? null,
      view_count: c?.view_count ?? null,
      view_count_da_instagram: c?.view_count_da_instagram ?? null,
      eta_confronto: null, confronto: null, views_all_eta: null, views_confronto: null,
      views_rapporto: null, salvataggi_rapporto: null, visione_media_s: null, quota_vista: null, fascia_pubblico: null,
      fascia_lead: null, verdetto_oggi: null, lettura_stato: null, lettura_richiesta: null, lettura_video: null,
      trascrizione_esito: null, visione_esito: null, fonte_visione: null, lettura_errore: null, analisi_id: null,
      analisi_stato: null, analisi_verdetto: null, analisi_eta_ore: null, analisi_eta_confronto: null,
      analisi_finita_il: null, analisi_errore: null, analisi_motivo: null,
      punteggio_totale: null, punteggio_fascia: null, punteggio_tipo: null,
    }
  }) as unknown as RigaReel[]
  return righe.filter((r) => {
    if (f.piano === 'nel_piano') return r.contenuto_id !== null
    if (f.piano === 'fuori') return r.contenuto_id === null
    return true
  }).filter((r) => {
    if (!f.q) return true
    const d = didascalie.get(r.shortcode as string) ?? ''
    return d.toLowerCase().includes(f.q.toLowerCase())
  })
}

/** The posts of the page, and whether the verdicts could not be read (the list is then without them). */
export type LetturaPubblicati = { righe: RigaReel[]; senzaVerdetti: boolean }

/**
 * The full list or, when it cannot be read, the list without verdicts (and the page says so); throws when neither
 * can be read.
 */
export async function leggiPubblicatiConRipiego(db: Db, f: FiltriPubblicati, adesso: Date = new Date()): Promise<LetturaPubblicati> {
  try {
    return { righe: await leggiPubblicati(db, f, adesso), senzaVerdetti: false }
  } catch (errore) {
    try {
      const righe = await leggiPubblicatiSenzaVerdetti(db, f, adesso)
      console.error('[pubblicati] elenco dei post senza verdetti:', errore instanceof Error ? errore.message : 'errore')
      return { righe, senzaVerdetti: true }
    } catch {
      throw errore
    }
  }
}
