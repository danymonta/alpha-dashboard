import 'server-only'

import {
  campoNonSupportato,
  creaRichiedente,
  ErroreInstagram,
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
 * older than `dal` in a row. 1.35.0 (Insight) and 1.36.0 (reel statistics)
 * add their readings to this client.
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

/** A read-only client of the account's media. The step of the fields is remembered per client. */
export function creaGraphContenuti(op: OpzioniGraph) {
  const { richiesta, url } = creaRichiedente(op)
  const get = (percorso: string, parametri: Record<string, string | number | undefined | null> = {}) =>
    richiesta(url(percorso, parametri))

  let livello: LivelloCampi = 'completi'

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

  return { me, contenutiDal }
}

export type GraphContenuti = ReturnType<typeof creaGraphContenuti>
