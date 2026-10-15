import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { creaGraphContenuti } from '@/lib/instagram/contenuti'
import { creaGraph, pool } from '@/lib/instagram/graph'
import { CONCORRENZA, ErroreInstagram, SEGNO_TOKEN_FINTO } from '@/lib/instagram/richieste'
import { versoChatTesto } from '@/lib/instagram/testo'
import {
  creaGraphMessenger,
  FB_BASE,
  FB_COMPLETI,
  leadDellaConversazione,
  MESSENGER_BASE,
  MESSENGER_VERSIONE,
  pulisciTokenPagina,
  versoChatMessenger,
} from '@/lib/messenger/graph'

// A fake Graph API of a Facebook Page's Messenger inbox, on the model of the
// DM Reader's Messenger part. Every Page, person, chat and message is invented.
const TOKEN = `EAAprova${'x'.repeat(60)}`
const PAGINA = { id: '100000000000001', name: 'Pagina Prova' }
type Persona = { id: string; name: string }
const MARIO: Persona = { id: '2468013579001', name: 'Mario Prova' }
const LUIGI: Persona = { id: '2468013579002', name: 'Luigi Prova' }
const ANNA: Persona = { id: '2468013579003', name: 'Anna Prova' }

type Msg = {
  id: string
  created_time: string
  from: Persona & { email: string }
  to: { data: (Persona & { email: string })[] }
  message?: string
  attachments?: { data: Record<string, unknown>[] }
  sticker?: string
  shares?: { data: { link?: string }[] }
}
type Conv = { id: string; updated_time: string; lead: Persona }

const t = (utc: string) => `${utc}:00+0000`
const conEmail = (p: Persona) => ({ ...p, email: `${p.id}@facebook.com` })
let progressivo = 0
function dallaPagina(lead: Persona, utc: string, extra: Partial<Msg> = {}): Msg {
  return { id: `m_${++progressivo}`, created_time: t(utc), from: conEmail(PAGINA), to: { data: [conEmail(lead)] }, ...extra }
}
function dalLead(lead: Persona, utc: string, extra: Partial<Msg> = {}): Msg {
  return { id: `m_${++progressivo}`, created_time: t(utc), from: conEmail(lead), to: { data: [conEmail(PAGINA)] }, ...extra }
}

function inbox(): { conv: Conv[]; msgs: Record<string, Msg[]> } {
  progressivo = 0
  const conv: Conv[] = [
    { id: 't_1', updated_time: t('2026-10-07T20:00'), lead: MARIO },
    { id: 't_2', updated_time: t('2026-10-07T18:00'), lead: LUIGI },
    { id: 't_3', updated_time: t('2026-10-06T09:00'), lead: ANNA },
    // older than the day asked: the reading stops here
    { id: 't_4', updated_time: t('2026-10-01T09:00'), lead: { id: '2468013579004', name: 'Vecchio Prova' } },
  ]
  const cronologici: Record<string, Msg[]> = {
    t_1: [
      dalLead(MARIO, '2026-10-07T17:00', { message: 'Buongiorno, vorrei informazioni sul percorso' }),
      dallaPagina(MARIO, '2026-10-07T18:00', { message: 'Ciao Mario! Che obiettivo hai?' }),
      dalLead(MARIO, '2026-10-07T19:00', { attachments: { data: [{ mime_type: 'image/jpeg', image_data: { url: 'https://cdn.invalid/foto.jpg' } }] } }),
      dalLead(MARIO, '2026-10-07T20:00', { message: 'Questa è la situazione', shares: { data: [{ link: 'https://www.facebook.com/share/finto' }] } }),
    ],
    t_2: [
      dallaPagina(LUIGI, '2026-10-07T17:00', { message: 'Ciao Luigi, hai visto il video?' }),
      dalLead(LUIGI, '2026-10-07T18:00', { sticker: 'https://cdn.invalid/sticker.png' }),
    ],
    t_3: [dalLead(ANNA, '2026-10-06T09:00', { message: 'Info?' })],
    t_4: [dalLead({ id: '2468013579004', name: 'Vecchio Prova' }, '2026-10-01T09:00', { message: 'Ciao' })],
  }
  return { conv, msgs: Object.fromEntries(Object.entries(cronologici).map(([k, v]) => [k, [...v].reverse()])) }
}

