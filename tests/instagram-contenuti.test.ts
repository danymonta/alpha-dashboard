import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { CAMPI_MEDIA, copertinaValida, creaGraphContenuti, leggiMedia, METRICHE } from '@/lib/instagram/contenuti'
import { API_BASE, baseGraph, CODICI_LIMITE, ErroreInstagram, SEGNO_TOKEN_FINTO } from '@/lib/instagram/richieste'

// A fake Graph API for /me and /me/media. Every account, post and caption is invented.
const TOKEN = `IGAAprova${'x'.repeat(40)}`
const ACCOUNT = { user_id: '17841400000000001', username: '_alpha_prova' }
const CDN = 'https://scontent-fra3-1.cdninstagram.com/v/t51/copertina.jpg?oe=6720AB12'

type MediaFinto = {
  id: string
  shortcode?: string
  permalink: string
  timestamp: string
  media_type: string
  media_product_type?: string
  caption?: string
  thumbnail_url?: string
  media_url?: string
  like_count?: number
  comments_count?: number
}

type Stato = {
  tokenValido: string
  media: MediaFinto[]
  perPagina: number
  /** asking for any of these fields answers code 100, as Meta does for the "Facebook Login only" ones */
  campiRifiutati: string[]
  /** the next responses: these errors, one each */
  guasti: { status: number; code?: number; message?: string }[]
  /** without a shortcode in any answer (it comes from the permalink) */
  senzaShortcode: boolean
  /** the page after this cursor always answers 80002 */
  limiteDopo: string | null
  /** asking /{media}/insights for any of these metrics answers code 100, as Meta does for a metric a post has not */
  metricheNonDate: string[]
  /** every /{media}/insights answers this error */
  erroreInsights: { status: number; code: number; subcode?: number; message: string } | null
  /** the values of /{media}/insights by metric, when not the default ones */
  valoriInsights: Record<string, unknown> | null
  richieste: URL[]
}

let stato: Stato
let server: Server
let base = ''

function giorno(n: number): string {
  // n days before 09/10/2026 18:00 UTC
  return new Date(Date.UTC(2026, 9, 9, 18) - n * 86_400_000).toISOString().replace('.000Z', '+0000')
}

