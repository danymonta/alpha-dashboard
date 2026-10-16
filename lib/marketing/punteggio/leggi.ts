import 'server-only'

import type { CodiceFascia } from '@/lib/marketing/punteggio/tabelle'
import type { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

/** The score of a reel as the lists show it: the total and the band. */
export type PunteggioBreve = { totale: number; fascia: CodiceFascia }

/**
 * The scores of some reels (1.39.0), read with the session of whoever looks (RLS: the Marketing area): for each
 * media the last ready analysis that has one. Two small columns, never the document. A read that fails gives
 * an empty map: the lists then say «Non valutato» and link to the analysis, which reads it again.
 */
export async function leggiPunteggi(db: Db, mediaIds: readonly string[]): Promise<Map<string, PunteggioBreve>> {
  const fuori = new Map<string, PunteggioBreve>()
  if (mediaIds.length === 0) return fuori
  const { data, error } = await db
    .from('marketing_analisi')
    .select('media_id, punteggio_totale, punteggio_fascia')
    .in('media_id', [...mediaIds])
    .eq('stato', 'pronta')
    .not('punteggio_totale', 'is', null)
    .order('finita_il', { ascending: false })
  if (error) return fuori
  for (const r of data ?? []) {
    if (!fuori.has(r.media_id) && r.punteggio_totale !== null && r.punteggio_fascia) {
      fuori.set(r.media_id, { totale: r.punteggio_totale, fascia: r.punteggio_fascia as CodiceFascia })
    }
  }
  return fuori
}
