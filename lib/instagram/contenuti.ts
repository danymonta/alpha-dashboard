import 'server-only'

import {
  campoNonSupportato,
  creaRichiedente,
  ErroreInstagram,
  hostDiLoopback,
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
 * older than `dal` in a row. The statistics (insights(), with the permission
 * instagram_business_manage_insights) are read by the Insight (1.35.0) for the
 * last 14 days and by the morning run (1.36.0) for the 180: one reader, one
 * writer (instagram_salva_metriche). The reel analysis (1.36.0) asks for the
 * video of a reel (video()), only to read it on the server.
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
 * The statistics of a post (1.35.0 D28, extended in 1.36.0): one request per
 * post, from the richest set down (a single metric Meta does not give for that
 * post fails the whole request with code 100). The steps per kind (a reel, or
 * the feed: photos and carousels): `completo` adds the watch time, the total
 * view time, the skip rate and the reposts for a reel, the follows and the
 * profile visits for the feed; the lower steps are the Insight's own.
 * Meta: follows and profile_visits only for FEED and STORY; reels_skip_rate,
 * ig_reels_avg_watch_time, ig_reels_video_view_total_time, views and
 * total_interactions are «in development» (they may change definition: the
 * date of the reading and the history are the guard).
 */
export type TipoMetriche = 'reel' | 'feed'
export type GradinoMetriche = 'completo' | 'base' | 'minimo' | 'solo_reach'

export const METRICHE: Record<TipoMetriche, readonly { gradino: GradinoMetriche; metriche: string }[]> = {
  reel: [
    {
      gradino: 'completo',
      metriche:
        'views,reach,saved,shares,likes,comments,total_interactions,reposts,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate',
    },
    { gradino: 'base', metriche: 'views,reach,saved,shares,likes,comments,total_interactions' },
    { gradino: 'minimo', metriche: 'views,reach,saved,shares' },
    { gradino: 'solo_reach', metriche: 'reach,saved,shares' },
  ],
  feed: [
    { gradino: 'completo', metriche: 'views,reach,saved,shares,follows,profile_visits' },
    { gradino: 'base', metriche: 'views,reach,saved,shares' },
    { gradino: 'solo_reach', metriche: 'reach,saved,shares' },
  ],
}

/** Meta's name of a metric → the column of instagram_contenuti. */
const COLONNA_METRICA: Record<string, ColonnaMetrica> = {
  views: 'views',
  reach: 'reach',
  saved: 'saved',
  shares: 'shares',
  likes: 'likes',
  comments: 'comments',
  total_interactions: 'total_interactions',
  reposts: 'reposts',
  follows: 'follows',
  profile_visits: 'profile_visits',
  ig_reels_avg_watch_time: 'avg_watch_ms',
  ig_reels_video_view_total_time: 'view_total_ms',
  reels_skip_rate: 'skip_rate',
}

export type ColonnaMetrica =
  | 'views'
  | 'reach'
  | 'saved'
  | 'shares'
  | 'likes'
  | 'comments'
  | 'total_interactions'
  | 'reposts'
  | 'follows'
  | 'profile_visits'
  | 'avg_watch_ms'
  | 'view_total_ms'
  | 'skip_rate'

/** instagram_contenuti.metriche_stato, as a reading leaves it (never 'da_leggere'). */
export type StatoMetriche = 'lette' | 'senza_permesso' | 'prima_della_conversione' | 'non_disponibili'

/**
 * The statistics read for one post: only the metrics Meta gave as a
 * non-negative number; a missing key was not read and its column is never
 * written (instagram_salva_metriche). `gradino` is the step that worked.
 */
export type MetricheLette = Partial<Record<ColonnaMetrica, number>>
export type InsightsMedia =
  | { stato: 'lette'; valori: MetricheLette; gradino: GradinoMetriche }
  | { stato: Exclude<StatoMetriche, 'lette'>; valori: Record<string, never> }

/** Meta's subcode for a media posted before the account became professional: never any statistics. */
const SUBCODE_PRIMA_DELLA_CONVERSIONE = 2108006
/** Meta's permission errors: code 10 and the range 200-299. */
const permesso = (code: number | null) => code === 10 || (code !== null && code >= 200 && code <= 299)
/** Code 10 also means «not enough viewers» (a story): about that post, not a missing permission. */
const POCHI_SPETTATORI = /not enough viewers/i

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
  /** only a VIDEO, only when media_url was asked for: false = Meta does not give it (licensed music) */
  video_disponibile?: boolean
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

/**
 * The origin of the fake Graph API of the end-to-end tests, when the client's
 * base is on http on a loopback host (baseGraph() only gives it so outside
 * production, with the dev login): the video and the cover of a reel come from
 * there in those tests. null for Meta's own base.
 */
export function origineLocale(base: string | undefined): string | null {
  if (!base) return null
  try {
    const u = new URL(base)
    return u.protocol === 'http:' && hostDiLoopback(u.hostname) ? u.origin : null
  } catch {
    return null
  }
}

/** A video or cover URL to read: Instagram's CDN over https, or (end-to-end tests only) the fake Graph API's own origin. */
export function urlDaLeggere(valore: unknown, locale: string | null = null): string | null {
  const cdn = copertinaValida(valore)
  if (cdn) return cdn
  const url = testo(valore)
  if (!locale || !url || url.length > COPERTINA_MAX || /\s/.test(url)) return null
  return url.startsWith(`${locale}/`) ? url : null
}

/** A caption at most 2200 code points; an empty one is none. */
function didascaliaDa(valore: unknown): string | null {
  if (typeof valore !== 'string' || valore.trim() === '') return null
  const caratteri = [...valore]
  return caratteri.length > DIDASCALIA_MAX ? caratteri.slice(0, DIDASCALIA_MAX).join('') : valore
}

/** A media of Meta's answer, as the run saves it; null when it is not valid. */
export function leggiMedia(grezzo: unknown, livello: LivelloCampi, locale: string | null = null): MediaLetto | null {
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
    // media_url is asked for at these steps; the video itself is never read here
    if (mediaType === 'VIDEO') media.video_disponibile = urlDaLeggere(j.media_url, locale) !== null
  }
  return media
}

