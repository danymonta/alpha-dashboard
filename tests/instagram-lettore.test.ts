import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  CONCORRENZA,
  creaGraph,
  ErroreInstagram,
  oscuraToken,
  pool,
  pulisciToken,
  rinnovaToken,
  semaforo,
} from '@/lib/instagram/graph'
import { calcolaReportInstagram, FRASI_ERRORE } from '@/lib/instagram/report'

// A fake Graph API on the model of the DM Reader's mock-test.js. Every account,
// chat and message is invented.
const TOKEN = `IGAAprova${'x'.repeat(40)}`
const NUOVO = `IGAAnuovo${'y'.repeat(40)}`
/** a token the admin pastes while the job refreshes the old one */
const INCOLLATO = `IGAAincollato${'w'.repeat(40)}`
const ACCOUNT = { user_id: '17841400000000001', username: 'alpha_prova' }
const D = '2026-10-07'
/** 00:30 of 08/10 in Rome (UTC+2): the night after D */
const ADESSO = new Date('2026-10-07T22:30:00Z')

type Msg = { id: string; created_time: string; from: { username: string; id: string }; to: { data: { username: string; id: string }[] }; message?: string }
type Conv = { id: string; updated_time: string; lead: string }

const t = (utc: string) => `${utc}:00+0000`
let progressivo = 0
function nostro(lead: string, utc: string, message = 'messaggio di prova'): Msg {
  return { id: `m${++progressivo}`, created_time: t(utc), from: { username: ACCOUNT.username, id: ACCOUNT.user_id }, to: { data: [{ username: lead, id: `id_${lead}` }] }, message }
}
function delLead(lead: string, utc: string, message = 'risposta di prova'): Msg {
  return { id: `m${++progressivo}`, created_time: t(utc), from: { username: lead, id: `id_${lead}` }, to: { data: [{ username: ACCOUNT.username, id: ACCOUNT.user_id }] }, message }
}

const LINK = 'Ecco il link: https://calendly.com/danielemontagnolo/coaching-call'

/** The inbox, most recent first. Times in UTC (Rome is UTC+2). */
function inbox(): { conv: Conv[]; msgs: Record<string, Msg[]> } {
  progressivo = 0
  const conv: Conv[] = [
    { id: 'c1', updated_time: t('2026-10-07T20:00'), lead: 'lead.uno' },
    { id: 'c2', updated_time: t('2026-10-07T19:00'), lead: 'lead_due' },
    { id: 'c3', updated_time: t('2026-10-07T18:00'), lead: 'lead_tre' },
    { id: 'c4', updated_time: t('2026-10-07T17:00'), lead: 'loris_explore' },
    { id: 'c5', updated_time: t('2026-10-07T16:00'), lead: 'lead_cinque' },
    { id: 'c6', updated_time: t('2026-10-06T10:00'), lead: 'lead_sei' },
    // updated before 00:00 of 06/10 in Rome (2026-10-05T22:00Z): the reading stops here
    { id: 'c7', updated_time: t('2026-10-05T10:00'), lead: 'lead_vecchio' },
    { id: 'c8', updated_time: t('2026-10-04T10:00'), lead: 'lead_otto' },
  ]
  const lungo: Msg[] = []
  for (let i = 0; i < 22; i++) {
    const ora = `2026-10-04T${String(i).padStart(2, '0')}:10`
    lungo.push(i % 2 === 0 ? nostro('lead_cinque', ora) : delLead('lead_cinque', ora))
  }
  lungo.push(nostro('lead_cinque', '2026-10-06T09:00'), delLead('lead_cinque', '2026-10-06T19:00'), nostro('lead_cinque', '2026-10-07T09:00'))
  const cronologici: Record<string, Msg[]> = {
    // outbound, the lead answers, the call link: outbound, conversazione, call proposta
    c1: [nostro('lead.uno', '2026-10-07T08:00'), delLead('lead.uno', '2026-10-07T09:00', LINK), nostro('lead.uno', '2026-10-07T10:00', LINK)],
    // inbound opened the evening before, answered the next morning
    c2: [delLead('lead_due', '2026-10-06T18:00'), nostro('lead_due', '2026-10-07T07:00')],
    // a follow up
    c3: [nostro('lead_tre', '2026-10-03T08:00'), nostro('lead_tre', '2026-10-07T08:00')],
    // the team's account: never counted
    c4: [nostro('loris_explore', '2026-10-07T08:00', LINK)],
    // longer than Meta's 20: uncertain, its conversation counts
    c5: lungo,
    // nothing on D
    c6: [nostro('lead_sei', '2026-10-06T10:00')],
    c7: [nostro('lead_vecchio', '2026-10-05T10:00')],
    c8: [nostro('lead_otto', '2026-10-04T10:00')],
  }
  // Meta gives the most recent first
  const msgs = Object.fromEntries(Object.entries(cronologici).map(([k, v]) => [k, [...v].reverse()]))
  return { conv, msgs }
}

