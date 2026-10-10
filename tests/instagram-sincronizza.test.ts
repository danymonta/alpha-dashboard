import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { FRASI_ERRORE } from '@/lib/instagram/report'
import {
  aggiornaContenutiInstagram,
  FRASE_IN_CORSO,
  FRASI_CONTENUTI,
  fraseAppenaFatto,
  ricalcolaAbbinamenti,
} from '@/lib/instagram/sincronizza-contenuti'
import { BOZZA_REEL } from '@/lib/marketing/etichette'

// The listing run against a fake Graph API and a fake database that records
// every call. Every post, caption and content is invented.
const TOKEN = `IGAAprova${'s'.repeat(40)}`
const ADESSO = new Date('2026-10-09T03:30:00Z')
const GIRO = '11111111-1111-4111-8111-111111111111'
const C_PETTO = '00000000-0000-4000-8000-0000000000a1'
const C_ADDOMINALI = '00000000-0000-4000-8000-0000000000a2'
const C_GENERICO = '00000000-0000-4000-8000-0000000000a3'

type MediaFinto = Record<string, unknown> & { id: string; permalink: string }

function media(n: number, giorni: number, caption: string | null, extra: Record<string, unknown> = {}): MediaFinto {
  const codice = `Sinc${String(n).padStart(4, '0')}x`
  return {
    id: `1791000000${String(n).padStart(7, '0')}`,
    shortcode: codice,
    permalink: `https://www.instagram.com/reel/${codice}/`,
    timestamp: new Date(Date.UTC(2026, 9, 8, 16) - giorni * 86_400_000).toISOString(),
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    ...(caption === null ? {} : { caption }),
    thumbnail_url: `https://scontent.cdninstagram.com/v/${codice}.jpg`,
    like_count: 5,
    comments_count: 1,
    ...extra,
  }
}

type GraphStato = {
  media: MediaFinto[]
  campiRifiutati: string[]
  /** every request answers this error */
  errore: { code: number; status: number } | null
  /** the page after this cursor answers 80002 every time */
  limiteDopo: string | null
  richieste: URL[]
}