/** The metrics of an answer of /{media}/insights that were asked for, each a non-negative finite number. */
function valoriInsights(j: Json, chieste: string): MetricheLette {
  const valori: MetricheLette = {}
  const nomi = new Set(chieste.split(','))
  const data = Array.isArray(j.data) ? (j.data as unknown[]) : []
  for (const voce of data) {
    if (!voce || typeof voce !== 'object') continue
    const v = voce as { name?: unknown; values?: unknown; total_value?: unknown }
    if (typeof v.name !== 'string' || !nomi.has(v.name)) continue
    const colonna = COLONNA_METRICA[v.name]
    if (!colonna) continue
    const primo = Array.isArray(v.values) && v.values[0] && typeof v.values[0] === 'object' ? (v.values[0] as Json).value : undefined
    const totale = v.total_value && typeof v.total_value === 'object' ? (v.total_value as Json).value : undefined
    const n = numero(primo !== undefined ? primo : totale)
    if (n === null || n < 0) continue
    // the watch times are milliseconds (to be checked against the app, step 5 of Dany); a skip rate may be a ratio or a percentage
    // (instagram_salva_metriche reads both); the others are counts
    if (colonna === 'skip_rate') valori[colonna] = n
    else if (n <= 2_147_483_647 || colonna === 'view_total_ms') valori[colonna] = Math.round(n)
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
  const locale = origineLocale(op.base)
  // false at the first refusal for the permission: no more statistics asked in the run
  let permessoInsights = true
  // the step each kind of post has settled on, and which kinds were seen
  const gradiniDelTipo: Record<TipoMetriche, number> = { reel: 0, feed: 0 }
  const visti: Record<TipoMetriche, boolean> = { reel: false, feed: false }

  /** The account the token belongs to, with its followers and media when Meta gives them (code 100: without). */
  async function me(): Promise<{ username: string | null; id: string | null; follower: number | null; media: number | null }> {
    let j: Json
    try {
      j = await get('/me', { fields: 'user_id,username,followers_count,media_count' })
    } catch (e) {
      if (!campoNonSupportato(e)) throw e
      j = await get('/me', { fields: 'user_id,username' })
    }
    return {
      username: typeof j.username === 'string' ? j.username : null,
      id: typeof j.user_id === 'string' || typeof j.user_id === 'number' ? String(j.user_id) : null,
      follower: intero(j.followers_count),
      media: intero(j.media_count),
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
          const m = leggiMedia(grezzo, livello, locale)
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
   * The statistics of one post: the steps of METRICHE for a reel or for the
   * feed, from the richest down on code 100. The step that worked stays for
   * the rest of the run only after the lowest one has worked on the same
   * post (a metric one post lacks must not take the others' numbers away);
   * `gradino` says the step. A permission refusal (code 10 or 200-299, or
   * Meta saying so) ends the statistics for the whole client: every later
   * call answers 'senza_permesso' without a request, except code 10 with «not
   * enough viewers» (a story): that is about the post, 'non_disponibili'.
   * Subcode 2108006: 'prima_della_conversione'. A post Meta refuses in any
   * other way: 'non_disponibili'. An empty `data`, or one with no number, is
   * no reading (Meta's answer for data not there yet, up to 48 hours: never
   * zeros). The token (190), Meta's limits, the network and the time throw,
   * as in every reading.
   */
  async function insights(media: Pick<MediaLetto, 'media_id' | 'reel' | 'media_type'>): Promise<InsightsMedia> {
    const nessuno = (stato: Exclude<StatoMetriche, 'lette'>): InsightsMedia => ({ stato, valori: {} })
    if (!permessoInsights) return nessuno('senza_permesso')
    // the id goes into the path: digits only
    if (!RE_MEDIA_ID.test(media.media_id)) return nessuno('non_disponibili')
    const tipo: TipoMetriche = media.reel ? 'reel' : 'feed'
    visti[tipo] = true
    const gradini = METRICHE[tipo]
    for (let i = gradiniDelTipo[tipo]; i < gradini.length; i++) {
      // another post of the run may have found the permission missing meanwhile
      if (!permessoInsights) return nessuno('senza_permesso')
      const { gradino, metriche } = gradini[i]
      let j: Json
      try {
        j = await get(`/${media.media_id}/insights`, { metric: metriche })
      } catch (e) {
        if (!(e instanceof ErroreInstagram) || e.tipo !== 'meta') throw e
        if (e.subcode === SUBCODE_PRIMA_DELLA_CONVERSIONE) return nessuno('prima_della_conversione')
        // before the permission words: "cannot be loaded due to missing permissions" is a post not there
        if (nonEsiste(e)) return nessuno('non_disponibili')
        // few viewers: code 10, but about this post
        if (e.code === 10 && POCHI_SPETTATORI.test(e.message)) return nessuno('non_disponibili')
        if (permesso(e.code) || (e.code !== 100 && /permission/i.test(e.message))) {
          permessoInsights = false
          return nessuno('senza_permesso')
        }
        if (e.code === 100) continue
        return nessuno('non_disponibili')
      }
      const valori = valoriInsights(j, metriche)
      if (Object.keys(valori).length === 0) return nessuno('non_disponibili')
      // the kind goes down for the rest of the run only once a lower step worked on this post
      if (i > gradiniDelTipo[tipo]) gradiniDelTipo[tipo] = i
      return { stato: 'lette', valori, gradino }
    }
    return nessuno('non_disponibili')
  }

  /** The steps the run has settled on, per kind: for instagram_contenuti_stato.metriche_gradini. */
  function gradiniUsati(): Partial<Record<TipoMetriche, GradinoMetriche>> {
    return {
      ...(visti.reel ? { reel: METRICHE.reel[gradiniDelTipo.reel].gradino } : {}),
      ...(visti.feed ? { feed: METRICHE.feed[gradiniDelTipo.feed].gradino } : {}),
    }
  }

  /**
   * What the reel analysis needs to read a video on the server: the video's
   * URL, its cover and the kind of audio. `media_audio_type` is asked first and
   * left out on code 100. URLs only from Instagram's CDN, never logged or
   * saved; a video without media_url (licensed music) answers url null.
   */
  async function video(
    mediaId: string,
  ): Promise<{ url: string | null; copertina: string | null; audio: 'MUSIC' | 'ORIGINAL_SOUND' | null }> {
    if (!RE_MEDIA_ID.test(mediaId)) return { url: null, copertina: null, audio: null }
    let j: Json
    try {
      j = await get(`/${mediaId}`, { fields: 'media_type,media_url,thumbnail_url,media_audio_type' })
    } catch (e) {
      if (!campoNonSupportato(e)) throw e
      j = await get(`/${mediaId}`, { fields: 'media_type,media_url,thumbnail_url' })
    }
    const audio = j.media_audio_type === 'MUSIC' || j.media_audio_type === 'ORIGINAL_SOUND' ? j.media_audio_type : null
    return { url: urlDaLeggere(j.media_url, locale), copertina: urlDaLeggere(j.thumbnail_url, locale), audio }
  }

  return { me, contenutiDal, insights, gradiniUsati, video }
}

export type GraphContenuti = ReturnType<typeof creaGraphContenuti>
