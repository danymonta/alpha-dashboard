import 'server-only'

import { tipoDelPost, type TipoPost } from '@/lib/marketing/abbinamento'
import { shortcodeInstagram } from '@/lib/marketing/shortcode'
import type { createClient } from '@/lib/supabase/server'

/**
 * The block «Post su Instagram» of a content (1.33.0): in the panel and on the
 * content's own page, read with the detail in the same request (spec D17),
 * with the session of whoever looks (RLS: the Marketing area). At most two
 * queries: the post of the content's URL, or the content's proposals and
 * their posts. Never throws: a read that fails is { stato: 'errore' } and the
 * rest of the panel stays.
 */

type ClientServer = Awaited<ReturnType<typeof createClient>>

export type PostInstagram = {
  /** the Instagram id: the reel's analysis and its speech are read by it (1.36.0) */
  media_id: string
  shortcode: string
  permalink: string
  tipo: TipoPost
  /** ISO 8601 */
  pubblicato_il: string
  /** the Rome day */
  giorno: string
  didascalia: string | null
  copertina_url: string | null
  /** no longer on Instagram (deleted or archived) */
  eliminato: boolean
}

export type PostDelContenuto =
  | { stato: 'collegato'; post: PostInstagram; daSolo: boolean; motivi: string[] }
  | { stato: 'proposte'; proposte: (PostInstagram & { motivi: string[] })[] }
  | { stato: 'nessuno' }
  | { stato: 'errore' }

/** At most this many proposals in the block. */
const PROPOSTE_MAX = 3

const COLONNE_POST = 'media_id, shortcode, permalink, media_type, reel, pubblicato_il, giorno, didascalia, copertina_url, eliminato_il'

type RigaPost = {
  media_id: string | null
  shortcode: string | null
  permalink: string | null
  media_type: string | null
  reel: boolean | null
  pubblicato_il: string | null
  giorno: string | null
  didascalia: string | null
  copertina_url: string | null
  eliminato_il: string | null
}

function versoPost(r: RigaPost): PostInstagram | null {
  if (!r.media_id || !r.shortcode || !r.permalink || !r.pubblicato_il || !r.giorno || !r.media_type) return null
  return {
    media_id: r.media_id,
    shortcode: r.shortcode,
    permalink: r.permalink,
    tipo: tipoDelPost({ media_type: r.media_type, reel: r.reel ?? false }),
    pubblicato_il: r.pubblicato_il,
    giorno: r.giorno,
    didascalia: r.didascalia,
    copertina_url: r.copertina_url,
    eliminato: r.eliminato_il !== null,
  }
}

export async function leggiPostDelContenuto(
  supabase: ClientServer,
  c: { id: string; url: string | null },
): Promise<PostDelContenuto> {
  try {
    const shortcode = shortcodeInstagram(c.url)
    if (shortcode) {
      const { data, error } = await supabase
        .from('v_instagram_post')
        .select(`${COLONNE_POST}, contenuto_id, collegato_da_solo, motivi_collegamento`)
        .eq('shortcode', shortcode)
        .maybeSingle()
      if (error) return { stato: 'errore' }
      // a URL typed by hand of a post the run has not read: the URL field says it all
      const post = data && data.contenuto_id === c.id ? versoPost(data) : null
      if (!post || !data) return { stato: 'nessuno' }
      return { stato: 'collegato', post, daSolo: data.collegato_da_solo === true, motivi: data.motivi_collegamento ?? [] }
    }

    const { data: proposte, error } = await supabase
      .from('v_marketing_proposte')
      .select('shortcode, motivi, punteggio')
      .eq('contenuto_id', c.id)
      .order('punteggio', { ascending: false })
      .order('shortcode')
      .limit(PROPOSTE_MAX)
    if (error) return { stato: 'errore' }
    const codici = (proposte ?? []).map((p) => p.shortcode).filter((s): s is string => Boolean(s))
    if (codici.length === 0) return { stato: 'nessuno' }

    const { data: post, error: errorePost } = await supabase.from('v_instagram_post').select(COLONNE_POST).in('shortcode', codici)
    if (errorePost) return { stato: 'errore' }
    const perCodice = new Map((post ?? []).map((r) => [r.shortcode, r]))
    const elenco = (proposte ?? []).flatMap((p) => {
      const riga = p.shortcode ? perCodice.get(p.shortcode) : undefined
      const letto = riga ? versoPost(riga) : null
      return letto && !letto.eliminato ? [{ ...letto, motivi: p.motivi ?? [] }] : []
    })
    return elenco.length > 0 ? { stato: 'proposte', proposte: elenco } : { stato: 'nessuno' }
  } catch {
    return { stato: 'errore' }
  }
}