let g: GraphStato
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', base)
    g.richieste.push(u)
    const manda = (corpo: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(corpo))
    }
    if (g.errore) return manda({ error: { code: g.errore.code, message: 'rifiutato' } }, g.errore.status)
    if (u.searchParams.get('access_token') !== TOKEN) return manda({ error: { code: 190, message: 'Invalid OAuth access token' } }, 400)
    const percorso = u.pathname.replace(/^\/v[\d.]+/, '')
    if (percorso === '/me') return manda({ user_id: '17841400000000009', username: '_Alpha_Prova' })
    const campi = (u.searchParams.get('fields') ?? '').split(',')
    const rifiutato = campi.find((c) => g.campiRifiutati.includes(c))
    if (rifiutato) return manda({ error: { code: 100, message: `Tried accessing nonexisting field (${rifiutato})` } }, 400)
    if (g.limiteDopo !== null && u.searchParams.get('after') === g.limiteDopo) {
      return manda({ error: { code: 80002, message: 'too many calls' } }, 400)
    }
    const dopo = Number(u.searchParams.get('after') ?? 0)
    const pagina = g.media.slice(dopo, dopo + 2).map((m) => Object.fromEntries(Object.entries(m).filter(([k]) => campi.includes(k))))
    const altre = dopo + 2 < g.media.length
    manda({ data: pagina, paging: { cursors: { after: String(dopo + 2) }, ...(altre ? { next: `${base}/NEXT?access_token=${TOKEN}` } : {}) } })
  })
  await new Promise<void>((pronto) => server.listen(0, '127.0.0.1', () => pronto()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((chiuso) => server.close(() => chiuso())))

// ---------------------------------------------------------------------------
// The fake database
// ---------------------------------------------------------------------------

type Riga = Record<string, unknown>
type Contenuto = { id: string; tipo: string; stato: string; post_date: string | null; nome: string; bozza: string | null; finale: string | null; messaggio: string | null; instagram_shortcode: string | null }

type DbStato = {
  inizio: Riga
  token: string | null
  post: Map<string, Riga>
  contenuti: Contenuto[]
  rifiutati: { shortcode: string; contenuto_id: string }[]
  esclusi: { shortcode: string }[]
  /** what instagram_collega_da_solo answers for a pair (default: true, and the content takes the post) */
  collega: (shortcode: string, contenuto: string) => boolean
  /** a table whose upsert fails */
  upsertRotto: boolean
  rpc: { nome: string; args: Riga }[]
  upsert: Riga[][]
}

let d: DbStato

const ok = <T>(data: T) => Promise.resolve({ data, error: null })
const ko = (code: string) => Promise.resolve({ data: null, error: { code, message: 'errore finto' } })

function query(tabella: string) {
  const filtri: { op: string; args: unknown[] }[] = []
  const risolvi = () => {
    if (tabella === 'instagram_contenuti') {
      const inFiltro = filtri.find((f) => f.op === 'in')
      if (inFiltro) {
        const ids = inFiltro.args[1] as string[]
        return ok([...d.post.values()].filter((p) => ids.includes(String(p.media_id))).map((p) => ({ media_id: p.media_id })))
      }
      return ok([...d.post.values()])
    }
    if (tabella === 'marketing_contenuti') {
      if (filtri.some((f) => f.op === 'limit')) {
        const date = d.contenuti.filter((c) => c.stato !== 'canceled' && c.post_date).map((c) => c.post_date as string).sort()
        return ok(date.length ? { post_date: date[0] } : null)
      }
      return ok(d.contenuti.filter((c) => c.instagram_shortcode).map((c) => ({ instagram_shortcode: c.instagram_shortcode })))
    }
    if (tabella === 'marketing_abbinamenti_rifiutati') return ok(d.rifiutati)
    if (tabella === 'marketing_post_esclusi') return ok(d.esclusi)
    return ok([])
  }
  const q: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'neq', 'not', 'in', 'order', 'limit']) {
    q[op] = (...args: unknown[]) => {
      filtri.push({ op, args })
      return q
    }
  }
  q.maybeSingle = risolvi
  q.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => risolvi().then(a, b)
  q.upsert = (righe: Riga[], opzioni: { onConflict: string }) => {
    expect(opzioni.onConflict).toBe('media_id')
    d.upsert.push(righe)
    if (d.upsertRotto) return ko('08006')
    for (const r of righe) d.post.set(String(r.media_id), { ...(d.post.get(String(r.media_id)) ?? {}), ...r })
    return ok(null)
  }
  return q
}

function dbFinto(): Parameters<typeof aggiornaContenutiInstagram>[0]['db'] {
  const db = {
    from: (tabella: string) => query(tabella),
    rpc(nome: string, args: Riga = {}) {
      d.rpc.push({ nome, args })
      switch (nome) {
        case 'instagram_contenuti_inizia_giro':
          return ok(d.inizio)
        case 'instagram_token':
          return ok(d.token)
        case 'instagram_contenuti_segna_eliminati':
          return ok(1)
        case 'marketing_contenuti_per_abbinamento':
          return ok(d.contenuti.filter((c) => !c.instagram_shortcode && c.stato !== 'canceled'))
        case 'instagram_collega_da_solo': {
          const fatto = d.collega(String(args.p_shortcode), String(args.p_contenuto))
          if (fatto) {
            const c = d.contenuti.find((x) => x.id === args.p_contenuto)
            if (c) c.instagram_shortcode = String(args.p_shortcode)
          }
          return ok(fatto)
        }
        case 'instagram_salva_proposte':
          return ok((args.p_proposte as unknown[]).length)
        case 'instagram_contenuti_fine_giro':
          return ok(true)
        default:
          return ok(null)
      }
    },
  }
  return db as unknown as Parameters<typeof aggiornaContenutiInstagram>[0]['db']
}