type Stato = {
  tokenValido: string
  conv: Conv[]
  msgs: Record<string, Msg[]>
  perPagina: number
  partecipantiRifiutati: boolean
  /** every nested reading answers code 100 */
  annidatoRifiutato: boolean
  /** the complete fields (attachments, sticker, shares) answer code 100, nested and alone */
  completiRifiutati: boolean
  /** single messages Meta refuses (code 10) */
  messaggiRifiutati: Set<string>
  /** what /me says the Page id is */
  idPagina: string
  guasti: { status: number; code?: number }[]
  ritardoMs: number
  inVolo: number
  massimoInVolo: number
  richieste: URL[]
}

let stato: Stato
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', base)
    stato.richieste.push(u)
    stato.inVolo++
    stato.massimoInVolo = Math.max(stato.massimoInVolo, stato.inVolo)
    let finita = false
    const fine = () => {
      if (finita) return
      finita = true
      stato.inVolo--
    }
    res.on('finish', fine)
    res.on('close', fine)
    if (stato.ritardoMs > 0) setTimeout(() => rispondi(u, res), stato.ritardoMs)
    else rispondi(u, res)
  })
  await new Promise<void>((pronto) => server.listen(0, '127.0.0.1', () => pronto()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((chiuso) => server.close(() => chiuso())))

function soloCampi(oggetto: object, campi: string[]) {
  return Object.fromEntries(Object.entries(oggetto).filter(([chiave]) => campi.includes(chiave)))
}

function rispondi(u: URL, res: ServerResponse) {
  const manda = (corpo: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(corpo))
  }
  const errore = (code: number, message: string, status = 400) => manda({ error: { message, type: 'OAuthException', code } }, status)

  const guasto = stato.guasti.shift()
  if (guasto) return guasto.code ? errore(guasto.code, 'temporaneo', guasto.status) : manda({}, guasto.status)
  if (u.searchParams.get('access_token') !== stato.tokenValido) return errore(190, 'Error validating access token: Session has expired')

  const percorso = u.pathname.replace(/^\/v[\d.]+/, '')
  const campi = u.searchParams.get('fields') ?? ''
  if (percorso === '/me') return manda(soloCampi({ id: stato.idPagina, name: PAGINA.name }, campi.split(',')))
  if (percorso === '/me/conversations') {
    if (u.searchParams.get('platform') !== 'messenger') return errore(100, 'platform')
    if (campi.includes('participants') && stato.partecipantiRifiutati) return errore(100, 'Tried accessing nonexisting field (participants)')
    const limite = Math.min(stato.perPagina, Number(u.searchParams.get('limit') ?? 25))
    const dopo = Number(u.searchParams.get('after') ?? 0)
    const pagina = stato.conv.slice(dopo, dopo + limite).map((c) => ({
      id: c.id,
      updated_time: c.updated_time,
      ...(campi.includes('participants') ? { participants: { data: [conEmail(c.lead), conEmail(PAGINA)] } } : {}),
    }))
    const altre = dopo + limite < stato.conv.length
    return manda({
      data: pagina,
      paging: {
        cursors: { before: String(dopo), after: String(dopo + limite) },
        ...(altre ? { next: `${base}/SEGUITO-NEXT?access_token=${stato.tokenValido}` } : {}),
      },
    })
  }
  const id = percorso.slice(1)
  if (stato.msgs[id]) {
    const annidati = /^messages\.limit\((\d+)\)\{([^}]*)\}$/.exec(campi)
    if (annidati) {
      if (stato.annidatoRifiutato) return errore(100, 'nested not supported')
      if (stato.completiRifiutati && annidati[2].includes('attachments')) return errore(100, 'Tried accessing nonexisting field (attachments)')
      return manda({ id, messages: { data: stato.msgs[id].slice(0, Number(annidati[1])).map((m) => soloCampi(m, annidati[2].split(','))) } })
    }
    if (campi === 'messages') return manda({ id, messages: { data: stato.msgs[id].slice(0, 20).map((m) => ({ id: m.id, created_time: m.created_time })) } })
  }
  const messaggio = Object.values(stato.msgs).flat().find((m) => m.id === id)
  if (messaggio) {
    if (stato.messaggiRifiutati.has(id)) return errore(10, 'Application does not have permission for this action')
    if (stato.completiRifiutati && campi.includes('attachments')) return errore(100, 'Tried accessing nonexisting field (attachments)')
    return manda(soloCampi(messaggio, campi.split(',')))
  }
  errore(100, 'Unsupported get request. Object does not exist', 404)
}

