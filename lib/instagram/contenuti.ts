import 'server-only'

import {
  campoNonSupportato,
  creaRichiedente,
  ErroreInstagram,
  nonEsiste,
  numero,
  type Json,
  type OpzioniGraph,
} from '@/lib/instagram/richieste'
import { shortcodeInstagram } from '@/lib/marketing/shortcode'

/**
 * The posts and reels of the connected account (1.33.0, Dany: «i link devi
 * semplicemente prenderli dal mio profilo instagram»), read only and server
 * side with the token of the DM report, with the basic permission only
 * (instagram_business_basic): GET /me/media, most recent first. Never the
 * comments, the likers, the messages or the video itself.
 *
 * Meta documents caption and media_product_type as "Facebook Login only": on
 * the Instagram Login token they may be refused (code 100). The fields go
 * down in steps (LivelloCampi) and the step stays for the whole run, saved in
 * instagram_contenuti_stato.campi: without a caption no link is automatic.
 * What a step does not ask for is left out of the media (never null), so the
 * upsert never wipes a caption saved by an earlier run.
 *
 * Paging on the `after` cursor only when Meta says there is a next page
 * (paging.next carries the token: never followed nor kept). The pinned posts
 * (up to 3) sit on top whatever their date: the reading stops after 4 media
 * older than `dal` in a row. The Insight (1.35.0) reads the statistics of
 * the last 14 days (insights(), with the permission
 * instagram_business_manage_insights); the reel analysis (1.36.0) the rest.
 */

export type LivelloCampi = 'completi' | 'senza_tipo' | 'senza_didascalia' | 'minimi'

/** The fields asked for at each step; the last one is what any Instagram token gives. */
export const CAMPI_MEDIA: Record<LivelloCampi, string> = {
  completi:
    'id,shortcode,permalink,timestamp,media_type,media_product_type,caption,thumbnail_url,media_url,like_count,comments_count',
  senza_tipo: 'id,shortcode,permalink,timestamp,media_type,caption,thumbnail_url,media_url,like_count,comments_count',
  senza_didascalia: 'id,shortcode,permalink,timestamp,media_type,thumbnail_url,media_url,like_count,comments_count',
  // the shortcode comes from the permalink (R14)
  minimi: 'id,permalink,timestamp,media_type',
}

const GRADINI: readonly LivelloCampi[] = ['completi', 'senza_tipo', 'senza_didascalia', 'minimi']

/** Media per page (Meta does not document a maximum for this edge). */
const PAGINA_MEDIA = 50
/** The pinned posts (up to 3) are on top whatever their date: four older ones in a row end the reading. */
const VECCHI_DI_FILA = 4
/** A cursor that never ends: at most this many pages per reading. */
const PAGINE_MAX = 50
/** Instagram's own limit on a caption, in code points (the column's check). */
export const DIDASCALIA_MAX = 2200
const COPERTINA_MAX = 2000
const PERMALINK_MAX = 500

const TIPI_MEDIA = ['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'] as const
export type TipoMedia = (typeof TIPI_MEDIA)[number]
const TIPI_PRODOTTO = ['FEED', 'REELS', 'AD', 'STORY'] as const
export type TipoProdotto = (typeof TIPI_PRODOTTO)[number]

const RE_MEDIA_ID = /^[0-9]{1,30}$/
const RE_SHORTCODE = /^[A-Za-z0-9_-]{5,40}$/
/** The same rule as the table's check (instagram_contenuti_permalink). */
const RE_PERMALINK = /^https:\/\/(www\.)?instagram\.com\/\S+$/
const RE_REEL_NEL_LINK = /\/reels?\//

/**
 * The statistics of a post as the Insight asks for them (1.35.0, D28): one
 * request per post, from the richest set down (a single metric Meta does not
 * give for that post fails the whole request with code 100). The names are
 * the columns of instagram_contenuti.
 */
export const METRICHE_INSIGHTS = {
  REELS: ['views,reach,saved,shares,likes,comments,total_interactions', 'views,reach,saved,shares', 'reach,saved,shares'],
  FEED: ['views,reach,saved,shares', 'reach,saved,shares'],
} as const satisfies Record<'REELS' | 'FEED', readonly string[]>