const chiamate = (nome: string) => d.rpc.filter((r) => r.nome === nome).map((r) => r.args)
let log: string[] = []

function contenuto(id: string, nome: string, post_date: string | null, extra: Partial<Contenuto> = {}): Contenuto {
  return { id, tipo: 'reel', stato: 'posted', post_date, nome, bozza: BOZZA_REEL, finale: null, messaggio: null, instagram_shortcode: null, ...extra }
}

beforeEach(() => {
  g = {
    // 08/10 at 18:00 in Rome, 07/10, 06/10, and one of the spring
    media: [
      media(1, 0, 'Il petto scavato non è genetica: ecco cosa cambia.\n#petto'),
      media(2, 1, 'Tre errori negli addominali bassi che fanno quasi tutti.'),
      media(3, 2, 'Una giornata con me.'),
      media(4, 200, 'Un vecchio reel.'),
    ],
    campiRifiutati: [],
    errore: null,
    limiteDopo: null,
    richieste: [],
  }
  d = {
    inizio: { giro: GIRO },
    token: TOKEN,
    post: new Map(),
    contenuti: [
      contenuto(C_PETTO, '#6MOF "Il petto scavato non è genetica"', '2026-10-08'),
      contenuto(C_ADDOMINALI, '#7 "Tre errori negli addominali bassi"', '2026-10-07', { stato: 'to_be_posted' }),
      contenuto(C_GENERICO, 'Reel #5 - TOF - About Me Reel', '2026-10-06'),
    ],
    rifiutati: [],
    esclusi: [],
    collega: () => true,
    upsertRotto: false,
    rpc: [],
    upsert: [],
  }
  log = []
  for (const livello of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, livello).mockImplementation((...args: unknown[]) => void log.push(JSON.stringify(args)))
  }
})

afterEach(() => vi.restoreAllMocks())

const subito = async () => {}
function giro(extra: Partial<Parameters<typeof aggiornaContenutiInstagram>[0]> = {}) {
  return aggiornaContenutiInstagram({
    db: dbFinto(),
    motivo: 'notte',
    entro: Date.now() + 60_000,
    adesso: ADESSO,
    graph: { base, attendi: subito },
    ...extra,
  })
}

/** Nothing of a caption, a permalink, a CDN URL, the account or the token in the logs. */
function logPuliti() {
  const tutto = log.join('\n')
  for (const segreto of [TOKEN, 'petto scavato', 'instagram.com/reel', 'cdninstagram', '_alpha_prova', 'Sinc000']) {
    expect(tutto.toLowerCase()).not.toContain(segreto.toLowerCase())
  }
}

