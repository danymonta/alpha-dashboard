import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { CAMPI_MEDIA, copertinaValida, creaGraphContenuti, leggiMedia } from '@/lib/instagram/contenuti'
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
  if (percorso === '/me') return manda({ ...ACCOUNT, id: 'app1' })
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
    expect(await graph().me()).toEqual({ username: ACCOUNT.username, id: ACCOUNT.user_id })
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