export type MetricaInsights = 'views' | 'reach' | 'saved' | 'shares' | 'likes' | 'comments' | 'total_interactions'
const METRICHE: ReadonlySet<string> = new Set<MetricaInsights>([
  'views',
  'reach',
  'saved',
  'shares',
  'likes',
  'comments',
  'total_interactions',
])

/** instagram_contenuti.metriche_stato, as a reading leaves it (never 'da_leggere'). */
export type StatoMetriche = 'lette' | 'senza_permesso' | 'prima_della_conversione' | 'non_disponibili'

/**
 * The statistics read for one post: only the metrics Meta gave as a
 * non-negative integer (the columns' checks); a missing key was not read and
 * its column is never written.
 */
export type InsightsMedia = { stato: StatoMetriche; valori: Partial<Record<MetricaInsights, number>> }

/** Meta's subcode for a media posted before the account became professional: never any statistics. */
const SUBCODE_PRIMA_DELLA_CONVERSIONE = 2108006
/** Meta's permission errors: code 10 and the range 200-299. */
const permesso = (code: number | null) => code === 10 || (code !== null && code >= 200 && code <= 299)

/** One media as the run saves it. A key Meta was not asked for is absent, never null. */
export type MediaLetto = {
  media_id: string
  shortcode: string
  permalink: string
  /** ISO 8601 */
  pubblicato_il: string
  media_type: TipoMedia
  media_product_type?: TipoProdotto | null
  /** REELS, or a /reel/ permalink, or a video when the product type is not given */
  reel: boolean
  didascalia?: string | null
  /** thumbnail_url (video) or media_url (photo, carousel), from Instagram's CDN only; never a video's media_url */
  copertina_url: string | null
  like_count?: number | null
  comments_count?: number | null
}

export type ElencoContenuti = {
  media: MediaLetto[]
  /**
   * true only when the reading ended by itself (4 older in a row, or no next
   * page) without errors: only then the media missing from it are deleted
   */
  completo: boolean
  /** the step the reading ended on */
  campi: LivelloCampi
  /** media Meta gave that were not valid (counted, never logged) */
  scartati: number
  /** what stopped the reading halfway (the media read before it are there); null when nothing did */
  errore: ErroreInstagram | null
}

function testo(valore: unknown): string | null {
  return typeof valore === 'string' && valore !== '' ? valore : null
}

function intero(valore: unknown): number | null {
  const n = numero(valore)
  return n !== null && Number.isInteger(n) && n >= 0 && n <= 2_147_483_647 ? n : null
}

/** A cover from Instagram's CDN only (https, *.cdninstagram.com or *.fbcdn.net); null otherwise. */
export function copertinaValida(valore: unknown): string | null {
  const url = testo(valore)
  if (!url || url.length > COPERTINA_MAX || /\s/.test(url)) return null
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const daCdn = ['cdninstagram.com', 'fbcdn.net'].some((dominio) => host === dominio || host.endsWith(`.${dominio}`))
    return u.protocol === 'https:' && daCdn ? url : null
  } catch {
    return null
  }
}

/** A caption at most 2200 code points; an empty one is none. */
function didascaliaDa(valore: unknown): string | null {
  if (typeof valore !== 'string' || valore.trim() === '') return null
  const caratteri = [...valore]
  return caratteri.length > DIDASCALIA_MAX ? caratteri.slice(0, DIDASCALIA_MAX).join('') : valore
}