describe('il giro dei post', () => {
  it('legge, salva solo le colonne lette, segna gli eliminati, collega i sicuri e propone gli altri', async () => {
    const esito = await giro()
    expect(esito).toEqual({
      esito: 'ok',
      letti: 4,
      nuovi: 4,
      eliminati: 1,
      scartati: 0,
      collegati: 1,
      proposti: expect.any(Number),
      campi: 'completi',
      errore: null,
      causa: null,
    })
    // the token is only read, never refreshed here
    expect(chiamate('instagram_token')).toHaveLength(1)
    expect(d.rpc.some((r) => r.nome === 'instagram_token_rinnovato')).toBe(false)
    // the rows: only the columns read, letto_il now, eliminato_il null
    const righe = d.upsert.flat()
    expect(righe[0]).toMatchObject({
      media_id: '17910000000000001',
      shortcode: 'Sinc0001x',
      media_type: 'VIDEO',
      media_product_type: 'REELS',
      reel: true,
      didascalia: 'Il petto scavato non è genetica: ecco cosa cambia.\n#petto',
      copertina_url: 'https://scontent.cdninstagram.com/v/Sinc0001x.jpg',
      eliminato_il: null,
    })
    expect(typeof righe[0].letto_il).toBe('string')
    // a complete reading: what is not there since 180 days ago is deleted
    expect(chiamate('instagram_contenuti_segna_eliminati')).toEqual([
      { p_dal: new Date(ADESSO.getTime() - 180 * 86_400_000).toISOString(), p_presenti: righe.map((r) => r.media_id) },
    ])
    // the Posted content linked by itself; the To be posted one only proposed
    expect(chiamate('instagram_collega_da_solo')).toEqual([
      expect.objectContaining({ p_shortcode: 'Sinc0001x', p_contenuto: C_PETTO, p_giorni: 0 }),
    ])
    const proposte = chiamate('instagram_salva_proposte')[0].p_proposte as { shortcode: string; contenuto_id: string }[]
    expect(proposte).toContainEqual(expect.objectContaining({ shortcode: 'Sinc0002x', contenuto_id: C_ADDOMINALI }))
    expect(proposte.some((p) => p.contenuto_id === C_PETTO)).toBe(false)
    // the outcome, always, with the lease's id
    expect(chiamate('instagram_contenuti_fine_giro')).toEqual([
      {
        p_giro: GIRO,
        p_esito: 'ok',
        p_letti: 4,
        p_collegati: 1,
        p_proposti: proposte.length,
        p_campi: 'completi',
        p_account: '_alpha_prova',
        p_errore: null,
        p_causa: null,
      },
    ])
    logPuliti()
  })

  it('il lease preso: nessuna scrittura, nessuna lettura del token, la frase', async () => {
    d.inizio = { rifiutato: 'in_corso', dal: '2026-10-09T03:28:00Z' }
    expect(await giro()).toMatchObject({ esito: 'fallito', rifiutato: 'in_corso', errore: FRASE_IN_CORSO })
    d.inizio = { rifiutato: 'appena_fatto', il: '2026-10-09T03:28:00Z' }
    const appena = await giro({ motivo: 'manuale' })
    expect(appena).toMatchObject({ rifiutato: 'appena_fatto', dal: '2026-10-09T03:28:00Z' })
    expect(appena.errore).toBe('Aggiornato alle 05:28: riprova tra 3 minuti.')
    expect(d.rpc.map((r) => r.nome)).toEqual(['instagram_contenuti_inizia_giro', 'instagram_contenuti_inizia_giro'])
    expect(chiamate('instagram_contenuti_inizia_giro')[1]).toEqual({ p_motivo: 'manuale' })
    // the run being waited for failed (Meta's limits): the words say so
    d.inizio = { rifiutato: 'appena_fatto', il: '2026-10-09T03:28:00Z', esito: 'fallito' }
    expect((await giro({ motivo: 'manuale' })).errore).toBe('Ultimo tentativo alle 05:28: riprova tra 3 minuti.')
    expect(g.richieste).toHaveLength(0)
  })

  it('le parole del rifiuto: 1 minuto, al minimo 1', () => {
    expect(fraseAppenaFatto('2026-10-09T03:26:30Z', ADESSO)).toBe('Aggiornato alle 05:26: riprova tra 2 minuti.')
    expect(fraseAppenaFatto('2026-10-09T03:25:30Z', ADESSO)).toBe('Aggiornato alle 05:25: riprova tra 1 minuto.')
    expect(fraseAppenaFatto('2026-10-09T03:20:00Z', ADESSO)).toBe('Aggiornato alle 05:20: riprova tra 1 minuto.')
    // after a run that failed (Meta's limits): never «Aggiornato»
    expect(fraseAppenaFatto('2026-10-09T03:26:30Z', ADESSO, true)).toBe('Ultimo tentativo alle 05:26: riprova tra 2 minuti.')
    expect(fraseAppenaFatto('non è una data', ADESSO, true)).toBe('Appena tentato: riprova tra 5 minuti.')
  })

  it('senza token: fallito con la frase, nessuna richiesta a Instagram, il lease liberato', async () => {
    d.token = null
    const esito = await giro()
    expect(esito).toMatchObject({ esito: 'fallito', causa: 'senza_token', errore: FRASI_CONTENUTI.senza_token })
    expect(g.richieste).toHaveLength(0)
    expect(chiamate('instagram_contenuti_fine_giro')).toEqual([
      // the cause too: only without a token (or with a refused one) the next tap starts at once
      expect.objectContaining({ p_giro: GIRO, p_esito: 'fallito', p_errore: FRASI_CONTENUTI.senza_token, p_causa: 'senza_token' }),
    ])
  })

  it('senza didascalia da Instagram: le righe non hanno la chiave, nessun collegamento automatico', async () => {
    g.campiRifiutati = ['media_product_type', 'caption']
    const esito = await giro()
    expect(esito).toMatchObject({ esito: 'ok', campi: 'senza_didascalia', collegati: 0 })
    for (const r of d.upsert.flat()) {
      expect(r).not.toHaveProperty('didascalia')
      expect(r).not.toHaveProperty('media_product_type')
    }
    expect(chiamate('instagram_collega_da_solo')).toEqual([])
    expect(chiamate('instagram_contenuti_fine_giro')[0]).toMatchObject({ p_campi: 'senza_didascalia' })
  })

  it('i campi scesi a metà: righe con colonne diverse in blocchi diversi', async () => {
    // the second page refuses the caption: the first page's rows keep theirs
    let pagine = 0
    g.campiRifiutati = []
    const originale = g.media
    g.media = originale
    const vero = server.listeners('request')[0] as (...a: unknown[]) => void
    server.removeAllListeners('request')
    server.on('request', (req, res) => {
      const u = new URL(req.url ?? '/', base)
      if (u.pathname.endsWith('/me/media') && ++pagine === 2) g.campiRifiutati = ['media_product_type']
      vero(req, res)
    })
    try {
      const esito = await giro()
      expect(esito).toMatchObject({ esito: 'ok', campi: 'senza_tipo', letti: 4 })
      expect(d.upsert).toHaveLength(2)
      expect(d.upsert[0].every((r) => 'media_product_type' in r)).toBe(true)
      expect(d.upsert[1].every((r) => !('media_product_type' in r))).toBe(true)
    } finally {
      server.removeAllListeners('request')
      server.on('request', vero)
    }
  })

  it('una lettura a metà (limite di Meta): salva quello letto, non segna eliminati, parziale', async () => {
    g.limiteDopo = '2'
    const esito = await giro()
    expect(esito).toMatchObject({ esito: 'parziale', causa: 'limite', letti: 2, errore: FRASI_CONTENUTI.limite })
    expect(chiamate('instagram_contenuti_segna_eliminati')).toEqual([])
    // the links are redone all the same, with what is there
    expect(chiamate('instagram_salva_proposte')).toHaveLength(1)
  })

  it('il limite di Meta già su /me: fallito per limite, e la causa va al database (il tocco dopo aspetta i 5 minuti)', async () => {
    g.errore = { code: 4, status: 400 }
    const esito = await giro({ motivo: 'manuale' })
    expect(esito).toMatchObject({ esito: 'fallito', causa: 'limite', letti: 0, errore: FRASI_CONTENUTI.limite })
    expect(chiamate('instagram_contenuti_fine_giro')).toEqual([
      expect.objectContaining({ p_esito: 'fallito', p_causa: 'limite', p_letti: 0 }),
    ])
    expect(chiamate('instagram_errore')).toEqual([])
  })

  it('un collegamento sicuro che il database rifiuta torna tra le proposte', async () => {
    d.collega = () => false
    const esito = await giro()
    expect(esito.collegati).toBe(0)
    const proposte = chiamate('instagram_salva_proposte')[0].p_proposte as { shortcode: string; contenuto_id: string }[]
    expect(proposte).toContainEqual(expect.objectContaining({ shortcode: 'Sinc0001x', contenuto_id: C_PETTO }))
  })

  it('190: fallito, Impostazioni sa del token scaduto, il token mai nei log', async () => {
    g.errore = { code: 190, status: 400 }
    const esito = await giro()
    expect(esito).toMatchObject({ esito: 'fallito', causa: 'token', errore: FRASI_CONTENUTI.token })
    expect(chiamate('instagram_errore')).toEqual([{ p_messaggio: FRASI_ERRORE.token }])
    expect(chiamate('instagram_contenuti_fine_giro')).toEqual([expect.objectContaining({ p_esito: 'fallito', p_causa: 'token' })])
    logPuliti()
  })

  it('un errore del database a metà: fallito, e il lease si libera sempre', async () => {
    d.upsertRotto = true
    const esito = await giro()
    expect(esito).toMatchObject({ esito: 'fallito', causa: 'database', errore: FRASI_CONTENUTI.database })
    expect(chiamate('instagram_contenuti_fine_giro')).toEqual([
      expect.objectContaining({ p_giro: GIRO, p_esito: 'fallito', p_errore: FRASI_CONTENUTI.database, p_causa: 'database' }),
    ])
  })

  it('il lease che non si prende: fallito, niente da liberare', async () => {
    const db = dbFinto()
    const rotto = { ...db, rpc: () => ko('08006') } as unknown as typeof db
    const esito = await aggiornaContenutiInstagram({ db: rotto, motivo: 'notte', entro: Date.now() + 1000, graph: { base } })
    expect(esito).toMatchObject({ esito: 'fallito', causa: 'database' })
  })

  it('Meta che rifiuta (non un limite): fallito con le parole di Meta senza token', async () => {
    g.errore = { code: 10, status: 400 }
    const esito = await giro()
    expect(esito.esito).toBe('fallito')
    expect(esito.causa).toBe('meta')
    expect(esito.errore).toContain(FRASI_CONTENUTI.meta)
    expect(esito.errore).not.toContain(TOKEN)
  })
})