type Stato = {
  tokenValido: string
  conv: Conv[]
  msgs: Record<string, Msg[]>
  /** conversations per page, whatever the limit asked */
  perPagina: number
  partecipantiRifiutati: boolean
  annidatoRifiutato: boolean
  /** the nested expansion refused with the rich fields only (shares): the base one works */
  annidatoRiccoRifiutato: boolean
  ricchiRifiutati: boolean
  /** conversations Meta says do not exist (code 100, subcode 33) */
  chatInesistenti: Set<string>
  /** the next responses matching: a 200 cut after a few bytes of the body */
  troncate: { quando: (u: URL) => boolean; volte: number }[]
  /** every response waits this long: to see how many requests are on the wire at once */
  ritardoMs: number
  inVolo: number
  massimoInVolo: number
  /** the next requests answer with these errors, one each */
  guasti: { status: number; code?: number }[]
  /** conversations whose messages Meta refuses (code 10) */
  chatRifiutate: Set<string>
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

/** The fake Graph API's answer to one request. */
function rispondi(u: URL, res: ServerResponse) {
  const manda = (corpo: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(corpo))
  }
  const errore = (code: number, message: string, status = 400, subcode?: number) =>
    manda({ error: { message, code, ...(subcode ? { error_subcode: subcode } : {}) } }, status)

  const troncata = stato.troncate.find((t) => t.volte > 0 && t.quando(u))
  if (troncata) {
    troncata.volte--
    // a 200 announcing a body it never sends whole: the connection drops halfway
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '5000' })
    res.write('{"data":[{"id":"c')
    setTimeout(() => res.destroy(), 10)
    return
  }

  const guasto = stato.guasti.shift()
  if (guasto) return guasto.code ? errore(guasto.code, 'temporaneo', guasto.status) : manda({}, guasto.status)
  if (u.searchParams.get('access_token') !== stato.tokenValido) return errore(190, 'Invalid OAuth access token')

  if (u.pathname === '/refresh_access_token') {
    if (u.searchParams.get('grant_type') !== 'ig_refresh_token') return errore(100, 'grant_type')
    stato.tokenValido = NUOVO
    return manda({ access_token: NUOVO, token_type: 'bearer', expires_in: 5_184_000 })
  }

  const percorso = u.pathname.replace(/^\/v[\d.]+/, '')
  const campi = u.searchParams.get('fields') ?? ''
  if (percorso === '/me') return manda({ ...ACCOUNT, id: 'app1' })
  if (percorso === '/me/conversations') {
    if (u.searchParams.get('platform') !== 'instagram') return errore(100, 'platform')
    if (campi.includes('participants') && stato.partecipantiRifiutati) return errore(100, 'participants not supported')
    const dopo = Number(u.searchParams.get('after') ?? 0)
    const pagina = stato.conv.slice(dopo, dopo + stato.perPagina).map((c) => ({
      id: c.id,
      updated_time: c.updated_time,
      ...(campi.includes('participants')
        ? { participants: { data: [{ username: ACCOUNT.username, id: ACCOUNT.user_id }, { username: c.lead, id: `id_${c.lead}` }] } }
        : {}),
    }))
    const altre = dopo + stato.perPagina < stato.conv.length
    return manda({
      data: pagina,
      paging: {
        cursors: { after: String(dopo + stato.perPagina) },
        // a next URL with the token in it, as Meta writes it: never followed
        ...(altre ? { next: `${base}/SEGUITO-NEXT?access_token=${stato.tokenValido}` } : {}),
      },
    })
  }

  const id = percorso.slice(1)
  if (stato.msgs[id]) {
    if (stato.chatRifiutate.has(id)) return errore(10, 'Application does not have permission for this action')
    if (stato.chatInesistenti.has(id)) {
      return errore(
        100,
        `Unsupported get request. Object with ID '${id}' does not exist, cannot be loaded due to missing permissions, or does not support this operation`,
        400,
        33,
      )
    }
    if (campi.startsWith('messages.limit')) {
      if (stato.annidatoRifiutato) return errore(100, 'nested not supported')
      if (stato.annidatoRiccoRifiutato && campi.includes('shares')) return errore(100, 'Tried accessing nonexisting field (shares)')
      const n = Number(/limit\((\d+)\)/.exec(campi)?.[1] ?? 20)
      return manda({ id, messages: { data: stato.msgs[id].slice(0, n) } })
    }
    if (campi === 'messages') return manda({ id, messages: { data: stato.msgs[id].slice(0, 20).map((m) => ({ id: m.id, created_time: m.created_time })) } })
  }
  const messaggio = Object.values(stato.msgs).flat().find((m) => m.id === id)
  if (messaggio) {
    if (campi.includes('shares') && stato.ricchiRifiutati) return errore(100, 'Tried accessing nonexisting field (shares)')
    return manda(messaggio)
  }
  errore(100, 'Unsupported get request. Object does not exist', 404)
}

afterAll(() => new Promise<void>((chiuso) => server.close(() => chiuso())))