/** A media of Meta's answer, as the run saves it; null when it is not valid. */
export function leggiMedia(grezzo: unknown, livello: LivelloCampi): MediaLetto | null {
  if (!grezzo || typeof grezzo !== 'object') return null
  const j = grezzo as Json
  const id = typeof j.id === 'number' ? String(j.id) : testo(j.id)
  if (!id || !RE_MEDIA_ID.test(id)) return null

  const permalink = testo(j.permalink)
  if (!permalink || permalink.length > PERMALINK_MAX || !RE_PERMALINK.test(permalink)) return null

  // the field when Meta gives it, the permalink's otherwise; both and different: not trusted
  const dalLink = shortcodeInstagram(permalink)
  const dato = testo(j.shortcode)
  if (dato !== null && dalLink !== null && dato !== dalLink) return null
  const shortcode = dato ?? dalLink
  if (!shortcode || !RE_SHORTCODE.test(shortcode)) return null

  const quando = Date.parse(testo(j.timestamp) ?? '')
  if (!Number.isFinite(quando)) return null

  const mediaType = (TIPI_MEDIA as readonly string[]).includes(String(j.media_type)) ? (j.media_type as TipoMedia) : null
  if (!mediaType) return null

  const conTipo = livello === 'completi'
  const conDidascalia = livello === 'completi' || livello === 'senza_tipo'
  const conCopertina = livello !== 'minimi'

  const prodotto: TipoProdotto | null = conTipo
    ? (TIPI_PRODOTTO as readonly string[]).includes(String(j.media_product_type))
      ? (j.media_product_type as TipoProdotto)
      : null
    : null
  const reel =
    prodotto === 'REELS' || RE_REEL_NEL_LINK.test(permalink) || (prodotto === null && mediaType === 'VIDEO')

  const media: MediaLetto = {
    media_id: id,
    shortcode,
    permalink,
    pubblicato_il: new Date(quando).toISOString(),
    media_type: mediaType,
    reel,
    copertina_url: conCopertina
      ? copertinaValida(mediaType === 'VIDEO' ? j.thumbnail_url : j.media_url)
      : null,
  }
  if (conTipo) media.media_product_type = prodotto
  if (conDidascalia) media.didascalia = didascaliaDa(j.caption)
  if (conCopertina) {
    media.like_count = intero(j.like_count)
    media.comments_count = intero(j.comments_count)
  }
  return media
}

/** The metrics of an answer of /{media}/insights that were asked for, each a non-negative integer. */
function valoriInsights(j: Json, chieste: string): InsightsMedia['valori'] {
  const valori: InsightsMedia['valori'] = {}
  const nomi = new Set(chieste.split(','))
  const data = Array.isArray(j.data) ? (j.data as unknown[]) : []
  for (const voce of data) {
    if (!voce || typeof voce !== 'object') continue
    const v = voce as { name?: unknown; values?: unknown; total_value?: unknown }
    if (typeof v.name !== 'string' || !nomi.has(v.name) || !METRICHE.has(v.name)) continue
    const primo = Array.isArray(v.values) && v.values[0] && typeof v.values[0] === 'object' ? (v.values[0] as Json).value : undefined
    const totale = v.total_value && typeof v.total_value === 'object' ? (v.total_value as Json).value : undefined
    const n = intero(primo !== undefined ? primo : totale)
    if (n !== null) valori[v.name as MetricaInsights] = n
  }
  return valori
}

/**
 * A read-only client of the account's media. The step of the fields, and
 * whether the token may read the statistics, are remembered per client.
 */