describe('ricalcolaAbbinamenti dopo un tocco', () => {
  it('niente si collega da solo, i post collegati, esclusi e i rifiuti restano fuori', async () => {
    for (const m of g.media) {
      d.post.set(m.id, {
        media_id: m.id,
        shortcode: m.shortcode,
        media_type: 'VIDEO',
        reel: true,
        pubblicato_il: m.timestamp,
        didascalia: m.caption ?? null,
        eliminato_il: null,
      })
    }
    d.esclusi = [{ shortcode: 'Sinc0003x' }]
    d.rifiutati = [{ shortcode: 'Sinc0002x', contenuto_id: C_ADDOMINALI }]
    const esito = await ricalcolaAbbinamenti({ db: dbFinto(), automatico: false, adesso: ADESSO })
    expect(esito.collegati).toBe(0)
    expect(chiamate('instagram_collega_da_solo')).toEqual([])
    const proposte = chiamate('instagram_salva_proposte')[0].p_proposte as { shortcode: string; contenuto_id: string }[]
    expect(proposte).toContainEqual(expect.objectContaining({ shortcode: 'Sinc0001x', contenuto_id: C_PETTO }))
    expect(proposte.some((p) => p.shortcode === 'Sinc0003x')).toBe(false)
    expect(proposte.some((p) => p.shortcode === 'Sinc0002x' && p.contenuto_id === C_ADDOMINALI)).toBe(false)
    // the old post (before the calendar's start minus 3 days) is not work
    expect(proposte.some((p) => p.shortcode === 'Sinc0004x')).toBe(false)
  })

  it('senza contenuti datati nessun post è da abbinare: le proposte si svuotano', async () => {
    d.contenuti = []
    await ricalcolaAbbinamenti({ db: dbFinto(), automatico: true })
    expect(chiamate('instagram_salva_proposte')).toEqual([{ p_proposte: [] }])
  })
})