beforeEach(() => {
  stato = {
    tokenValido: TOKEN,
    ...inbox(),
    perPagina: 2,
    partecipantiRifiutati: false,
    annidatoRifiutato: false,
    annidatoRiccoRifiutato: false,
    ricchiRifiutati: false,
    chatInesistenti: new Set(),
    troncate: [],
    ritardoMs: 0,
    inVolo: 0,
    massimoInVolo: 0,
    guasti: [],
    chatRifiutate: new Set(),
    richieste: [],
  }
})

const subito = async () => {}

describe('pulizia del token', () => {
  it('tiene solo il token, comunque sia incollato', () => {
    expect(pulisciToken(`IG_TOKEN="${TOKEN}"\n`)).toBe(TOKEN)
    expect(pulisciToken(` ${TOKEN.slice(0, 20)}\n${TOKEN.slice(20)} `)).toBe(TOKEN)
    expect(pulisciToken(`https://graph.instagram.com/v26.0/me?fields=id&access_token=${TOKEN}&x=1`)).toBe(TOKEN)
    expect(pulisciToken('EAAB123&debug=all')).toBe('EAAB123')
  })

  it('oscura ogni traccia di token in un testo', () => {
    const testo = oscuraToken(`errore su ${base}/me?access_token=${TOKEN}&fields=id, token ${TOKEN}`, TOKEN)
    expect(testo).not.toContain(TOKEN)
    expect(testo).toContain('access_token=[token]')
    expect(oscuraToken(`non so quale: ${NUOVO}`)).not.toContain(NUOVO)
  })

  it('semaforo: al massimo n insieme, gli altri aspettano il loro turno', async () => {
    const limita = semaforo(2)
    let inCorso = 0
    let massimo = 0
    const ordine: number[] = []
    await Promise.all(
      [1, 2, 3, 4, 5].map((x) =>
        limita(async () => {
          inCorso++
          massimo = Math.max(massimo, inCorso)
          await new Promise((r) => setTimeout(r, 5))
          ordine.push(x)
          inCorso--
        }),
      ),
    )
    expect(massimo).toBe(2)
    expect(ordine).toHaveLength(5)
    // a failure frees its place too
    await expect(limita(() => Promise.reject(new Error('no')))).rejects.toThrow('no')
    expect(await limita(async () => 'ok')).toBe('ok')
  })

  it('pool: concorrenza massima e risultati in ordine', async () => {
    let inCorso = 0
    let massimo = 0
    const fatti = await pool([5, 1, 3, 2, 4], 3, async (x) => {
      inCorso++
      massimo = Math.max(massimo, inCorso)
      await new Promise((r) => setTimeout(r, x))
      inCorso--
      return x * 10
    })
    expect(fatti).toEqual([50, 10, 30, 20, 40])
    expect(massimo).toBe(3)
  })
})

