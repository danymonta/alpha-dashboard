import 'server-only'

import type { ContenutoElenco } from '@/lib/marketing/elenco'
import { ORDINE_SEZIONI, type SezioneContenuto } from '@/lib/marketing/etichette'
import { improntaTesto } from '@/lib/marketing/impronta'
import { leggiContenuto } from '@/lib/marketing/letture'
import type { Db } from '@/lib/marketing/operazioni'
import { leggiPostDelContenuto, type PostDelContenuto } from '@/lib/marketing/post-del-contenuto'

export type DettaglioContenuto = {
  contenuto: ContenutoElenco & { notion_page_id: string | null }
  /** The sections as saved, null when empty. */
  testi: Record<SezioneContenuto, string | null>
  /** md5 of each section as shown: a section is saved only over the text the person started from. */
  impronte: Record<SezioneContenuto, string>
  /** The block «Post su Instagram» (1.33.0): read with the detail, in the same request (spec D17); never throws. */
  instagram: PostDelContenuto
  /** Born from an idea of Claude (1.36.0, «Aggiungi al calendario»): the reel it came from, for «Nato da un'idea di Claude». */
  idea: { media_id: string; analisi_id: string } | null
}

/**
 * One content, read through RLS with the session of whoever asks (never the
 * service role): the list page with ?contenuto, the content's own page and
 * the panel's GET (1.33.0) all read it here, so the three never differ; the
 * row itself comes from lib/marketing/letture.ts, as Claude's leggi_contenuto
 * reads it (1.34.0). Null for an id that is not one, a content that is not
 * there or that RLS hides; a read error throws (LetturaNonRiuscita).
 */
export async function leggiDettaglioContenuto(supabase: Db, id: string): Promise<DettaglioContenuto | null> {
  const data = await leggiContenuto(supabase, id)
  if (!data) return null

  const { messaggio, bozza, commenti, finale, ...contenuto } = data
  const testi: Record<SezioneContenuto, string | null> = { messaggio, bozza, commenti, finale }
  const impronte = Object.fromEntries(ORDINE_SEZIONI.map((s) => [s, improntaTesto(testi[s])])) as Record<
    SezioneContenuto,
    string
  >
  const instagram = await leggiPostDelContenuto(supabase, { id: contenuto.id, url: contenuto.url })
  return { contenuto, testi, impronte, instagram, idea: await leggiOrigineIdea(supabase, contenuto.id) }
}

/** The analysis a content was born from, when it was: two small reads, a failure is «none» (the card still shows). */
async function leggiOrigineIdea(supabase: Db, id: string): Promise<DettaglioContenuto['idea']> {
  try {
    const { data } = await supabase.from('marketing_contenuti').select('da_analisi').eq('id', id).maybeSingle()
    if (!data?.da_analisi) return null
    const { data: analisi } = await supabase.from('marketing_analisi').select('id, media_id').eq('id', data.da_analisi).maybeSingle()
    return analisi ? { media_id: analisi.media_id, analisi_id: analisi.id } : null
  } catch {
    return null
  }
}