let log: string[] = []

beforeEach(() => {
  stato = {
    tokenValido: TOKEN,
    ...inbox(),
    perPagina: 2,
    partecipantiRifiutati: false,
    annidatoRifiutato: false,
    completiRifiutati: false,
    messaggiRifiutati: new Set(),
    idPagina: PAGINA.id,
    guasti: [],
    ritardoMs: 0,
    inVolo: 0,
    massimoInVolo: 0,
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
const graph = (extra: Partial<Parameters<typeof creaGraphMessenger>[0]> = {}) => creaGraphMessenger({ token: TOKEN, base, attendi: subito, ...extra })
const campiChiesti = () => stato.richieste.map((r) => r.searchParams.get('fields') ?? '')
const DAL = new Date('2026-10-05T22:00:00Z')

describe('il token della Pagina', () => {
  it('tiene solo il token, comunque sia incollato', () => {
    expect(pulisciTokenPagina(`FB_PAGE_TOKEN="${TOKEN}"\n`)).toBe(TOKEN)
    expect(pulisciTokenPagina(` '${TOKEN.slice(0, 30)}\n${TOKEN.slice(30)}' `)).toBe(TOKEN)
    expect(pulisciTokenPagina(`https://graph.facebook.com/v23.0/me?fields=id,name&access_token=${TOKEN}&debug=all`)).toBe(TOKEN)
    expect(pulisciTokenPagina('FB_PAGE_TOKEN=abc123')).toBe('abc123')
    expect(pulisciTokenPagina('access_token=abc123&x=1')).toBe('abc123')
    // an unexpanded placeholder, or nothing, is no token
    expect(pulisciTokenPagina('${FB_PAGE_TOKEN}')).toBe('')
    expect(pulisciTokenPagina('')).toBe('')
    expect(pulisciTokenPagina(undefined)).toBe('')
    expect(pulisciTokenPagina('   ')).toBe('')
  })
})

describe('la Pagina e le conversazioni', () => {
  it('una versione sola, v23.0, su graph.facebook.com', () => {
    expect(MESSENGER_VERSIONE).toBe('v23.0')
    expect(MESSENGER_BASE).toBe('https://graph.facebook.com')
    expect(FB_COMPLETI).toBe('id,created_time,from,to,message,attachments,sticker,shares')
    expect(FB_BASE).toBe('id,created_time,from,to,message')
  })

  it('la Pagina del token, letta una volta per client', async () => {
    const g = graph()
    expect(await g.pagina()).toEqual({ id: PAGINA.id, nome: PAGINA.name })
    expect(await g.pagina()).toEqual({ id: PAGINA.id, nome: PAGINA.name })
    expect(stato.richieste).toHaveLength(1)
    expect(stato.richieste[0].pathname).toBe('/v23.0/me')
    expect(stato.richieste[0].searchParams.get('fields')).toBe('id,name')
  })

  it('una Pagina senza id è un errore, e un errore non si ricorda', async () => {
    stato.idPagina = 'non-un-id'
    const g = graph()
    await expect(g.pagina()).rejects.toMatchObject({ tipo: 'meta' })
    stato.idPagina = PAGINA.id
    expect((await g.pagina()).id).toBe(PAGINA.id)
  })

  it('le conversazioni dal giorno dato, solo col cursore, mai paging.next', async () => {
    const { conversazioni, troncato } = await graph().conversazioniDal(DAL)
    expect(conversazioni.map((c) => c.id)).toEqual(['t_1', 't_2', 't_3'])
    expect(troncato).toBe(false)
    const pagine = stato.richieste.filter((r) => r.pathname.endsWith('/me/conversations'))
    expect(pagine.map((r) => r.searchParams.get('after'))).toEqual([null, '2'])
    expect(pagine.every((r) => r.searchParams.get('platform') === 'messenger')).toBe(true)
    expect(stato.richieste.some((r) => r.pathname.includes('SEGUITO-NEXT'))).toBe(false)
    expect(stato.richieste.every((r) => r.pathname.startsWith('/v23.0/'))).toBe(true)
    // the participants without the email Meta adds
    expect(conversazioni[0].participants?.data).toEqual([
      { id: MARIO.id, name: MARIO.name },
      { id: PAGINA.id, name: PAGINA.name },
    ])
    expect(JSON.stringify(conversazioni)).not.toContain('@facebook.com')
  })

  it('le più recenti: una basta per provare il token', async () => {
    const recenti = await graph().conversazioniRecenti(1)
    expect(recenti.map((c) => c.id)).toEqual(['t_1'])
    expect(stato.richieste.map((r) => r.searchParams.get('limit'))).toEqual(['1'])
    stato.richieste = []
    expect((await graph().conversazioniRecenti(3)).map((c) => c.id)).toEqual(['t_1', 't_2', 't_3'])
    expect(stato.richieste.map((r) => [r.searchParams.get('limit'), r.searchParams.get('after')])).toEqual([
      ['3', null],
      ['1', '2'],
    ])
  })

  it('senza participants: il solo updated_time, chiesto una volta', async () => {
    stato.partecipantiRifiutati = true
    const g = graph()
    const { conversazioni } = await g.conversazioniDal(DAL)
    expect(conversazioni.map((c) => c.id)).toEqual(['t_1', 't_2', 't_3'])
    expect(conversazioni[0].participants).toBeUndefined()
    expect(campiChiesti().filter((c) => c.includes('participants'))).toHaveLength(1)
  })

  it('il lead è il partecipante che non è la Pagina', () => {
    expect(leadDellaConversazione({ id: 't', participants: { data: [{ id: PAGINA.id, name: PAGINA.name }, { id: MARIO.id, name: '  Mario Prova ' }] } }, PAGINA.id)).toEqual({
      utente_id: MARIO.id,
      nome: 'Mario Prova',
    })
    expect(leadDellaConversazione({ id: 't', participants: { data: [{ id: PAGINA.id }] } }, PAGINA.id)).toBeNull()
    expect(leadDellaConversazione({ id: 't', participants: { data: [{ id: 'non-un-psid', name: 'X' }] } }, PAGINA.id)).toBeNull()
    expect(leadDellaConversazione({ id: 't' }, PAGINA.id)).toBeNull()
  })
})

describe('i messaggi', () => {
  it('annidati coi campi completi; «nostro» per id della Pagina; il lead dai messaggi', async () => {
    const g = graph()
    const r = await g.messaggi('t_1')
    expect(r.letti).toBe(4)
    expect(r.lead).toEqual({ utente_id: MARIO.id, nome: MARIO.name })
    expect(campiChiesti()).toEqual(['id,name', `messages.limit(20){${FB_COMPLETI}}`])
    expect(JSON.stringify(r)).not.toContain('@facebook.com')

    const chat = versoChatMessenger({ id: 't_1', updated_time: stato.conv[0].updated_time }, r, PAGINA)
    expect(chat).toMatchObject({
      conversazione_id: 't_1',
      username: null,
      utente_id: MARIO.id,
      nome: MARIO.name,
      aggiornata_il: '2026-10-07T20:00:00.000Z',
      messaggi_letti: 4,
      completa: true,
      ultimo_da: 'lead',
      ultimo_il: '2026-10-07T20:00:00.000Z',
      calendly_inviato_il: null,
      codici_condivisi: [],
    })
    expect(chat.messaggi.map((m) => [m.da, m.testo])).toEqual([
      ['lead', 'Buongiorno, vorrei informazioni sul percorso'],
      ['alpha', 'Ciao Mario! Che obiettivo hai?'],
      ['lead', '[immagine]'],
      // a Facebook link is never written
      ['lead', 'Questa è la situazione [contenuto condiviso]'],
    ])
    expect(JSON.stringify(chat)).not.toContain('cdn.invalid')
    expect(JSON.stringify(chat)).not.toContain('facebook.com')

    const sticker = versoChatMessenger({ id: 't_2' }, await g.messaggi('t_2'), PAGINA)
    expect(sticker.messaggi.map((m) => [m.da, m.testo])).toEqual([
      ['alpha', 'Ciao Luigi, hai visto il video?'],
      ['lead', '[sticker]'],
    ])
    // the lead from the messages, when the conversation came without participants
    expect(sticker).toMatchObject({ utente_id: LUIGI.id, nome: LUIGI.name })
  })

  it('il lead dai partecipanti vince su quello dei messaggi; la Pagina non è mai il lead', () => {
    const chat = versoChatMessenger(
      { id: 't_x', participants: { data: [{ id: PAGINA.id, name: PAGINA.name }, { id: ANNA.id, name: ANNA.name }] } },
      { messaggi: [{ id: 'a', created_time: t('2026-10-07T10:00'), from: { id: PAGINA.id, name: PAGINA.name }, to: { data: [{ id: MARIO.id }] }, message: 'Ciao' }], letti: 1 },
      PAGINA,
    )
    expect(chat).toMatchObject({ utente_id: ANNA.id, nome: ANNA.name, ultimo_da: 'alpha' })
    const soloPagina = versoChatMessenger({ id: 't_y' }, { messaggi: [], letti: 0 }, PAGINA)
    expect(soloPagina).toMatchObject({ utente_id: null, nome: null, messaggi: [], completa: true })
  })

  it('campi completi rifiutati: i campi base annidati, e la corsa scende solo dopo che hanno funzionato', async () => {
    stato.completiRifiutati = true
    const g = graph()
    const r = await g.messaggi('t_1')
    expect(r.letti).toBe(4)
    expect(campiChiesti()).toEqual(['id,name', `messages.limit(20){${FB_COMPLETI}}`, `messages.limit(20){${FB_BASE}}`])
    stato.richieste = []
    await g.messaggi('t_2')
    expect(campiChiesti()).toEqual([`messages.limit(20){${FB_BASE}}`])
  })

  it('annidati rifiutati: gli id, poi un messaggio alla volta dai campi completi ai base', async () => {
    stato.annidatoRifiutato = true
    stato.completiRifiutati = true
    const g = graph()
    const r = await g.messaggi('t_1')
    expect(r.letti).toBe(4)
    expect(r.messaggi.map((m) => m.created_time)).toEqual(stato.msgs.t_1.map((m) => m.created_time))
    const campi = campiChiesti()
    expect(campi.slice(0, 4)).toEqual(['id,name', `messages.limit(20){${FB_COMPLETI}}`, `messages.limit(20){${FB_BASE}}`, 'messages'])
    expect(campi).toContain(FB_COMPLETI)
    expect(campi).toContain(FB_BASE)
    stato.richieste = []
    await g.messaggi('t_2')
    expect(campiChiesti()).toEqual(['messages', FB_BASE, FB_BASE])
  })

  it('un messaggio che Meta rifiuta: «[non leggibile]» con l’ora dell’elenco, mai l’errore', async () => {
    stato.annidatoRifiutato = true
    const rifiutato = stato.msgs.t_1[2]
    stato.messaggiRifiutati.add(rifiutato.id)
    const r = await graph().messaggi('t_1')
    expect(r.letti).toBe(4)
    expect(r.messaggi[2]).toEqual({ id: rifiutato.id, created_time: rifiutato.created_time, non_leggibile: true })
    const chat = versoChatMessenger({ id: 't_1' }, r, PAGINA)
    expect(chat.messaggi.map((m) => m.testo)).toContain('[non leggibile]')
    expect(JSON.stringify(chat)).not.toContain('permission')
  })

  it('al massimo 3 richieste insieme, con un limitatore suo', async () => {
    stato.annidatoRifiutato = true
    stato.ritardoMs = 5
    const g = graph()
    const letti = await pool(['t_1', 't_2', 't_3'], CONCORRENZA, (id) => g.messaggi(id))
    expect(letti.map((l) => l.letti)).toEqual([4, 2, 1])
    expect(stato.massimoInVolo).toBeLessThanOrEqual(CONCORRENZA)
  })
})

describe('errori e token', () => {
  it('codice 190: errore del token, con la frase e mai il token', async () => {
    stato.tokenValido = 'un-altro-token'
    const g = graph()
    const errore = await g.pagina().catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(ErroreInstagram)
    expect(errore).toMatchObject({ tipo: 'token', code: 190 })
    expect((errore as Error).message).toContain('Il token è scaduto o non valido')
    expect((errore as Error).message).not.toContain(TOKEN)
    await expect(g.conversazioniDal(DAL)).rejects.toMatchObject({ tipo: 'token' })
    await expect(g.messaggi('t_1')).rejects.toMatchObject({ tipo: 'token' })
    expect(JSON.stringify(g)).not.toContain(TOKEN)
  })

  it('«Messenger» nelle frasi della rete', async () => {
    const attese: number[] = []
    const g = creaGraphMessenger({ token: TOKEN, base: 'http://127.0.0.1:9', attendi: async (ms) => void attese.push(ms) })
    const errore = await g.pagina().catch((e: unknown) => e)
    expect(errore).toMatchObject({ tipo: 'rete', message: 'Messenger non raggiungibile (rete)' })
    expect((errore as Error).message).not.toContain(TOKEN)
    expect(attese).toEqual([800, 1600])
  })

  it('riprova sui 5xx e sui limiti, poi riesce', async () => {
    stato.guasti = [{ status: 500 }, { status: 400, code: 613 }]
    expect((await graph().pagina()).id).toBe(PAGINA.id)
  })

  it('oltre il tempo dato non parte nessuna richiesta', async () => {
    await expect(graph({ entro: Date.now() - 1 }).pagina()).rejects.toMatchObject({ tipo: 'tempo' })
    expect(stato.richieste).toHaveLength(0)
  })

  it('un token di prova non parte mai verso un host che non è di loopback', async () => {
    const spia = vi.fn<typeof fetch>()
    const prova = `EAA${SEGNO_TOKEN_FINTO}${'q'.repeat(40)}`
    // the default base: graph.facebook.com (E2E_GRAPH_FINTO not set)
    vi.stubEnv('E2E_GRAPH_FINTO', '')
    const g = creaGraphMessenger({ token: prova, fetch: spia, attendi: subito })
    const errore = await g.pagina().catch((e: unknown) => e)
    expect((errore as Error).message).toContain('Token di prova: Messenger non si chiama')
    await expect(g.conversazioniRecenti(1)).rejects.toMatchObject({ tipo: 'meta' })
    expect(spia).not.toHaveBeenCalled()
    // a fake on loopback does get it
    stato.tokenValido = prova
    expect((await creaGraphMessenger({ token: prova, base, attendi: subito }).pagina()).id).toBe(PAGINA.id)
  })

  it('la base: graph.facebook.com, o il Graph finto solo in locale col login di sviluppo', async () => {
    const spia = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: PAGINA.id, name: PAGINA.name })))
    vi.stubEnv('E2E_GRAPH_FINTO', '')
    await creaGraphMessenger({ token: TOKEN, fetch: spia, attendi: subito }).pagina()
    expect(String(spia.mock.calls[0][0])).toMatch(/^https:\/\/graph\.facebook\.com\/v23\.0\/me\?/)

    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ENABLE_DEV_LOGIN', 'true')
    vi.stubEnv('E2E_GRAPH_FINTO', 'http://127.0.0.1:6012')
    await creaGraphMessenger({ token: TOKEN, fetch: spia, attendi: subito }).pagina()
    expect(String(spia.mock.calls[1][0])).toMatch(/^http:\/\/127\.0\.0\.1:6012\/v23\.0\/me\?/)

    vi.stubEnv('NODE_ENV', 'production')
    await creaGraphMessenger({ token: TOKEN, fetch: spia, attendi: subito }).pagina()
    expect(String(spia.mock.calls[2][0])).toMatch(/^https:\/\/graph\.facebook\.com\/v23\.0\/me\?/)
    // never the value of the variable in a warning
    expect(log.join('\n')).not.toContain('6012')
  })
})