function reel(n: number, extra: Partial<MediaFinto> = {}): MediaFinto {
  const codice = `Reel${String(n).padStart(4, '0')}x`
  return {
    id: `1790000000${String(n).padStart(7, '0')}`,
    shortcode: codice,
    permalink: `https://www.instagram.com/reel/${codice}/`,
    timestamp: giorno(n),
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    caption: `Didascalia del reel ${n}`,
    thumbnail_url: CDN,
    media_url: 'https://scontent.cdninstagram.com/video.mp4',
    like_count: 10 + n,
    comments_count: n,
    ...extra,
  }
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', base)
    stato.richieste.push(u)
    rispondi(u, res)
  })
  await new Promise<void>((pronto) => server.listen(0, '127.0.0.1', () => pronto()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((chiuso) => server.close(() => chiuso())))

function rispondi(u: URL, res: ServerResponse) {
  const manda = (corpo: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(corpo))
  }
  const errore = (code: number, message: string, status = 400) => manda({ error: { message, code } }, status)

  const guasto = stato.guasti.shift()
  if (guasto) return guasto.code ? errore(guasto.code, guasto.message ?? 'temporaneo', guasto.status) : manda({}, guasto.status)
  if (u.searchParams.get('access_token') !== stato.tokenValido) return errore(190, 'Invalid OAuth access token')

  const percorso = u.pathname.replace(/^\/v[\d.]+/, '')
  const campi = (u.searchParams.get('fields') ?? '').split(',')
  if (percorso === '/me') {
    const risposta: Record<string, unknown> = { ...ACCOUNT, id: 'app1' }
    if (campi.includes('followers_count')) {
      if (stato.campiRifiutati.includes('followers_count')) return errore(100, 'Tried accessing nonexisting field (followers_count) on node type (IGUser)')
      Object.assign(risposta, { followers_count: 12345, media_count: 230 })
    }
    return manda(risposta)
  }
  const unico = /^\/(\d+)$/.exec(percorso)
  if (unico) {
    const m = stato.media.find((x) => x.id === unico[1])
    if (!m) return errore(100, 'Unsupported get request. Object with ID does not exist, cannot be loaded due to missing permissions')
    if (campi.includes('media_audio_type') && stato.campiRifiutati.includes('media_audio_type')) {
      return errore(100, 'Tried accessing nonexisting field (media_audio_type) on node type (Media)')
    }
    return manda({
      id: m.id,
      media_type: m.media_type,
      media_url: m.media_url,
      thumbnail_url: m.thumbnail_url,
      ...(campi.includes('media_audio_type') ? { media_audio_type: 'ORIGINAL_SOUND' } : {}),
    })
  }
  const insights = /^\/(\d+)\/insights$/.exec(percorso)
  if (insights && stato.media.some((m) => m.id === insights[1])) {
    const e = stato.erroreInsights
    if (e) return manda({ error: { message: e.message, code: e.code, ...(e.subcode ? { error_subcode: e.subcode } : {}) } }, e.status)
    const metriche = (u.searchParams.get('metric') ?? '').split(',')
    const nonData = metriche.find((m) => stato.metricheNonDate.includes(m))
    if (nonData) return errore(100, `(#100) The Media Insights API does not support the ${nonData} metric for this media`)
    const n = Number(insights[1].slice(-2))
    const valori: Record<string, unknown> = stato.valoriInsights ?? {
      views: 1000 * n,
      reach: 800 * n,
      saved: 10 * n,
      shares: 5 * n,
      likes: 20 * n,
      comments: n,
      total_interactions: 36 * n,
      reposts: 2 * n,
      ig_reels_avg_watch_time: 9800 + n,
      ig_reels_video_view_total_time: 4_000_000 * n,
      reels_skip_rate: 38.5,
      follows: n,
      profile_visits: 3 * n,
    }
    // the values set by a test come all, asked or not (a metric Meta adds on its own)
    const nomi = stato.valoriInsights ? Object.keys(stato.valoriInsights) : metriche.filter((nome) => nome in valori)
    return manda({
      data: nomi
        // Meta gives some metrics as values[0] and others as total_value
        .map((nome, i) =>
          i % 2 === 0
            ? { name: nome, period: 'lifetime', values: [{ value: valori[nome] }], id: `${insights[1]}/insights/${nome}/lifetime` }
            : { name: nome, period: 'lifetime', total_value: { value: valori[nome] }, id: `${insights[1]}/insights/${nome}/lifetime` },
        ),
    })
  }
  if (percorso === '/me/media') {
    if (stato.limiteDopo !== null && u.searchParams.get('after') === stato.limiteDopo) {
      return errore(80002, 'There have been too many calls to this Instagram account')
    }
    const rifiutato = campi.find((c) => stato.campiRifiutati.includes(c))
    if (rifiutato) return errore(100, `Tried accessing nonexisting field (${rifiutato}) on node type (Media)`)
    const dopo = Number(u.searchParams.get('after') ?? 0)
    const pagina = stato.media.slice(dopo, dopo + stato.perPagina).map((m) => {
      const visibile: Record<string, unknown> = {}
      for (const c of campi) {
        if (c === 'shortcode' && stato.senzaShortcode) continue
        if (c in m) visibile[c] = m[c as keyof MediaFinto]
      }
      return visibile
    })
    const altre = dopo + stato.perPagina < stato.media.length
    return manda({
      data: pagina,
      paging: {
        cursors: { before: String(dopo), after: String(dopo + stato.perPagina) },
        // a next URL with the token in it, as Meta writes it: never followed
        ...(altre ? { next: `${base}/SEGUITO-NEXT?access_token=${stato.tokenValido}` } : {}),
      },
    })
  }
  errore(100, 'Unsupported get request. Object does not exist', 404)
}

let log: string[] = []