describe('Graph API', () => {
  it("l'account e le conversazioni dal giorno prima, solo col cursore", async () => {
    const graph = creaGraph({ token: TOKEN, base, attendi: subito })
    expect(await graph.me()).toEqual({ user_id: ACCOUNT.user_id, username: ACCOUNT.username })
    const { conversazioni, troncato } = await graph.conversazioniDal(new Date('2026-10-05T22:00:00Z'))
    expect(conversazioni.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
    expect(troncato).toBe(false)
    expect(conversazioni[0].participants?.data?.map((p) => p.username)).toContain('lead.uno')
    expect(stato.richieste.some((r) => r.pathname.includes('SEGUITO-NEXT'))).toBe(false)
    expect(stato.richieste.filter((r) => r.pathname.endsWith('/me/conversations')).map((r) => r.searchParams.get('after'))).toEqual([null, '2', '4', '6'])
    expect(stato.richieste.every((r) => r.pathname.startsWith('/v26.0/'))).toBe(true)
  })

  it('senza participants passa al solo updated_time', async () => {
    stato.partecipantiRifiutati = true
    const graph = creaGraph({ token: TOKEN, base, attendi: subito })
    const { conversazioni } = await graph.conversazioniDal(new Date('2026-10-05T22:00:00Z'))
    expect(conversazioni).toHaveLength(6)
    expect(conversazioni[0].participants).toBeUndefined()
    // after the first refusal it does not ask again
    const conParticipants = stato.richieste.filter((r) => (r.searchParams.get('fields') ?? '').includes('participants'))
    expect(conParticipants).toHaveLength(1)
  })

  it('messaggi: annidati, al massimo 20', async () => {
    const graph = creaGraph({ token: TOKEN, base, attendi: subito })
    const lungo = await graph.messaggi('c5')
    expect(lungo.letti).toBe(20)
    expect(lungo.messaggi).toHaveLength(20)
    const corto = await graph.messaggi('c1')
    expect(corto).toMatchObject({ letti: 3 })
    expect(stato.richieste.filter((r) => /^\/v26\.0\/m\d+$/.test(r.pathname))).toHaveLength(0)
  })

  it('messaggi: annidati rifiutati e campi ricchi rifiutati, si legge un messaggio alla volta coi campi base', async () => {
    stato.annidatoRifiutato = true
    stato.ricchiRifiutati = true
    const graph = creaGraph({ token: TOKEN, base, attendi: subito })
    const r = await graph.messaggi('c1')
    expect(r.letti).toBe(3)
    expect(r.messaggi.map((m) => m.created_time)).toEqual(stato.msgs.c1.map((m) => m.created_time))
    const campi = stato.richieste.map((x) => x.searchParams.get('fields'))
    expect(campi).toContain('messages.limit(20){id,created_time,from,to,message,shares}')
    expect(campi).toContain('messages.limit(20){id,created_time,from,to,message}')
    expect(campi).toContain('messages')
    expect(campi).toContain('id,created_time,from,to,message')
    // a second chat goes straight to the way that works
    stato.richieste = []
    await graph.messaggi('c2')
    expect(stato.richieste.map((x) => x.searchParams.get('fields'))).toEqual(['messages', 'id,created_time,from,to,message', 'id,created_time,from,to,message'])
  })

  it('annidati rifiutati solo coi campi ricchi: tre chat insieme scendono di un gradino, mai a un messaggio alla volta', async () => {
    stato.annidatoRiccoRifiutato = true
    const ids = Array.from({ length: 12 }, (_, i) => `k${i}`)
    for (const id of ids) {
      stato.msgs[id] = Array.from({ length: 10 }, (_, j) => nostro('lead_k', `2026-10-07T${String(10 + j)}:00`)).reverse()
    }
    const graph = creaGraph({ token: TOKEN, base, attendi: subito })
    // as the run reads them: three chats at once
    const letti = await pool(ids, CONCORRENZA, (id) => graph.messaggi(id))
    expect(letti.map((l) => l.letti)).toEqual(ids.map(() => 10))
    const campi = stato.richieste.map((r) => r.searchParams.get('fields') ?? '')
    const annidate = campi.filter((c) => c.startsWith('messages.limit'))
    expect(annidate.length).toBeLessThanOrEqual(ids.length + CONCORRENZA)
    expect(campi).not.toContain('messages')
    expect(stato.richieste.filter((r) => /^\/v26\.0\/m\d+$/.test(r.pathname))).toHaveLength(0)
    // from then on, the base way straight away
    expect(annidate.slice(-6)).toEqual(Array(6).fill('messages.limit(20){id,created_time,from,to,message}'))
  })

  it('una chat che Meta dice inesistente (codice 100, subcode 33) fallisce da sola e non cambia il modo delle altre', async () => {
    stato.chatInesistenti.add('c3')
    const graph = creaGraph({ token: TOKEN, base, attendi: subito })
    await expect(graph.messaggi('c3')).rejects.toMatchObject({ tipo: 'meta', code: 100, subcode: 33 })
    // one request only: never the other ways on a chat that is not there
    expect(stato.richieste).toHaveLength(1)
    stato.richieste = []
    for (const id of ['c1', 'c2', 'c5']) await graph.messaggi(id)
    expect(stato.richieste.map((r) => r.searchParams.get('fields'))).toEqual(
      Array(3).fill('messages.limit(20){id,created_time,from,to,message,shares}'),
    )
  })

  it('al massimo 3 richieste insieme, anche leggendo un messaggio alla volta tre chat insieme', async () => {
    stato.annidatoRifiutato = true
    stato.ritardoMs = 5
    const graph = creaGraph({ token: TOKEN, base, attendi: subito })
    const letti = await pool(['c1', 'c2', 'c3', 'c5'], CONCORRENZA, (id) => graph.messaggi(id))
    expect(letti.map((l) => l.letti)).toEqual([3, 2, 2, 20])
    expect(stato.richieste.filter((r) => /^\/v26\.0\/m\d+$/.test(r.pathname)).length).toBe(27)
    expect(stato.massimoInVolo).toBeLessThanOrEqual(3)
  })

  it('una pagina dell’inbox con la risposta 200 interrotta a metà: la riprova, mai una lettura più corta', async () => {
    stato.troncate = [
      { quando: (u) => u.pathname.endsWith('/me/conversations') && u.searchParams.get('after') === '2', volte: 1 },
    ]
    const attese: number[] = []
    const graph = creaGraph({ token: TOKEN, base, attendi: async (ms) => void attese.push(ms) })
    const { conversazioni, troncato } = await graph.conversazioniDal(new Date('2026-10-05T22:00:00Z'))
    expect(conversazioni.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
    expect(troncato).toBe(false)
    expect(attese).toEqual([800])
  })

  it('una risposta 200 che non si legge, se resta: errore di rete, mai una chat vuota', async () => {
    stato.troncate = [{ quando: (u) => u.pathname.endsWith('/c1'), volte: 99 }]
    const graph = creaGraph({ token: TOKEN, base, attendi: subito })
    const errore = await graph.messaggi('c1').catch((e: unknown) => e)
    expect(errore).toMatchObject({ tipo: 'rete' })
    expect((errore as Error).message).not.toContain(TOKEN)
    expect(stato.richieste.filter((r) => r.pathname.endsWith('/c1'))).toHaveLength(3)
  })

  it('riprova su 5xx e sui limiti di Meta, poi riesce', async () => {
    stato.guasti = [{ status: 500 }, { status: 400, code: 4 }]
    const attese: number[] = []
    const graph = creaGraph({ token: TOKEN, base, attendi: async (ms) => void attese.push(ms) })
    expect((await graph.me()).username).toBe(ACCOUNT.username)
    expect(attese).toEqual([1500, 3000])
  })

  it('un limite che resta dopo due riprove: errore di tipo limite', async () => {
    stato.guasti = [{ status: 400, code: 17 }, { status: 400, code: 17 }, { status: 400, code: 17 }]
    const graph = creaGraph({ token: TOKEN, base, attendi: subito })
    await expect(graph.me()).rejects.toMatchObject({ tipo: 'limite', code: 17 })
  })

  it('codice 190: errore del token, con la frase e mai il token', async () => {
    const graph = creaGraph({ token: `IGAAscaduto${'z'.repeat(40)}`, base, attendi: subito })
    const errore = await graph.me().catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(ErroreInstagram)
    expect(errore).toMatchObject({ tipo: 'token', code: 190 })
    expect((errore as Error).message).toContain('Il token è scaduto o non valido')
    expect((errore as Error).message).not.toContain('IGAAscaduto')
    expect(JSON.stringify(errore)).not.toContain('IGAAscaduto')
    expect(JSON.stringify(graph)).not.toContain(TOKEN)
  })

  it('rete non raggiungibile: riprova, poi errore di rete senza indirizzo né token', async () => {
    const attese: number[] = []
    const graph = creaGraph({ token: TOKEN, base: 'http://127.0.0.1:9', attendi: async (ms) => void attese.push(ms) })
    const errore = await graph.me().catch((e: unknown) => e)
    expect(errore).toMatchObject({ tipo: 'rete' })
    expect((errore as Error).message).not.toContain(TOKEN)
    expect((errore as Error).message).not.toContain('127.0.0.1')
    expect(attese).toEqual([800, 1600])
  })

  it('oltre il tempo dato non parte nessuna richiesta', async () => {
    const graph = creaGraph({ token: TOKEN, base, attendi: subito, entro: Date.now() - 1 })
    await expect(graph.me()).rejects.toMatchObject({ tipo: 'tempo' })
    expect(stato.richieste).toHaveLength(0)
  })

  it('nemmeno una richiesta in fila per il suo posto parte dopo il tempo dato', async () => {
    // three chats read one message at a time (the nested messages come without
    // created_time) while Meta hangs on every message until the timeout: the
    // requests waiting for one of the 3 places never start past `entro`
    const partenze: { quando: number; percorso: string }[] = []
    const fetchAppeso: typeof fetch = async (input, init) => {
      const u = new URL(String(input))
      partenze.push({ quando: Date.now(), percorso: u.pathname })
      const campi = u.searchParams.get('fields') ?? ''
      const id = u.pathname.split('/').at(-1) ?? ''
      if (campi.startsWith('messages.limit')) {
        return new Response(JSON.stringify({ id, messages: { data: [{ id: `${id}_1` }, { id: `${id}_2` }, { id: `${id}_3` }] } }))
      }
      if (campi === 'messages') {
        return new Response(JSON.stringify({ id, messages: { data: [{ id: `${id}_1` }, { id: `${id}_2` }, { id: `${id}_3` }] } }))
      }
      // a message: hangs until the request's own timeout
      return new Promise<Response>((_, rifiuta) => {
        init?.signal?.addEventListener('abort', () => rifiuta(init.signal?.reason))
      })
    }
    const entro = Date.now() + 50
    const graph = creaGraph({ token: TOKEN, base, attendi: subito, fetch: fetchAppeso, timeoutMs: 150, entro })
    const errore = await pool(['c1', 'c2', 'c3'], CONCORRENZA, (id) => graph.messaggi(id)).catch((e: unknown) => e)
    expect(errore).toMatchObject({ tipo: 'tempo' })
    // whatever was still queued has had its turn by now
    await new Promise((r) => setTimeout(r, 400))
    const messaggi = partenze.filter((p) => /_\d$/.test(p.percorso))
    expect(messaggi.length).toBeGreaterThan(0)
    expect(messaggi.length).toBeLessThanOrEqual(CONCORRENZA)
    expect(partenze.filter((p) => p.quando > entro)).toEqual([])
  })

  it('rinnovo del token: niente versione, il nuovo token e la scadenza', async () => {
    const prima = Date.now()
    const r = await rinnovaToken({ token: TOKEN, base, attendi: subito })
    expect(r.token).toBe(NUOVO)
    expect(r.scadeIl!.getTime()).toBeGreaterThanOrEqual(prima + 5_184_000_000)
    expect(stato.richieste[0].pathname).toBe('/refresh_access_token')
  })
})

// ---------------------------------------------------------------------------
// The nightly run, against a fake database
// ---------------------------------------------------------------------------
type Collegamento = {
  setter_id: string | null
  account_username: string | null
  account_id: string | null
  token_aggiornato_il: string | null
}

type FintoDb = {
  collegamento: Collegamento
  setter: { ruolo: string; attivo: boolean } | null
  token: string | null
  esclusi: string[]
  /** what instagram_salva_proposta returns: the id, or null for a decided proposal */
  propostaId: string | null
  /**
   * What the admin does to the token while the job saves its refresh (between
   * the read and instagram_token_rinnovato): removes it, or pastes another one
   */
  duranteIlRinnovo: (() => void) | null
  rpc: { nome: string; args: Record<string, unknown> }[]
  aggiornamenti: Record<string, unknown>[]
}

const SETTER = '00000000-0000-4000-8000-000000000002'
let finto: FintoDb

function fintoDb(): Parameters<typeof calcolaReportInstagram>[0]['db'] {
  const risposta = <T>(data: T) => Promise.resolve({ data, error: null })
  const db = {
    from(tabella: string) {
      return {
        select() {
          const dati =
            tabella === 'instagram_collegamento'
              ? finto.collegamento
              : tabella === 'profiles'
                ? finto.setter
                : finto.esclusi.map((username) => ({ username }))
          const query = {
            eq: () => query,
            maybeSingle: () => risposta(dati),
            then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => risposta(dati).then(ok, ko),
          }
          return query
        },
        update(valori: Record<string, unknown>) {
          finto.aggiornamenti.push(valori)
          return { eq: () => risposta(null) }
        },
      }
    },
    rpc(nome: string, args: Record<string, unknown> = {}) {
      finto.rpc.push({ nome, args })
      if (nome === 'instagram_token') return risposta(finto.token)
      if (nome === 'instagram_token_rinnovato') {
        finto.duranteIlRinnovo?.()
        // as Vault does: only in place of the token that was refreshed
        if (finto.token === null || finto.token !== args.p_vecchio) return risposta(false)
        finto.token = String(args.p_token)
        return risposta(true)
      }
      if (nome === 'instagram_salva_proposta') return risposta(finto.propostaId)
      return risposta(null)
    },
  }
  return db as unknown as Parameters<typeof calcolaReportInstagram>[0]['db']
}

const chiamate = (nome: string) => finto.rpc.filter((r) => r.nome === nome)
let log: string[] = []

beforeEach(() => {
  finto = {
    collegamento: {
      setter_id: SETTER,
      account_username: ACCOUNT.username,
      account_id: ACCOUNT.user_id,
      token_aggiornato_il: '2026-10-05T10:00:00Z',
    },
    setter: { ruolo: 'setter', attivo: true },
    token: TOKEN,
    esclusi: ['loris_explore', 'danymonta.raw'],
    propostaId: 'p1',
    duranteIlRinnovo: null,
    rpc: [],
    aggiornamenti: [],
  }
  log = []
  for (const livello of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, livello).mockImplementation((...args: unknown[]) => void log.push(JSON.stringify(args)))
  }
})

afterEach(() => vi.restoreAllMocks())

function calcola(extra: Partial<Parameters<typeof calcolaReportInstagram>[0]> = {}) {
  return calcolaReportInstagram({ db: fintoDb(), giorno: D, adesso: ADESSO, graph: { base, attendi: subito }, ...extra })
}

const ATTESI = {
  p_setter: SETTER,
  p_data: D,
  p_dm_outbound: 1,
  p_dm_inbound: 1,
  p_follow_up: 1,
  p_conversazioni: 2,
  p_call_proposte: 1,
  p_chat_lette: 4,
  p_chat_incerte: 1,
}

/** Nothing of a lead or of the token in what comes back or in the logs. */
function senzaDatiSensibili(esito: unknown) {
  const tutto = JSON.stringify(esito) + log.join('\n') + JSON.stringify(finto.rpc.filter((r) => r.nome !== 'instagram_token_rinnovato'))
  for (const segreto of [TOKEN, NUOVO, INCOLLATO, 'lead.uno', 'lead_due', 'lead_tre', 'lead_cinque', 'loris_explore', 'messaggio di prova', 'calendly']) {
    expect(tutto).not.toContain(segreto)
  }
}

describe('la proposta della notte', () => {
  it('conta il giorno e salva la proposta del setter collegato', async () => {
    const esito = await calcola()
    expect(esito).toEqual({
      ok: true,
      giorno: D,
      proposta: 'salvata',
      chat_lette: 4,
      chat_incerte: 1,
      chat_non_lette: 0,
      token_rinnovato: false,
    })
    const salvate = chiamate('instagram_salva_proposta')
    expect(salvate).toHaveLength(1)
    // discovery_prenotate: the database counts the setter's calls of the day
    expect(salvate[0].args).toEqual(ATTESI)
    expect(chiamate('instagram_errore')).toHaveLength(0)
    expect(finto.aggiornamenti).toHaveLength(0)
    senzaDatiSensibili(esito)
  })

  it('con tutti i ripieghi di Meta (participants, annidati, campi ricchi) i numeri sono gli stessi', async () => {
    stato.partecipantiRifiutati = true
    stato.annidatoRifiutato = true
    stato.ricchiRifiutati = true
    const esito = await calcola()
    expect(esito).toMatchObject({ ok: true, chat_lette: 4, chat_incerte: 1 })
    // the excluded account found from the messages, without participants
    expect(chiamate('instagram_salva_proposta')[0].args).toEqual(ATTESI)
    senzaDatiSensibili(esito)
  })

  it('riprova da sola sugli errori temporanei', async () => {
    stato.guasti = [{ status: 503 }, { status: 400, code: 613 }]
    expect(await calcola()).toMatchObject({ ok: true, proposta: 'salvata' })
    expect(chiamate('instagram_salva_proposta')[0].args).toEqual(ATTESI)
  })

  it("una proposta già decisa dal setter resta com'è", async () => {
    finto.propostaId = null
    expect(await calcola()).toMatchObject({ ok: true, proposta: 'gia_decisa' })
  })

  it("registra l'account che dice /me se è cambiato", async () => {
    finto.collegamento.account_username = null
    finto.collegamento.account_id = null
    await calcola()
    expect(finto.aggiornamenti).toEqual([{ account_username: ACCOUNT.username, account_id: ACCOUNT.user_id }])
  })

  it('una chat che Instagram rifiuta: tra le incerte, il resto si conta', async () => {
    stato.chatRifiutate.add('c3')
    const esito = await calcola()
    expect(esito).toMatchObject({ ok: true, chat_lette: 4, chat_incerte: 2, chat_non_lette: 1 })
    expect(chiamate('instagram_salva_proposta')[0].args).toMatchObject({ p_follow_up: 0, p_chat_lette: 4, p_chat_incerte: 2 })
  })

  it('token di più di 7 giorni: lo rinnova, lo salva e continua col nuovo', async () => {
    finto.collegamento.token_aggiornato_il = '2026-09-28T10:00:00Z'
    const esito = await calcola()
    expect(esito).toMatchObject({ ok: true, token_rinnovato: true })
    const rinnovo = chiamate('instagram_token_rinnovato')
    expect(rinnovo).toHaveLength(1)
    expect(rinnovo[0].args).toMatchObject({ p_vecchio: TOKEN, p_token: NUOVO })
    expect(finto.token).toBe(NUOVO)
    expect(Date.parse(String(rinnovo[0].args.p_scade_il))).toBeGreaterThan(Date.now() + 59 * 86_400_000)
    // after the refresh every request carries the new token
    const dopo = stato.richieste.slice(stato.richieste.findIndex((r) => r.pathname === '/refresh_access_token') + 1)
    expect(dopo.length).toBeGreaterThan(0)
    expect(dopo.every((r) => r.searchParams.get('access_token') === NUOVO)).toBe(true)
    senzaDatiSensibili(esito)
  })

  it("token tolto dall'admin durante il rinnovo: si ferma, il token non torna", async () => {
    finto.collegamento.token_aggiornato_il = null
    finto.duranteIlRinnovo = () => {
      finto.token = null
    }
    const esito = await calcola()
    expect(esito).toMatchObject({ ok: false, motivo: 'senza_token' })
    expect(finto.token).toBeNull()
    expect(chiamate('instagram_salva_proposta')).toHaveLength(0)
    expect(stato.richieste.map((r) => r.pathname)).toEqual(['/refresh_access_token'])
  })

  it("token nuovo incollato dall'admin durante il rinnovo: il rinnovo del vecchio non lo copre, il giro continua col nuovo", async () => {
    finto.collegamento.token_aggiornato_il = '2026-09-28T10:00:00Z'
    finto.duranteIlRinnovo = () => {
      finto.token = INCOLLATO
      // the old account's token no longer reads: only the pasted one does
      stato.tokenValido = INCOLLATO
    }
    const esito = await calcola()
    expect(esito).toMatchObject({ ok: true, proposta: 'salvata', token_rinnovato: false })
    expect(finto.token).toBe(INCOLLATO)
    expect(chiamate('instagram_token_rinnovato')[0].args).toMatchObject({ p_vecchio: TOKEN, p_token: NUOVO })
    // Vault read again after the refresh was refused
    expect(chiamate('instagram_token')).toHaveLength(2)
    const dopo = stato.richieste.slice(stato.richieste.findIndex((r) => r.pathname === '/refresh_access_token') + 1)
    expect(dopo.length).toBeGreaterThan(0)
    expect(dopo.every((r) => r.searchParams.get('access_token') === INCOLLATO)).toBe(true)
    expect(chiamate('instagram_salva_proposta')[0].args).toEqual(ATTESI)
    senzaDatiSensibili(esito)
  })

  it("token scaduto (190): nessuna proposta, la frase per l'admin senza il token", async () => {
    stato.tokenValido = 'un-altro-token-valido-per-meta'
    const esito = await calcola()
    expect(esito).toEqual({ ok: false, giorno: D, motivo: 'token', errore: FRASI_ERRORE.token })
    expect(chiamate('instagram_salva_proposta')).toHaveLength(0)
    const errori = chiamate('instagram_errore')
    expect(errori).toHaveLength(1)
    expect(errori[0].args.p_messaggio).toBe(FRASI_ERRORE.token)
    senzaDatiSensibili(esito)
  })

  it('rete giù: errore di rete registrato, mai lanciato', async () => {
    const esito = await calcola({ graph: { base: 'http://127.0.0.1:9', attendi: subito } })
    expect(esito).toMatchObject({ ok: false, motivo: 'rete', errore: FRASI_ERRORE.rete })
    expect(chiamate('instagram_errore')[0].args.p_messaggio).toBe(FRASI_ERRORE.rete)
    senzaDatiSensibili(esito)
  })

  it('una chat che Meta dice inesistente: tra le incerte, le altre lette come sempre', async () => {
    stato.chatInesistenti.add('c3')
    const esito = await calcola()
    expect(esito).toMatchObject({ ok: true, chat_lette: 4, chat_incerte: 2, chat_non_lette: 1 })
    expect(chiamate('instagram_salva_proposta')[0].args).toMatchObject({ p_follow_up: 0, p_chat_lette: 4, p_chat_incerte: 2 })
    expect(stato.richieste.filter((r) => /^\/v26\.0\/m\d+$/.test(r.pathname))).toHaveLength(0)
  })

  it('una chat con la risposta interrotta a metà, che non torna: nessuna proposta, errore di rete', async () => {
    stato.troncate = [{ quando: (u) => u.pathname.endsWith('/c2'), volte: 99 }]
    const esito = await calcola()
    expect(esito).toMatchObject({ ok: false, motivo: 'rete', errore: FRASI_ERRORE.rete })
    expect(chiamate('instagram_salva_proposta')).toHaveLength(0)
    senzaDatiSensibili(esito)
  })

  it('limiti di Meta che non passano: si ferma', async () => {
    stato.guasti = Array.from({ length: 3 }, () => ({ status: 400, code: 32 }))
    expect(await calcola()).toMatchObject({ ok: false, motivo: 'limite', errore: FRASI_ERRORE.limite })
    expect(chiamate('instagram_salva_proposta')).toHaveLength(0)
  })

  it("senza token, senza setter o con un setter non più attivo: lo dice all'admin", async () => {
    finto.token = null
    expect(await calcola()).toMatchObject({ ok: false, motivo: 'senza_token' })
    expect(chiamate('instagram_errore').at(-1)?.args.p_messaggio).toBe(FRASI_ERRORE.senza_token)

    finto.token = TOKEN
    finto.collegamento.setter_id = null
    expect(await calcola()).toMatchObject({ ok: false, motivo: 'senza_setter' })

    finto.collegamento.setter_id = SETTER
    finto.setter = { ruolo: 'setter', attivo: false }
    expect(await calcola()).toMatchObject({ ok: false, motivo: 'setter_non_attivo' })
    expect(chiamate('instagram_salva_proposta')).toHaveLength(0)
    expect(stato.richieste).toHaveLength(0)
  })

  it('senza setter, o con un setter non più attivo, il token si rinnova lo stesso e i DM non si leggono', async () => {
    finto.collegamento.token_aggiornato_il = '2026-09-29T10:00:00Z'
    finto.collegamento.setter_id = null
    expect(await calcola()).toMatchObject({ ok: false, motivo: 'senza_setter' })
    expect(chiamate('instagram_token_rinnovato')).toHaveLength(1)
    expect(chiamate('instagram_token_rinnovato')[0].args.p_token).toBe(NUOVO)
    expect(stato.richieste.map((r) => r.pathname)).toEqual(['/refresh_access_token'])

    // Vault holds the new one now
    finto.token = NUOVO
    finto.rpc = []
    stato.richieste = []
    finto.collegamento.setter_id = SETTER
    finto.setter = { ruolo: 'setter', attivo: false }
    expect(await calcola()).toMatchObject({ ok: false, motivo: 'setter_non_attivo' })
    expect(chiamate('instagram_token_rinnovato')).toHaveLength(1)
    expect(stato.richieste.map((r) => r.pathname)).toEqual(['/refresh_access_token'])
    expect(chiamate('instagram_salva_proposta')).toHaveLength(0)
  })

  it('solo un giorno finito della settimana: oggi, il futuro o un giorno vecchio no, senza registrare errori', async () => {
    for (const giorno of ['2026-10-08', '2026-10-09', '2026-09-30', 'ieri']) {
      expect(await calcola({ giorno })).toMatchObject({ ok: false, motivo: 'giorno' })
    }
    expect(await calcola({ giorno: '2026-10-01' })).toMatchObject({ ok: true })
    expect(chiamate('instagram_errore')).toHaveLength(0)
  })

  it('tempo finito: nessuna proposta', async () => {
    const esito = await calcola({ entro: Date.now() - 1 })
    expect(esito).toMatchObject({ ok: false, motivo: 'tempo', errore: FRASI_ERRORE.tempo })
    expect(chiamate('instagram_salva_proposta')).toHaveLength(0)
  })
})