// ---------------------------------------------------------------------------
// The fake Graph of the end-to-end tests (e2e/graph-finto.mjs): the readers
// and the fake agree on every shape the Insight reads
// ---------------------------------------------------------------------------
describe('il Graph finto degli e2e', () => {
  let processo: ChildProcess | null = null
  let finto = ''
  const TOKEN_IG = `IGAA${SEGNO_TOKEN_FINTO}${'i'.repeat(40)}`
  const TOKEN_FB = `EAA${SEGNO_TOKEN_FINTO}${'f'.repeat(40)}`
  const ACCOUNT = { username: 'alpha_finto', id: '17841400000000042' }

  beforeAll(async () => {
    // a free port, then the fake on it
    const libera = createServer()
    await new Promise<void>((pronto) => libera.listen(0, '127.0.0.1', () => pronto()))
    const porta = (libera.address() as AddressInfo).port
    await new Promise<void>((chiuso) => libera.close(() => chiuso()))
    processo = spawn(process.execPath, ['e2e/graph-finto.mjs'], { env: { ...process.env, PORTA_GRAPH_FINTO: String(porta) }, stdio: ['ignore', 'pipe', 'pipe'] })
    await new Promise<void>((pronto, fallito) => {
      const timer = setTimeout(() => fallito(new Error('il Graph finto non è partito')), 10_000)
      processo?.stdout?.on('data', (d: Buffer) => {
        if (String(d).includes('graph finto su')) {
          clearTimeout(timer)
          pronto()
        }
      })
      processo?.on('exit', () => fallito(new Error('il Graph finto è uscito')))
    })
    finto = `http://127.0.0.1:${porta}`
  })

  afterAll(() => {
    processo?.kill()
  })

  const comando = async (percorso: string) => (await fetch(`${finto}${percorso}`)).json() as Promise<Record<string, unknown>>

  it('Messenger: la Pagina, le chat e i messaggi coi campi completi, senza email', async () => {
    await comando('/__azzera')
    const g = creaGraphMessenger({ token: TOKEN_FB, base: finto, attendi: subito })
    const pagina = await g.pagina()
    expect(pagina).toEqual({ id: '100000000000042', nome: 'Percorso Alpha (finta)' })
    const { conversazioni } = await g.conversazioniDal(new Date(Date.now() - 2 * 86_400_000))
    expect(conversazioni.map((c) => c.id)).toEqual(['t_finto_01', 't_finto_02'])
    const chat = await Promise.all(conversazioni.map(async (c) => versoChatMessenger(c, await g.messaggi(c.id), pagina)))
    expect(chat[0]).toMatchObject({ utente_id: '24680135790001', nome: 'Giulio Finto', ultimo_da: 'lead', completa: true })
    expect(chat[0].messaggi.map((m) => m.da)).toEqual(['lead', 'alpha', 'lead'])
    expect(chat[1].messaggi.map((m) => m.testo)).toEqual(['[immagine]', 'Questa è la mia situazione adesso', 'Grazie Stefano! Da quanto tempo non ti alleni?'])
    expect(JSON.stringify(chat)).not.toContain('@facebook.com')
    expect(JSON.stringify(chat)).not.toContain('cdn.finto.invalid')
    const { percorsi } = (await comando('/__richieste')) as { percorsi: string[] }
    expect(percorsi.every((p) => p.startsWith('/v23.0/'))).toBe(true)
    expect(JSON.stringify(percorsi)).not.toContain(SEGNO_TOKEN_FINTO)
  })

  it('Instagram: le chat col testo, il ripiego dei campi ricchi, le etichette, i codici e i profili', async () => {
    await comando('/__modo')
    const g = creaGraph({ token: TOKEN_IG, base: finto, attendi: subito, lettura: 'testo' })
    expect(await g.me()).toEqual({ user_id: ACCOUNT.id, username: ACCOUNT.username })
    const { conversazioni, troncato } = await g.conversazioniDal(new Date(Date.now() - 2 * 86_400_000))
    expect(troncato).toBe(false)
    expect(conversazioni).toHaveLength(8)
    // in the order of the inbox: the chat refusing the complete fields last
    const chat: ReturnType<typeof versoChatTesto>[] = []
    for (const c of conversazioni) chat.push(versoChatTesto(c, await g.messaggi(c.id), ACCOUNT))
    const per: Record<string, ReturnType<typeof versoChatTesto>> = Object.fromEntries(chat.map((c) => [c.username ?? '', c]))
    expect(per['marco.finto'].codici_condivisi).toEqual(['GraphFinto02'])
    expect(per['marco.finto'].messaggi[0].testo).toBe('[contenuto condiviso: https://www.instagram.com/reel/GraphFinto02/]')
    expect(per['luca.finto'].calendly_inviato_il).not.toBeNull()
    expect(per['andrea.finto'].messaggi.map((m) => m.testo)).toEqual(['Che bella questa routine! [risposta a una storia]', 'Grazie Andrea! Ti alleni già a casa?', "[contenuto non supportato dall'API]"])
    expect(per['andrea.finto'].messaggi[0].storia).toBe(true)
    expect(per['ragazzo.finto'].messaggi[1].testo).toBe('[messaggio vocale]')
    expect(per['paolo.finto']).toMatchObject({ utente_id: '17841499000000005', completa: true, ultimo_da: 'alpha' })
    expect(per['coachplus.app']).toBeDefined()
    expect(JSON.stringify(chat)).not.toContain('lookaside')
    expect(JSON.stringify(chat)).not.toContain('igsh')
    // the older chat comes with the most recent ones
    expect((await g.conversazioniRecenti(30)).map((c) => c.id)).toContain('igc_finto_silenzio')

    expect(await g.profilo('17841499000000001')).toEqual({ nome: 'Marco Finto', username: 'marco.finto', follower: 312, verificato: false, ti_segue: true, lo_segui: false })
    expect(await g.profilo('17841499000009999')).toBeNull()
  })

  it('le statistiche: lette, o senza_permesso col modo apposito; lo scenario dell’Insight nella didascalia', async () => {
    await comando('/__modo')
    const c = creaGraphContenuti({ token: TOKEN_IG, base: finto, attendi: subito })
    const reel = { media_id: '17990000000000002', reel: true, media_type: 'VIDEO' as const }
    // the reel's numbers of the 1.36.0 steps: reposts, the watch time and the skip rate come with the first step of the ladder
    expect(await c.insights(reel)).toEqual({
      stato: 'lette',
      gradino: 'completo',
      valori: { views: 2000, reach: 1600, saved: 20, shares: 10, likes: 20, comments: 2, total_interactions: 32, reposts: 4, avg_watch_ms: 9200, view_total_ms: 6000000, skip_rate: 0.35 },
    })
    expect(await c.insights({ media_id: '17990000000000005', reel: false, media_type: 'IMAGE' })).toMatchObject({ stato: 'lette', valori: { views: 5000 } })

    expect(await comando('/__modo?scenario=insight&insights=senza_permesso')).toEqual({ campi: 'completi', scenario: 'insight', insights: 'senza_permesso' })
    expect(await creaGraphContenuti({ token: TOKEN_IG, base: finto, attendi: subito }).insights(reel)).toEqual({ stato: 'senza_permesso', valori: {} })
    const elenco = await creaGraphContenuti({ token: TOKEN_IG, base: finto, attendi: subito }).contenutiDal(new Date(Date.now() - 14 * 86_400_000), 50)
    expect(elenco.media.find((m) => m.shortcode === 'GraphFinto04')?.didascalia).toContain('Scrivimi "ALPHA" in DM.')

    // reset: the 1.33.0 answers as before
    expect(await comando('/__modo')).toEqual({ campi: 'completi' })
    const pulito = await creaGraphContenuti({ token: TOKEN_IG, base: finto, attendi: subito }).contenutiDal(new Date(Date.now() - 14 * 86_400_000), 50)
    expect(pulito.media.find((m) => m.shortcode === 'GraphFinto04')?.didascalia).toBe('Un altro reel finto, di tre giorni fa.')
  })
})