beforeEach(() => {
  stato = {
    tokenValido: TOKEN,
    media: [1, 2, 3, 4, 5].map((n) => reel(n)),
    perPagina: 2,
    campiRifiutati: [],
    guasti: [],
    senzaShortcode: false,
    limiteDopo: null,
    metricheNonDate: [],
    erroreInsights: null,
    valoriInsights: null,
    richieste: [],
  }
  log = []
  for (const livello of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, livello).mockImplementation((...args: unknown[]) => void log.push(JSON.stringify(args)))
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const subito = async () => {}
const graph = (extra: Partial<Parameters<typeof creaGraphContenuti>[0]> = {}) =>
  creaGraphContenuti({ token: TOKEN, base, attendi: subito, ...extra })
const DAL = new Date('2026-04-12T00:00:00Z')
const richiesteMedia = () => stato.richieste.filter((r) => r.pathname.endsWith('/me/media'))

describe('l’account e l’elenco dei post', () => {
  it('me: username e id', async () => {
    expect(await graph().me()).toEqual({ username: ACCOUNT.username, id: ACCOUNT.user_id, follower: 12345, media: 230 })
  })

  it('tutte le pagine col solo cursore: next mai seguito, una pagina corta non è la fine', async () => {
    stato.perPagina = 2
    const elenco = await graph().contenutiDal(DAL, 400)
    expect(elenco.completo).toBe(true)
    expect(elenco.errore).toBeNull()
    expect(elenco.campi).toBe('completi')
    expect(elenco.media.map((m) => m.shortcode)).toEqual(['Reel0001x', 'Reel0002x', 'Reel0003x', 'Reel0004x', 'Reel0005x'])
    expect(richiesteMedia().map((r) => r.searchParams.get('after'))).toEqual([null, '2', '4'])
    expect(richiesteMedia().every((r) => r.searchParams.get('limit') === '50')).toBe(true)
    expect(stato.richieste.some((r) => r.pathname.includes('SEGUITO-NEXT'))).toBe(false)
    expect(stato.richieste.every((r) => r.pathname.startsWith('/v26.0/'))).toBe(true)
  })

  it('un post letto: tutte le colonne, la copertina del video dalla CDN, mai il suo media_url', async () => {
    const [primo] = (await graph().contenutiDal(DAL, 1)).media
    expect(primo).toEqual({
      media_id: '17900000000000001',
      shortcode: 'Reel0001x',
      permalink: 'https://www.instagram.com/reel/Reel0001x/',
      pubblicato_il: '2026-10-08T18:00:00.000Z',
      media_type: 'VIDEO',
      media_product_type: 'REELS',
      reel: true,
      didascalia: 'Didascalia del reel 1',
      copertina_url: CDN,
      like_count: 11,
      comments_count: 1,
      // media_url is asked for to know whether Instagram gives the video (1.36.0); it is never kept
      video_disponibile: true,
    })
    expect(JSON.stringify(primo)).not.toContain('video.mp4')
  })

  it('a max media si ferma e la lettura non è completa', async () => {
    const elenco = await graph().contenutiDal(DAL, 3)
    expect(elenco.media).toHaveLength(3)
    expect(elenco.completo).toBe(false)
    expect(richiesteMedia()).toHaveLength(2)
  })

  it('si ferma dopo 4 post più vecchi di fila, con 3 fissati in cima', async () => {
    stato.perPagina = 50
    stato.media = [
      // pinned on top, a year old
      reel(400),
      reel(390),
      reel(380),
      reel(1),
      reel(2),
      reel(200),
      reel(201),
      reel(202),
      reel(203),
      reel(204),
      reel(205),
    ]
    const elenco = await graph().contenutiDal(DAL, 400)
    expect(elenco.completo).toBe(true)
    // the three pinned, the two recent, then four old ones in a row
    expect(elenco.media.map((m) => m.shortcode)).toEqual([
      'Reel0400x',
      'Reel0390x',
      'Reel0380x',
      'Reel0001x',
      'Reel0002x',
      'Reel0200x',
      'Reel0201x',
      'Reel0202x',
      'Reel0203x',
    ])
  })
})

describe('i campi a gradini (codice 100)', () => {
  it('senza media_product_type: un gradino sotto, la stessa pagina di nuovo, il tipo assente', async () => {
    stato.campiRifiutati = ['media_product_type']
    const elenco = await graph().contenutiDal(DAL, 400)
    expect(elenco.campi).toBe('senza_tipo')
    expect(elenco.completo).toBe(true)
    expect(elenco.media).toHaveLength(5)
    expect(elenco.media[0]).not.toHaveProperty('media_product_type')
    expect(elenco.media[0]).toMatchObject({ reel: true, didascalia: 'Didascalia del reel 1' })
    expect(richiesteMedia().map((r) => r.searchParams.get('after'))).toEqual([null, null, '2', '4'])
  })

  it('senza didascalia: la chiave resta assente, mai null (l’upsert non cancella quella salvata)', async () => {
    stato.campiRifiutati = ['media_product_type', 'caption']
    const elenco = await graph().contenutiDal(DAL, 400)
    expect(elenco.campi).toBe('senza_didascalia')
    expect(elenco.media[0]).not.toHaveProperty('didascalia')
    expect(elenco.media[0]).toMatchObject({ copertina_url: CDN, like_count: 11 })
  })

  it('minimi senza shortcode: lo shortcode viene dal permalink', async () => {
    stato.campiRifiutati = ['media_product_type', 'caption', 'thumbnail_url']
    stato.senzaShortcode = true
    const elenco = await graph().contenutiDal(DAL, 400)
    expect(elenco.campi).toBe('minimi')
    expect(CAMPI_MEDIA.minimi).toBe('id,permalink,timestamp,media_type')
    expect(elenco.media[0]).toEqual({
      media_id: '17900000000000001',
      shortcode: 'Reel0001x',
      permalink: 'https://www.instagram.com/reel/Reel0001x/',
      pubblicato_il: '2026-10-08T18:00:00.000Z',
      media_type: 'VIDEO',
      reel: true,
      copertina_url: null,
    })
  })

  it('un 100 anche sui minimi: errore di Meta, la lettura si ferma', async () => {
    stato.campiRifiutati = ['media_product_type', 'caption', 'thumbnail_url', 'permalink']
    const elenco = await graph().contenutiDal(DAL, 400)
    expect(elenco.media).toEqual([])
    expect(elenco.completo).toBe(false)
    expect(elenco.errore).toBeInstanceOf(ErroreInstagram)
    expect(elenco.errore?.tipo).toBe('meta')
  })

  it('un 100 «does not exist» non è un campo: niente gradino', async () => {
    stato.guasti = [{ status: 400, code: 100, message: 'Object does not exist, cannot be loaded due to missing permissions' }]
    const elenco = await graph().contenutiDal(DAL, 400)
    expect(elenco.campi).toBe('completi')
    expect(elenco.errore?.tipo).toBe('meta')
    expect(richiesteMedia()).toHaveLength(1)
  })
})

describe('post non validi', () => {
  it('si scartano e si contano: id, permalink, data, tipo, shortcode diverso dal permalink', async () => {
    stato.perPagina = 50
    stato.media = [
      reel(1),
      reel(2, { id: 'abc' }),
      reel(3, { permalink: 'https://example.com/reel/Reel0003x/' }),
      reel(4, { timestamp: 'ieri' }),
      reel(5, { media_type: 'STORY_VIDEO' }),
      reel(6, { shortcode: 'AltroCodice' }),
      reel(7),
    ]
    const elenco = await graph().contenutiDal(DAL, 400)
    expect(elenco.media.map((m) => m.shortcode)).toEqual(['Reel0001x', 'Reel0007x'])
    expect(elenco.scartati).toBe(5)
    // never the media itself in a log
    expect(log.join('\n')).not.toContain('Reel000')
  })

  it('copertine solo https dalla CDN di Instagram', () => {
    expect(copertinaValida(CDN)).toBe(CDN)
    expect(copertinaValida('https://scontent.xx.fbcdn.net/v/foto.jpg')).toBe('https://scontent.xx.fbcdn.net/v/foto.jpg')
    expect(copertinaValida('http://scontent.cdninstagram.com/foto.jpg')).toBeNull()
    expect(copertinaValida('https://evilcdninstagram.com/foto.jpg')).toBeNull()
    expect(copertinaValida('https://cdninstagram.com.evil.it/foto.jpg')).toBeNull()
    expect(copertinaValida(`https://scontent.cdninstagram.com/${'a'.repeat(2000)}`)).toBeNull()
    expect(copertinaValida(null)).toBeNull()
  })

  it('una foto o un carosello: la copertina è il media_url; tipi fuori elenco a null; didascalia a 2200', () => {
    const foto = leggiMedia(
      {
        id: '1',
        shortcode: 'FotoProva1',
        permalink: 'https://www.instagram.com/p/FotoProva1/',
        timestamp: '2026-10-03T16:30:00+0000',
        media_type: 'IMAGE',
        media_product_type: 'IGTV',
        caption: 'é'.repeat(2500),
        media_url: CDN,
      },
      'completi',
    )
    expect(foto).toMatchObject({ media_type: 'IMAGE', media_product_type: null, reel: false, copertina_url: CDN })
    expect([...(foto?.didascalia ?? '')].length).toBe(2200)
    // a /reel/ permalink is a reel even without the product type
    const video = leggiMedia(
      { id: '2', permalink: 'https://www.instagram.com/reel/VideoProva1/', timestamp: '2026-10-03T16:30:00+0000', media_type: 'VIDEO' },
      'senza_tipo',
    )
    expect(video?.reel).toBe(true)
    const feed = leggiMedia(
      {
        id: '3',
        permalink: 'https://www.instagram.com/p/VideoProva2/',
        timestamp: '2026-10-03T16:30:00+0000',
        media_type: 'VIDEO',
        media_product_type: 'FEED',
      },
      'completi',
    )
    expect(feed?.reel).toBe(false)
  })
})

describe('errori di Meta', () => {
  it('80002 (Business Use Case) è un limite: si riprova', async () => {
    expect(CODICI_LIMITE.has(80002)).toBe(true)
    stato.guasti = [{ status: 400, code: 80002, message: 'too many calls' }]
    const elenco = await graph().contenutiDal(DAL, 400)
    expect(elenco.errore).toBeNull()
    expect(elenco.media).toHaveLength(5)
  })

  it('80002 che resta: errore limite con quello già letto', async () => {
    stato.limiteDopo = '2'
    const elenco = await graph().contenutiDal(DAL, 400)
    expect(elenco.errore?.tipo).toBe('limite')
    expect(elenco.completo).toBe(false)
    expect(elenco.media.map((m) => m.shortcode)).toEqual(['Reel0001x', 'Reel0002x'])
    // the first try and two retries
    expect(richiesteMedia().filter((r) => r.searchParams.get('after') === '2')).toHaveLength(3)
  })

  it('190: errore token, e il token mai in un errore né in un log', async () => {
    stato.tokenValido = 'un-altro-token'
    const g = graph()
    await expect(g.me()).rejects.toMatchObject({ tipo: 'token', code: 190 })
    const elenco = await g.contenutiDal(DAL, 400)
    expect(elenco.errore?.tipo).toBe('token')
    expect(elenco.errore?.message).not.toContain(TOKEN)
    expect(JSON.stringify(elenco) + log.join('\n')).not.toContain(TOKEN)
  })

  it('il tempo finito: errore tempo, nessuna richiesta parte', async () => {
    const elenco = await graph({ entro: Date.now() - 1 }).contenutiDal(DAL, 400)
    expect(elenco.errore?.tipo).toBe('tempo')
    expect(richiesteMedia()).toHaveLength(0)
  })
})

describe('le statistiche dei post (Insight D28, esteso dalla 1.36.0)', () => {
  const REEL = { media_id: '17900000000000002', reel: true, media_type: 'VIDEO' as const }
  const FOTO = { media_id: '17900000000000003', reel: false, media_type: 'IMAGE' as const }
  const richiesteInsights = () => stato.richieste.filter((r) => r.pathname.endsWith('/insights'))
  const metricheChieste = () => richiesteInsights().map((r) => r.searchParams.get('metric'))
  const reelMetriche = METRICHE.reel.map((g) => g.metriche)
  const feedMetriche = METRICHE.feed.map((g) => g.metriche)

  it('un reel: il gradino completo in una richiesta, da values o da total_value, col tempo di visione e lo skip rate', async () => {
    expect(await graph().insights(REEL)).toEqual({
      stato: 'lette',
      gradino: 'completo',
      valori: {
        views: 2000,
        reach: 1600,
        saved: 20,
        shares: 10,
        likes: 40,
        comments: 2,
        total_interactions: 72,
        reposts: 4,
        avg_watch_ms: 9802,
        view_total_ms: 8_000_000,
        skip_rate: 38.5,
      },
    })
    expect(metricheChieste()).toEqual([reelMetriche[0]])
    const [r] = richiesteInsights()
    expect(r.pathname).toBe('/v26.0/17900000000000002/insights')
    expect(r.searchParams.get('fields')).toBeNull()
  })

  it('i gradini del reel: i tre più bassi sono quelli dell’Insight; il codice 100 passa a quello dopo, dopo l’ultimo non_disponibili', async () => {
    expect(reelMetriche).toEqual([
      'views,reach,saved,shares,likes,comments,total_interactions,reposts,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate',
      'views,reach,saved,shares,likes,comments,total_interactions',
      'views,reach,saved,shares',
      'reach,saved,shares',
    ])
    stato.metricheNonDate = ['reels_skip_rate']
    const base = await graph().insights(REEL)
    expect(base).toMatchObject({ stato: 'lette', gradino: 'base' })
    expect(base.valori).toEqual({ views: 2000, reach: 1600, saved: 20, shares: 10, likes: 40, comments: 2, total_interactions: 72 })
    expect(metricheChieste()).toEqual(reelMetriche.slice(0, 2))

    stato.richieste = []
    stato.metricheNonDate = ['likes']
    expect(await graph().insights(REEL)).toEqual({ stato: 'lette', gradino: 'minimo', valori: { views: 2000, reach: 1600, saved: 20, shares: 10 } })
    expect(metricheChieste()).toEqual(reelMetriche.slice(0, 3))

    stato.richieste = []
    stato.metricheNonDate = ['views']
    expect(await graph().insights(REEL)).toEqual({ stato: 'lette', gradino: 'solo_reach', valori: { reach: 1600, saved: 20, shares: 10 } })
    expect(metricheChieste()).toEqual(reelMetriche)

    stato.richieste = []
    stato.metricheNonDate = ['reach']
    expect(await graph().insights(REEL)).toEqual({ stato: 'non_disponibili', valori: {} })
    expect(metricheChieste()).toEqual(reelMetriche)
  })

  it('un post del feed: i suoi gradini, con i follow e le visite al profilo', async () => {
    expect(feedMetriche).toEqual(['views,reach,saved,shares,follows,profile_visits', 'views,reach,saved,shares', 'reach,saved,shares'])
    expect(await graph().insights(FOTO)).toEqual({
      stato: 'lette',
      gradino: 'completo',
      valori: { views: 3000, reach: 2400, saved: 30, shares: 15, follows: 3, profile_visits: 9 },
    })
    stato.richieste = []
    stato.metricheNonDate = ['follows']
    expect(await graph().insights(FOTO)).toEqual({ stato: 'lette', gradino: 'base', valori: { views: 3000, reach: 2400, saved: 30, shares: 15 } })
    stato.richieste = []
    stato.metricheNonDate = ['views']
    expect(await graph().insights(FOTO)).toEqual({ stato: 'lette', gradino: 'solo_reach', valori: { reach: 2400, saved: 30, shares: 15 } })
    expect(metricheChieste()).toEqual(feedMetriche)
    stato.richieste = []
    stato.metricheNonDate = ['saved']
    expect(await graph().insights(FOTO)).toEqual({ stato: 'non_disponibili', valori: {} })
    expect(metricheChieste()).toHaveLength(3)
  })

  it('il gradino scende per tutta la corsa solo dopo che uno più basso è riuscito sullo stesso post', async () => {
    const g = graph()
    // a post that gives nothing at any step: the next one starts from the richest again
    stato.metricheNonDate = ['reach']
    expect((await g.insights(REEL)).stato).toBe('non_disponibili')
    stato.richieste = []
    stato.metricheNonDate = []
    expect((await g.insights(REEL)).stato).toBe('lette')
    expect(metricheChieste()).toEqual([reelMetriche[0]])
    // a post that works at the base step: the next ones start there
    stato.richieste = []
    stato.metricheNonDate = ['reposts']
    expect(await g.insights(REEL)).toMatchObject({ gradino: 'base' })
    stato.richieste = []
    stato.metricheNonDate = []
    expect(await g.insights(REEL)).toMatchObject({ gradino: 'base' })
    expect(metricheChieste()).toEqual([reelMetriche[1]])
    expect(g.gradiniUsati()).toEqual({ reel: 'base' })
    // the feed keeps its own
    expect(await g.insights(FOTO)).toMatchObject({ gradino: 'completo' })
    expect(g.gradiniUsati()).toEqual({ reel: 'base', feed: 'completo' })
  })

  it('codice 10 o 200: senza_permesso, e nessuna altra richiesta di statistiche per tutta la corsa', async () => {
    for (const code of [10, 200]) {
      stato.richieste = []
      stato.erroreInsights = { status: 403, code, message: `(#${code}) Application does not have permission for this action` }
      const g = graph()
      expect(await g.insights(REEL)).toEqual({ stato: 'senza_permesso', valori: {} })
      expect(await g.insights(FOTO)).toEqual({ stato: 'senza_permesso', valori: {} })
      expect(richiesteInsights()).toHaveLength(1)
      // the listing still reads
      expect((await g.contenutiDal(DAL, 400)).media).toHaveLength(5)
    }
    // Meta saying it in words, with another code
    stato.richieste = []
    stato.erroreInsights = { status: 400, code: 3, message: 'Application does not have the permission to read insights' }
    const g = graph()
    expect((await g.insights(REEL)).stato).toBe('senza_permesso')
    expect((await g.insights(FOTO)).stato).toBe('senza_permesso')
    expect(richiesteInsights()).toHaveLength(1)
  })

  it('codice 10 con «Not enough viewers»: non_disponibili, il permesso c’è e le altre richieste partono', async () => {
    stato.erroreInsights = { status: 400, code: 10, message: '(#10) Not enough viewers for the media to show insights' }
    const g = graph()
    expect(await g.insights(REEL)).toEqual({ stato: 'non_disponibili', valori: {} })
    stato.erroreInsights = null
    expect((await g.insights(FOTO)).stato).toBe('lette')
  })

  it('subcode 2108006: prima_della_conversione, solo per quel post', async () => {
    stato.erroreInsights = { status: 400, code: 100, subcode: 2108006, message: 'Media posted before business account conversion' }
    const g = graph()
    expect(await g.insights(REEL)).toEqual({ stato: 'prima_della_conversione', valori: {} })
    expect(richiesteInsights()).toHaveLength(1)
    stato.erroreInsights = null
    expect((await g.insights(FOTO)).stato).toBe('lette')
  })

  it('un post che non c’è più o un id fuori forma: non_disponibili, senza scendere di gradino', async () => {
    const g = graph()
    expect(await g.insights({ ...REEL, media_id: '17900000000000099' })).toEqual({ stato: 'non_disponibili', valori: {} })
    expect(richiesteInsights()).toHaveLength(1)
    stato.richieste = []
    expect(await g.insights({ ...REEL, media_id: '../me' })).toEqual({ stato: 'non_disponibili', valori: {} })
    expect(stato.richieste).toHaveLength(0)
    // and the next post reads as always
    expect((await g.insights(REEL)).stato).toBe('lette')
  })

  it('190 lancia token; i limiti si riprovano e poi lanciano limite', async () => {
    stato.tokenValido = 'un-altro-token'
    const errore = await graph().insights(REEL).catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(ErroreInstagram)
    expect(errore).toMatchObject({ tipo: 'token', code: 190 })
    expect((errore as Error).message).not.toContain(TOKEN)

    stato.tokenValido = TOKEN
    stato.guasti = [{ status: 400, code: 4 }]
    expect((await graph().insights(REEL)).stato).toBe('lette')
    stato.guasti = [{ status: 400, code: 80002 }, { status: 400, code: 80002 }, { status: 400, code: 80002 }]
    await expect(graph().insights(REEL)).rejects.toMatchObject({ tipo: 'limite' })
  })

  it('data vuoto o senza nessun numero: non_disponibili, mai zeri', async () => {
    stato.valoriInsights = {}
    expect(await graph().insights(REEL)).toEqual({ stato: 'non_disponibili', valori: {} })
    stato.valoriInsights = { views: null, reach: 'tanti' }
    expect(await graph().insights(REEL)).toEqual({ stato: 'non_disponibili', valori: {} })
  })

  it('solo numeri non negativi, solo le metriche chieste e che conosciamo', async () => {
    stato.valoriInsights = { views: -5, reach: 12.4, saved: '30', shares: 7, likes: null, comments: 0, total_interactions: Number.MAX_SAFE_INTEGER * 2 }
    const letti = await graph().insights(REEL)
    expect(letti.stato).toBe('lette')
    expect(letti.valori).toEqual({ reach: 12, shares: 7, comments: 0 })
    // a metric Meta adds without being asked, or one we do not know, never becomes a column
    stato.valoriInsights = { views: 1, reach: 2, saved: 3, shares: 4, impressions: 9, plays: 4 }
    stato.metricheNonDate = ['likes']
    expect((await graph().insights(REEL)).valori).toEqual({ views: 1, reach: 2, saved: 3, shares: 4 })
  })

  it('il tempo totale di visione passa i 2 miliardi di millisecondi: resta un numero', async () => {
    stato.valoriInsights = { views: 5, reach: 4, ig_reels_video_view_total_time: 9_000_000_000 }
    expect((await graph().insights(REEL)).valori).toEqual({ views: 5, reach: 4, view_total_ms: 9_000_000_000 })
  })
})

describe('me(), video() e video_disponibile (1.36.0)', () => {
  it('me() chiede anche follower e post, e senza i campi (codice 100) riprova con i due soli', async () => {
    expect(await graph().me()).toMatchObject({ username: ACCOUNT.username, follower: 12345, media: 230 })
    expect(stato.richieste.at(-1)?.searchParams.get('fields')).toBe('user_id,username,followers_count,media_count')
    stato.richieste = []
    stato.campiRifiutati = ['followers_count']
    expect(await graph().me()).toEqual({ username: ACCOUNT.username, id: ACCOUNT.user_id, follower: null, media: null })
    expect(stato.richieste.map((r) => r.searchParams.get('fields'))).toEqual(['user_id,username,followers_count,media_count', 'user_id,username'])
  })

  it('leggiMedia: un VIDEO ha video_disponibile quando media_url è della CDN, false quando manca; una foto no', () => {
    const base = {
      id: '17900000000000002',
      permalink: 'https://www.instagram.com/reel/AbCdEf123/',
      timestamp: '2026-10-08T16:00:00+0000',
      media_type: 'VIDEO',
      media_product_type: 'REELS',
    }
    expect(leggiMedia({ ...base, media_url: 'https://scontent.cdninstagram.com/v/a.mp4' }, 'completi')?.video_disponibile).toBe(true)
    expect(leggiMedia({ ...base }, 'completi')?.video_disponibile).toBe(false)
    expect(leggiMedia({ ...base, media_url: 'https://esempio.test/a.mp4' }, 'completi')?.video_disponibile).toBe(false)
    // the fake Graph API of the tests: its own origin counts
    expect(leggiMedia({ ...base, media_url: 'http://127.0.0.1:6012/__video/1.mp4' }, 'completi', 'http://127.0.0.1:6012')?.video_disponibile).toBe(true)
    // at the minimal step media_url is not asked for: the key is absent, so the column is not touched
    expect(leggiMedia({ ...base }, 'minimi')).not.toHaveProperty('video_disponibile')
    expect(leggiMedia({ ...base, id: '17900000000000003', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/v/a.jpg' }, 'completi')).not.toHaveProperty('video_disponibile')
  })

  it('video(): url e copertina solo della CDN, l’audio, e senza media_audio_type se Meta lo rifiuta', async () => {
    const v = await graph().video('17900000000000002')
    expect(v).toEqual({ url: 'https://scontent.cdninstagram.com/video.mp4', copertina: CDN, audio: 'ORIGINAL_SOUND' })
    expect(stato.richieste.at(-1)?.pathname).toBe('/v26.0/17900000000000002')
    expect(stato.richieste.at(-1)?.searchParams.get('fields')).toBe('media_type,media_url,thumbnail_url,media_audio_type')
    stato.campiRifiutati = ['media_audio_type']
    expect(await graph().video('17900000000000002')).toEqual({ url: 'https://scontent.cdninstagram.com/video.mp4', copertina: CDN, audio: null })
    expect(await graph().video('../me')).toEqual({ url: null, copertina: null, audio: null })
  })
})

describe('mai Meta dai test', () => {
  it('baseGraph: E2E_GRAPH_FINTO solo in locale, col login di sviluppo, su loopback', () => {
    vi.stubEnv('E2E_GRAPH_FINTO', '')
    expect(baseGraph()).toBe(API_BASE)

    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ENABLE_DEV_LOGIN', 'true')
    for (const host of ['http://127.0.0.1:4012', 'http://localhost:4012/', 'http://[::1]:4012']) {
      vi.stubEnv('E2E_GRAPH_FINTO', host)
      expect(baseGraph()).toBe(host.replace(/\/$/, ''))
    }
    for (const altro of ['https://127.0.0.1:4012', 'http://graph.instagram.com', 'http://10.0.0.2:4012', 'non un url']) {
      vi.stubEnv('E2E_GRAPH_FINTO', altro)
      expect(baseGraph()).toBe(API_BASE)
    }

    vi.stubEnv('E2E_GRAPH_FINTO', 'http://127.0.0.1:4012')
    vi.stubEnv('ENABLE_DEV_LOGIN', 'false')
    expect(baseGraph()).toBe(API_BASE)
    vi.stubEnv('ENABLE_DEV_LOGIN', 'true')
    vi.stubEnv('NODE_ENV', 'production')
    expect(baseGraph()).toBe(API_BASE)
    // the warning never says the value
    expect(log.join('\n')).not.toContain('10.0.0.2')
    expect(log.join('\n')).not.toContain('graph.instagram.com')
  })

  it('un token di prova verso un host che non è di loopback non fa nessuna fetch', async () => {
    const spia = vi.fn<typeof fetch>()
    const g = creaGraphContenuti({ token: `IGAA${SEGNO_TOKEN_FINTO}${'z'.repeat(30)}`, base: API_BASE, fetch: spia, attendi: subito })
    await expect(g.me()).rejects.toMatchObject({ tipo: 'meta' })
    const elenco = await g.contenutiDal(DAL, 400)
    expect(elenco.errore?.message).toContain('Token di prova')
    expect(spia).not.toHaveBeenCalled()
    // the same token on the fake one (loopback) does go
    stato.tokenValido = `IGAA${SEGNO_TOKEN_FINTO}${'z'.repeat(30)}`
    const locale = creaGraphContenuti({ token: stato.tokenValido, base, attendi: subito })
    expect((await locale.contenutiDal(DAL, 400)).media).toHaveLength(5)
  })
})