export function creaGraphContenuti(op: OpzioniGraph) {
  const { richiesta, url } = creaRichiedente(op)
  const get = (percorso: string, parametri: Record<string, string | number | undefined | null> = {}) =>
    richiesta(url(percorso, parametri))

  let livello: LivelloCampi = 'completi'
  // false at the first refusal for the permission: no more statistics asked in the run
  let permessoInsights = true

  /** The account the token belongs to. */
  async function me(): Promise<{ username: string | null; id: string | null }> {
    const j = await get('/me', { fields: 'user_id,username' })
    return {
      username: typeof j.username === 'string' ? j.username : null,
      id: typeof j.user_id === 'string' || typeof j.user_id === 'number' ? String(j.user_id) : null,
    }
  }

  /**
   * The media published from `dal` on (and the pinned ones on top), most
   * recent first, at most `max` (the Insight asks for 50, the run 400).
   * Never throws an ErroreInstagram: a failure halfway ends the reading with
   * what was read and the error.
   */
  async function contenutiDal(dal: Date, max = 50): Promise<ElencoContenuti> {
    const limite = dal.getTime()
    const media: MediaLetto[] = []
    const visti = new Set<string>()
    let scartati = 0
    let vecchiDiFila = 0
    let cursore: string | null = null
    const fine = (completo: boolean, errore: ErroreInstagram | null = null): ElencoContenuti => ({
      media,
      completo,
      campi: livello,
      scartati,
      errore,
    })

    try {
      for (let pagina = 0; pagina < PAGINE_MAX; pagina++) {
        let j: Json
        try {
          j = await get('/me/media', { fields: CAMPI_MEDIA[livello], limit: PAGINA_MEDIA, after: cursore })
        } catch (e) {
          // code 100 on the fields: one step down, the same page again
          const sotto = GRADINI[GRADINI.indexOf(livello) + 1]
          if (campoNonSupportato(e) && sotto) {
            livello = sotto
            pagina--
            continue
          }
          throw e
        }

        const data = Array.isArray(j.data) ? (j.data as unknown[]) : []
        for (const grezzo of data) {
          const m = leggiMedia(grezzo, livello)
          if (!m) {
            scartati++
            continue
          }
          if (visti.has(m.media_id)) continue
          visti.add(m.media_id)
          media.push(m)
          if (Date.parse(m.pubblicato_il) < limite) {
            if (++vecchiDiFila >= VECCHI_DI_FILA) return fine(true)
          } else {
            vecchiDiFila = 0
          }
          if (media.length >= max) return fine(false)
        }

        const paging = (j.paging ?? {}) as { next?: unknown; cursors?: { after?: unknown } }
        // the cursor only: paging.next is a URL with the token in it. A short
        // page is not the end; the missing next is
        const prossimo = paging.next && typeof paging.cursors?.after === 'string' ? paging.cursors.after : null
        if (!prossimo) return fine(true)
        if (prossimo === cursore) return fine(false)
        cursore = prossimo
      }
      return fine(false)
    } catch (e) {
      if (!(e instanceof ErroreInstagram)) throw e
      return fine(false, e)
    }
  }

  /**
   * The statistics of one post (D28): the sets of METRICHE_INSIGHTS for a
   * reel or for the feed, from the richest down on code 100. A permission
   * refusal (code 10 or 200-299, or Meta saying so) ends the statistics for
   * the whole client: every later call answers 'senza_permesso' without a
   * request. Subcode 2108006: 'prima_della_conversione'. A post Meta refuses
   * in any other way: 'non_disponibili'. An empty `data` is no number read
   * (Meta's answer for data not there yet). The token (190), Meta's limits,
   * the network and the time throw, as in every reading.
   */
  async function insights(media: Pick<MediaLetto, 'media_id' | 'reel' | 'media_type'>): Promise<InsightsMedia> {
    const nessuno = (stato: StatoMetriche): InsightsMedia => ({ stato, valori: {} })
    if (!permessoInsights) return nessuno('senza_permesso')
    // the id goes into the path: digits only
    if (!RE_MEDIA_ID.test(media.media_id)) return nessuno('non_disponibili')
    for (const metriche of METRICHE_INSIGHTS[media.reel ? 'REELS' : 'FEED']) {
      // another post of the run may have found the permission missing meanwhile
      if (!permessoInsights) return nessuno('senza_permesso')
      let j: Json
      try {
        j = await get(`/${media.media_id}/insights`, { metric: metriche })
      } catch (e) {
        if (!(e instanceof ErroreInstagram) || e.tipo !== 'meta') throw e
        if (e.subcode === SUBCODE_PRIMA_DELLA_CONVERSIONE) return nessuno('prima_della_conversione')
        // before the permission words: "cannot be loaded due to missing permissions" is a post not there
        if (nonEsiste(e)) return nessuno('non_disponibili')
        if (permesso(e.code) || (e.code !== 100 && /permission/i.test(e.message))) {
          permessoInsights = false
          return nessuno('senza_permesso')
        }
        if (e.code === 100) continue
        return nessuno('non_disponibili')
      }
      return { stato: 'lette', valori: valoriInsights(j, metriche) }
    }
    return nessuno('non_disponibili')
  }

  return { me, contenutiDal, insights }
}

export type GraphContenuti = ReturnType<typeof creaGraphContenuti>
