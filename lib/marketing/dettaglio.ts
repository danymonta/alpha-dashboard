import 'server-only'

import { COLONNE_ELENCO, type ContenutoElenco } from '@/lib/marketing/elenco'
import { ORDINE_SEZIONI, type SezioneContenuto } from '@/lib/marketing/etichette'
import { improntaTesto } from '@/lib/marketing/impronta'
import { leggiPostDelContenuto, type PostDelContenuto } from '@/lib/marketing/post-del-contenuto'
import type { createClient } from '@/lib/supabase/server'

type ClientServer = Awaited<ReturnType<typeof createClient>>

/** A content with its four sections and Notion's page id: what the panel and the page show. */
export const COLONNE_DETTAGLIO = `${COLONNE_ELENCO}, messaggio, bozza, commenti, finale, notion_page_id`

export type DettaglioContenuto = {
  contenuto: ContenutoElenco & { notion_page_id: string | null }
  /** The sections as saved, null when empty. */
  testi: Record<SezioneContenuto, string | null>
  /** md5 of each section as shown: a section is saved only over the text the person started from. */
  impronte: Record<SezioneContenuto, string>
  /** The block «Post su Instagram» (1.33.0): read with the detail, in the same request (spec D17); never throws. */
  instagram: PostDelContenuto
}

/**
 * One content, read through RLS with the session of whoever asks (never the
 * service role): the list page with ?contenuto, the content's own page and
 * the panel's GET (1.33.0) all read it here, so the three never differ. Null
 * for a content that is not there or that RLS hides; a read error throws.
 */
export async function leggiDettaglioContenuto(supabase: ClientServer, id: string): Promise<DettaglioContenuto | null> {
  const { data, error } = await supabase.from('marketing_contenuti').select(COLONNE_DETTAGLIO).eq('id', id).maybeSingle()
  if (error) throw new Error('Impossibile caricare il contenuto')
  if (!data) return null

  const { messaggio, bozza, commenti, finale, ...contenuto } = data
  const testi: Record<SezioneContenuto, string | null> = { messaggio, bozza, commenti, finale }
  const impronte = Object.fromEntries(ORDINE_SEZIONI.map((s) => [s, improntaTesto(testi[s])])) as Record<
    SezioneContenuto,
    string
  >
  const instagram = await leggiPostDelContenuto(supabase, { id: contenuto.id, url: contenuto.url })
  return { contenuto, testi, impronte, instagram }
}
