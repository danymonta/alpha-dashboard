import Anthropic from '@anthropic-ai/sdk'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { creaClaudeFinto } from '../e2e/claude-finto.mjs'
import type { BloccoSalvato, ChatSalvata, EsitoBlocco, PayloadBlocco, SchedaSalvata } from '@/lib/insight/contratti'
import { pianificaBlocchi } from '@/lib/insight/blocchi'
import { applicaCorrezioni, daCorreggere } from '@/lib/insight/controllo-finale'
import {
  BETA_FALLBACK,
  classificaErrore,
  eseguiBlocco,
  eseguiInPool,
  MINIMO_PER_INIZIARE_MS,
  schedeDelBlocco,
  schedeDellAgenda,
  TIMEOUT_TENTATIVO_MS,
  type RisultatoBloccoAgenda,
  type RisultatoBloccoCorrezione,
  type RisultatoBloccoSchede,
  type RisultatoBloccoSintesi,
} from '@/lib/insight/esegui'
import { improntaChat } from '@/lib/insight/impronta'
import {
  chatPerAnalisi,
  contestoGiornoDati,
  payloadAgenda,
  payloadChat,
  payloadCorrezione,
  payloadSintesi,
  type ContestoGiornoDati,
} from '@/lib/insight/prompt/dati'
import { leggiRecap } from '@/lib/insight/recap'
import { uniscRecap } from '@/lib/insight/unione'
import { chatFinta, msg, postFinto, voceAgendaFinta } from './fixture-insight'

// One block of the analysis against the fake Anthropic server (e2e/claude-finto.mjs),
// started in process: never api.anthropic.com. Invented chats only.

type Finto = {
  url: string
  chiudi: () => Promise<void>
  ultime: () => { corpo: Record<string, unknown>; beta: string | null }[]
  azzera: () => void
}

let finto: Finto
let client: Anthropic

beforeAll(async () => {
  finto = (await creaClaudeFinto({ lentoMs: 400 })) as Finto
  client = new Anthropic({ apiKey: 'finta', authToken: null, baseURL: finto.url, maxRetries: 0, timeout: TIMEOUT_TENTATIVO_MS })
})

afterAll(async () => {
  await finto.chiudi()
})

beforeEach(() => {
  finto.azzera()
  vi.stubEnv('INSIGHT_MODEL', '')
  vi.stubEnv('INSIGHT_EFFORT', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const adesso = new Date('2026-10-14T16:45:00.000Z')
const contesto: ContestoGiornoDati = contestoGiornoDati({ canale: 'instagram', giorno: '2026-10-14', adesso, media: [], agenda: [] })

function chatCon(testo: string, extra: Partial<ChatSalvata> = {}): ChatSalvata {
  return chatFinta({ messaggi: [msg('alpha', '2026-10-14T08:00:00.000Z', 'Che obiettivo hai?'), msg('lead', '2026-10-14T09:00:00.000Z', testo)], ...extra })
}

function payloadDi(chats: ChatSalvata[]): PayloadBlocco {
  return payloadChat({
    passo: 'schede',
    canale: 'instagram',
    contesto,
    media: [],
    chat: chats.map((chat) => chatPerAnalisi({ chat, profilo: null, statoLead: [], agenda: [], adesso })),
  })
}

function blocco(chiavi: string[] = [], tipo: BloccoSalvato['tipo'] = 'schede'): BloccoSalvato {
  return { id: 'blocco-1', esecuzione_id: 'run-1', canale: 'instagram', tipo, indice: 0, chiavi, stato: 'in_corso', tentativi: 0 }
}

async function esegui<T>(payload: PayloadBlocco, op: { scadenza?: number; segnale?: AbortSignal; client?: Anthropic } = {}): Promise<EsitoBlocco<T>> {
  return eseguiBlocco<T>({
    client: op.client ?? client,
    blocco: blocco(),
    payload,
    scadenza: op.scadenza ?? Date.now() + 240_000,
    segnale: op.segnale ?? new AbortController().signal,
  })
}

const richieste = () => finto.ultime()

describe('the request', () => {
  it('model, effort medium, structured output, server-side fallback, no thinking, no sampling, streaming', async () => {
    const chats = [chatCon('Perdere la pancia, ho 31 anni'), chatCon('Mettere massa')]
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi(chats))
    expect(esito.ok).toBe(true)
    const [{ corpo, beta }] = richieste()
    expect(corpo.model).toBe('claude-sonnet-5-5')
    expect(corpo.max_tokens).toBe(32_000)
    expect(corpo.stream).toBe(true)
    expect(corpo.output_config).toMatchObject({ effort: 'medium', format: { type: 'json_schema' } })
    expect(corpo.fallbacks).toBe('default')
    expect(beta).toContain(BETA_FALLBACK)
    for (const vietato of ['thinking', 'temperature', 'top_p', 'top_k', 'tools', 'tool_choice']) expect(corpo[vietato]).toBeUndefined()
    const system = corpo.system as { cache_control?: unknown }[]
    expect(system).toHaveLength(6)
    expect(system.at(-1)?.cache_control).toEqual({ type: 'ephemeral' })
    const contenuto = (corpo.messages as { content: { text: string; cache_control?: unknown }[] }[])[0].content
    expect(contenuto[0].text.startsWith('<contesto_giorno>')).toBe(true)
    expect(contenuto[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(contenuto[1].cache_control).toBeUndefined()
  })

  it('the cards come back on their conversation ids, with the usage and the model', async () => {
    const chats = [chatCon('Perdere la pancia, ho 31 anni'), chatCon('Mettere massa [[non-lead]]')]
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi(chats))
    if (!esito.ok) throw new Error(esito.errore)
    expect(esito.risultato.schede.map((s) => [s.chiave, s.dati.tipo])).toEqual([
      [chats[0].conversazione_id, 'lead'],
      [chats[1].conversazione_id, 'non_lead'],
    ])
    expect(esito.risultato.mancanti).toEqual([])
    expect(esito.modello).toBe('claude-sonnet-5-5')
    expect(esito.servito_da_fallback).toBe(false)
    expect(esito.usage.cache_creation_input_tokens).toBeGreaterThan(0)
    expect(esito.request_id).toMatch(/^req_finto_/u)
    // the second request reads the system prompt from the cache
    const secondo = await esegui<RisultatoBloccoSchede>(payloadDi([chatCon('Altro')]))
    if (!secondo.ok) throw new Error(secondo.errore)
    expect(secondo.usage.cache_read_input_tokens).toBeGreaterThan(0)
  })

  it('the client never retries: each attempt has maxRetries 0 and min(150 s, deadline - 15 s)', async () => {
    const spia = vi.spyOn(client.beta.messages, 'stream')
    await esegui(payloadDi([chatCon('ciao')]), { scadenza: Date.now() + 70_000 })
    const opzioni = spia.mock.calls[0][1] as { maxRetries: number; timeout: number; signal: AbortSignal }
    expect(opzioni.maxRetries).toBe(0)
    expect(opzioni.timeout).toBeLessThanOrEqual(55_000)
    expect(opzioni.timeout).toBeGreaterThan(54_000)
    expect(opzioni.signal).toBeInstanceOf(AbortSignal)
    await esegui(payloadDi([chatCon('ciao')]))
    expect((spia.mock.calls[1][1] as { timeout: number }).timeout).toBe(TIMEOUT_TENTATIVO_MS)
  })

  it('a served fallback: the text after the fallback block, flagged', async () => {
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi([chatCon('ciao [[fallback]]')]))
    if (!esito.ok) throw new Error(esito.errore)
    expect(esito.risultato.schede).toHaveLength(1)
    expect(esito.servito_da_fallback).toBe(true)
    expect(esito.modello).toBe('claude-sonnet-5')
  })
})

describe('what goes wrong', () => {
  it('a 429 with retry-after 0: one more attempt, then the cards', async () => {
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi([chatCon('ciao [[429]]')]))
    expect(esito.ok).toBe(true)
    expect(richieste()).toHaveLength(2)
  })

  it('max_tokens splits the block: the cut chat alone gets a placeholder, the others their cards', async () => {
    const chats = [chatCon('uno'), chatCon('due [[tronca]]'), chatCon('tre'), chatCon('quattro')]
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi(chats))
    if (!esito.ok) throw new Error(esito.errore)
    expect(esito.risultato.schede.map((s) => s.chiave).sort()).toEqual([chats[0], chats[2], chats[3]].map((c) => c.conversazione_id).sort())
    expect(esito.risultato.mancanti).toEqual([{ chiave: chats[1].conversazione_id, motivo: 'max_tokens' }])
  })

  it('a refusal is isolated: split until the refused chat is alone', async () => {
    const chats = [chatCon('uno'), chatCon('due'), chatCon('tre [[rifiuto]]'), chatCon('quattro'), chatCon('cinque')]
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi(chats))
    if (!esito.ok) throw new Error(esito.errore)
    expect(esito.risultato.schede).toHaveLength(4)
    expect(esito.risultato.mancanti).toEqual([{ chiave: chats[2].conversazione_id, motivo: 'refusal:general_harms' }])
  })

  it('a broken JSON is retried once, then the code `json`, never the model\'s text', async () => {
    const chat = chatCon('ciao [[json-rotto]]')
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi([chat]))
    if (!esito.ok) throw new Error(esito.errore)
    expect(richieste()).toHaveLength(2)
    expect(esito.risultato.mancanti).toEqual([{ chiave: chat.conversazione_id, motivo: 'json' }])
    const righe = schedeDelBlocco('schede', esito.risultato, new Map())
    expect(righe[0]).toMatchObject({ tipo: 'lead', chiave: chat.conversazione_id, dati: { analisi_mancante: true, motivo: 'json' } })
    expect(righe[0].impronta).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('a ref the answer forgot runs again once, then a placeholder', async () => {
    const chats = [chatCon('uno'), chatCon('due [[salta]]')]
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi(chats))
    if (!esito.ok) throw new Error(esito.errore)
    expect(richieste()).toHaveLength(2)
    expect(esito.risultato.schede.map((s) => s.chiave)).toEqual([chats[0].conversazione_id])
    expect(esito.risultato.mancanti).toEqual([{ chiave: chats[1].conversazione_id, motivo: 'schema' }])
  })

  it('a wrong key stops the run', async () => {
    const sbagliato = new Anthropic({ apiKey: 'sbagliata', authToken: null, baseURL: finto.url, maxRetries: 0 })
    const esito = await esegui(payloadDi([chatCon('ciao')]), { client: sbagliato })
    expect(esito).toMatchObject({ ok: false, errore: 'autenticazione', esito: 'fatale' })
  })

  it('a step of one request with a broken answer fails with its code only', async () => {
    const lead = chatFinta({ username: 'lead_rotto', messaggi: [msg('lead', '2026-10-14T09:00:00.000Z', 'ci sono [[json-rotto]]')] })
    const voce = voceAgendaFinta({ username: 'lead_rotto' })
    const payload = payloadAgenda({ contesto, voci: [voce], chat: [lead], adesso })
    const esito = await esegui<RisultatoBloccoAgenda>(payload)
    expect(esito).toMatchObject({ ok: false, errore: 'json', esito: 'fallito' })
    expect(JSON.stringify(esito)).not.toContain('call')
  })
})

describe('what an interruption keeps', () => {
  /** A client whose n-th request is the stub's, the others the fake server's. */
  function clienteConStub(stub: Record<number, () => unknown>): { client: Anthropic; chiamate: () => number } {
    let n = 0
    const proxy = {
      beta: {
        messages: {
          stream: (corpo: unknown, opz: unknown) => {
            n++
            const sostituto = stub[n]
            return sostituto ? sostituto() : (client.beta.messages.stream as (c: unknown, o: unknown) => unknown)(corpo, opz)
          },
        },
      },
    }
    return { client: proxy as unknown as Anthropic, chiamate: () => n }
  }
  const limite = (retryAfter?: string) =>
    new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'Troppe richieste' } }, 'x', new Headers(retryAfter === undefined ? {} : { 'retry-after': retryAfter }))
  const flusso = (errore: Error, usage?: Record<string, number>) => ({
    on: () => undefined,
    finalMessage: () => Promise.reject(errore),
    currentMessage: usage ? { usage } : undefined,
    request_id: null,
  })

  it('a block split in halves keeps the cards of the first half when the second is interrupted', async () => {
    const chats = [chatCon('uno'), chatCon('due'), chatCon('tre'), chatCon('quattro [[tronca]]')]
    // 1: all four, cut (max_tokens) → split; 2: the first half, answered; 3: the second half, a long rate limit
    const { client: c } = clienteConStub({ 3: () => flusso(limite('30')) })
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi(chats), { client: c })
    if (esito.ok) throw new Error('doveva essere interrotto')
    expect(esito).toMatchObject({ errore: 'rate_limit', esito: 'da_rifare' })
    const parziale = esito.parziale as RisultatoBloccoSchede
    expect(parziale.schede.map((v) => v.chiave).sort()).toEqual([chats[0], chats[1]].map((x) => x.conversazione_id).sort())
    expect(parziale.mancanti).toEqual([])
  })

  it('a forgotten ref that runs again keeps the first answer when the second is interrupted', async () => {
    const chats = [chatCon('uno'), chatCon('due [[salta]]')]
    const { client: c } = clienteConStub({ 2: () => flusso(limite('30')) })
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi(chats), { client: c })
    if (esito.ok) throw new Error('doveva essere interrotto')
    expect((esito.parziale as RisultatoBloccoSchede).schede.map((v) => v.chiave)).toEqual([chats[0].conversazione_id])
  })

  it('a stream that breaks is still billed for what it had produced', async () => {
    const chat = chatCon('uno')
    const { client: c } = clienteConStub({
      1: () => flusso(limite('30'), { input_tokens: 1200, cache_read_input_tokens: 9000, output_tokens: 310 }),
    })
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi([chat]), { client: c })
    if (esito.ok) throw new Error('doveva essere interrotto')
    expect(esito.usage).toEqual({ input_tokens: 1200, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 310 })
  })

  it('a 429 without retry-after is an unknown wait: no immediate second attempt', async () => {
    expect(classificaErrore(limite())).toMatchObject({ codice: 'rate_limit', ritentabile: false, attesaMs: Number.POSITIVE_INFINITY })
    expect(classificaErrore(limite(''))).toMatchObject({ ritentabile: false })
    expect(classificaErrore(limite('0'))).toMatchObject({ ritentabile: true, attesaMs: 0 })
    expect(classificaErrore(limite('4'))).toMatchObject({ ritentabile: true, attesaMs: 4000 })
    const { client: c, chiamate } = clienteConStub({ 1: () => flusso(limite()), 2: () => flusso(limite()) })
    const esito = await esegui<RisultatoBloccoSchede>(payloadDi([chatCon('uno')]), { client: c })
    expect(esito.ok).toBe(false)
    expect(chiamate()).toBe(1)
  })

  it('the pool hands over what a rate-limited block spent and validated before it goes back to the queue', async () => {
    const uso = { input_tokens: 7, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 3 }
    let prima = true
    const rimessi: EsitoBlocco<unknown>[] = []
    await eseguiInPool({
      blocchi: ['a'],
      concorrenza: 1,
      entro: Date.now() + 240_000,
      primoDaSolo: false,
      esegui: async () => {
        if (prima) {
          prima = false
          return { ok: false, errore: 'rate_limit', esito: 'da_rifare', usage: uso, parziale: { schede: [], mancanti: [] } }
        }
        return { ok: true, risultato: {}, usage: uso, servito_da_fallback: false, modello: 'claude-sonnet-5-5', request_id: null }
      },
      alRimesso: (_blocco, esito) => {
        rimessi.push(esito)
      },
    })
    expect(rimessi).toHaveLength(1)
    expect(rimessi[0]).toMatchObject({ ok: false, usage: uso })
  })
})

describe('time (C3)', () => {
  it('no request starts with less than 60 s left', async () => {
    const esito = await esegui(payloadDi([chatCon('ciao')]), { scadenza: Date.now() + MINIMO_PER_INIZIARE_MS - 1_000 })
    expect(esito).toMatchObject({ ok: false, errore: 'timeout', esito: 'da_rifare' })
    expect(richieste()).toHaveLength(0)
  })

  it('a slow answer is aborted at the deadline and the block goes back to da_fare', async () => {
    const controllo = new AbortController()
    setTimeout(() => controllo.abort(), 100)
    const inizio = Date.now()
    const esito = await esegui(payloadDi([chatCon('ciao [[lento]]')]), { scadenza: Date.now() + 70_000, segnale: controllo.signal })
    expect(esito).toMatchObject({ ok: false, errore: 'timeout', esito: 'da_rifare' })
    expect(Date.now() - inizio).toBeLessThan(2_000)
  })
})

describe('the other steps', () => {
  it('agenda: the cards of today\'s calls and yesterday\'s, with the Messenger PSID from code', async () => {
    const ig = chatFinta({ username: 'lead_agenda', messaggi: [msg('lead', '2026-10-13T09:00:00.000Z', 'ci vediamo domani')] })
    const fb = chatFinta({ canale: 'messenger', username: null, utente_id: '9090', nome: 'Nome Messenger', messaggi: [msg('lead', '2026-10-13T09:00:00.000Z', 'ok')] })
    const oggi = voceAgendaFinta({ username: 'lead_agenda', no_show_precedenti: 1 })
    const domani = voceAgendaFinta({ giorno: 'domani', username: null, nome: 'Nome Messenger', programmata_il: '2026-10-15T16:00:00.000Z' })
    const ieri = voceAgendaFinta({ giorno: 'ieri', stato: 'no_show', programmata_il: '2026-10-13T17:00:00.000Z' })
    const esito = await esegui<RisultatoBloccoAgenda>(payloadAgenda({ contesto, voci: [oggi, domani, ieri], chat: [ig, fb], adesso }))
    if (!esito.ok) throw new Error(esito.errore)
    expect(esito.risultato.call.map((c) => [c.chiave, c.dati.status, c.dati.user_id])).toEqual([
      [oggi.call_id, 'a rischio', null],
      [domani.call_id, 'promemoria da inviare', '9090'],
    ])
    expect(esito.risultato.show_up.map((s) => s.chiave)).toEqual([ieri.call_id])
  })

  it('sintesi: themes by topic, posts by shortcode', async () => {
    const chats = [chatCon('poco tempo'), chatCon('pancia')]
    const schede = chats.map((c) => ({
      tipo: 'lead' as const,
      chiave: c.conversazione_id,
      impronta: 'e'.repeat(64),
      dati: { tipo: 'lead', priority: 'alta', stage: 'obiettivi', target: 'si', topics: ['poco tempo', 'pancia'], status: '', situation: '', pain: '' },
    }))
    const payload = payloadSintesi({
      canale: 'instagram',
      contesto,
      chat: chats,
      schede,
      statoLead: [],
      esclusi: { instagram: new Set(), messenger: new Set() },
      media: [],
      sommario: { conversazioni: 2, lead_in_target: 2 },
    })
    const esito = await esegui<RisultatoBloccoSintesi>(payload)
    if (!esito.ok) throw new Error(esito.errore)
    expect(esito.risultato.headline).toContain('2 chat')
    expect(esito.risultato.themes.flatMap((t) => t.temi).sort()).toEqual(['pancia', 'poco tempo'])
    expect(esito.risultato.ideas).toHaveLength(5)
  })
})

describe('the pool', () => {
  const ok = (): EsitoBlocco<unknown> => ({
    ok: true,
    risultato: {},
    usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 },
    servito_da_fallback: false,
    modello: 'claude-sonnet-5-5',
    request_id: null,
  })

  it('a rate limit halves the pool for the rest of the run and the block goes back to the queue once', async () => {
    let attivi = 0
    let massimo = 0
    const visti: string[] = []
    const limitato = new Set(['b'])
    const pool = await eseguiInPool({
      blocchi: ['a', 'b', 'c', 'd', 'e', 'f'],
      concorrenza: 4,
      entro: Date.now() + 240_000,
      primoDaSolo: false,
      esegui: async (b) => {
        attivi++
        massimo = Math.max(massimo, attivi)
        visti.push(b)
        await new Promise((r) => setTimeout(r, 20))
        attivi--
        if (limitato.has(b)) {
          limitato.delete(b)
          return { ok: false, errore: 'rate_limit', esito: 'da_rifare', usage: null }
        }
        return ok()
      },
    })
    expect(pool.concorrenza).toBe(2)
    expect(visti.filter((b) => b === 'b')).toHaveLength(2)
    expect(pool.esiti.map((e) => e.blocco).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(pool.esiti.every((e) => e.esito.ok)).toBe(true)
    expect(massimo).toBeLessThanOrEqual(4)
  })

  it('gating: the others start only after the first block\'s first stream event', async () => {
    const inizi: number[] = []
    let primoEvento = 0
    const chats = ['a', 'b', 'c'].map((t) => chatCon(t === 'a' ? 'primo [[lento]]' : t))
    const pool = await eseguiInPool({
      blocchi: chats,
      concorrenza: 3,
      entro: Date.now() + 240_000,
      esegui: (chat, alPrimoEvento) => {
        inizi.push(Date.now())
        return eseguiBlocco({
          client,
          blocco: blocco([chat.conversazione_id]),
          payload: payloadDi([chat]),
          scadenza: Date.now() + 240_000,
          segnale: new AbortController().signal,
          alPrimoEvento: () => {
            if (!primoEvento) primoEvento = Date.now()
            alPrimoEvento()
          },
        })
      },
    })
    expect(pool.esiti.every((e) => e.esito.ok)).toBe(true)
    expect(primoEvento).toBeGreaterThan(0)
    expect(inizi[1]).toBeGreaterThanOrEqual(primoEvento)
    expect(inizi[1] - inizi[0]).toBeGreaterThanOrEqual(350)
  })

  it('nothing starts with less than 60 s left, nothing after a fatal outcome', async () => {
    const tardi = await eseguiInPool({ blocchi: ['a'], concorrenza: 2, entro: Date.now() + 30_000, esegui: async () => ok() })
    expect(tardi.nonIniziati).toEqual(['a'])
    const fatale = await eseguiInPool({
      blocchi: ['a', 'b', 'c'],
      concorrenza: 1,
      entro: Date.now() + 240_000,
      esegui: async (b) => (b === 'a' ? { ok: false, errore: 'autenticazione', esito: 'fatale', usage: null } : ok()),
    })
    expect(fatale.fatale).toMatchObject({ errore: 'autenticazione' })
    expect(fatale.nonIniziati).toEqual(['b', 'c'])
  })
})

describe('the whole AI layer on invented chats', () => {
  it('blocks, pool, cards, correction, agenda, sintesi and the document', async () => {
    const media = [postFinto('ReelFinto01', '2026-10-12T09:00:00.000Z', { didascalia: 'Due ore a settimana. Il resto è costanza.' })]
    const chats = [
      chatCon('Ho 31 anni, voglio perdere la pancia', { username: 'lead_uno' }),
      chatCon('Ho visto il tuo reel sulle due ore [[post-ref:1]]', { username: 'lead_due' }),
      chatCon('Siamo un brand [[non-lead]]', { username: 'brand_finto' }),
      chatCon('Ho 13 anni [[eta:13]]', { username: 'lead_piccolo' }),
      chatCon('Mandami un link [[link-estraneo]]', { username: 'lead_link' }),
      chatCon('Argomento delicato [[rifiuto]]', { username: 'lead_rifiuto' }),
    ]
    const agenda = [voceAgendaFinta({ username: 'lead_uno' })]
    const ctx = contestoGiornoDati({ canale: 'instagram', giorno: '2026-10-14', adesso, media, agenda })
    const analisi = new Map(chats.map((c) => [c.conversazione_id, chatPerAnalisi({ chat: c, profilo: null, statoLead: [], agenda, adesso })]))
    const impronte = new Map(
      [...analisi].map(([id, c]) => [id, improntaChat({ modello: 'claude-sonnet-5-5', effort: 'medium', canale: 'instagram', passo: 'schede', chat: c })]),
    )
    const blocchi = pianificaBlocchi({ canale: 'instagram', tipo: 'schede', chats })
    const schede: SchedaSalvata[] = []
    const pool = await eseguiInPool({
      blocchi,
      concorrenza: 6,
      entro: Date.now() + 240_000,
      esegui: (b, alPrimoEvento) =>
        eseguiBlocco({
          client,
          blocco: { ...blocco(b.chiavi), indice: b.indice },
          payload: payloadChat({ passo: 'schede', canale: 'instagram', contesto: ctx, media, chat: b.chiavi.map((k) => analisi.get(k)!) }),
          scadenza: Date.now() + 240_000,
          segnale: new AbortController().signal,
          alPrimoEvento,
        }),
      alTermine: (_b, esito) => {
        if (esito.ok) schede.push(...schedeDelBlocco('schede', esito.risultato as RisultatoBloccoSchede, impronte))
      },
    })
    expect(pool.fatale).toBeNull()
    expect(schede).toHaveLength(6)

    const testi = daCorreggere(schede)
    let corrette = schede
    if (testi.length) {
      const correzione = await esegui<RisultatoBloccoCorrezione>(payloadCorrezione({ canale: 'instagram', contesto: ctx, testi }))
      if (correzione.ok) corrette = applicaCorrezioni(schede, correzione.risultato.correzioni)
    }

    const ag = await esegui<RisultatoBloccoAgenda>(payloadAgenda({ contesto: ctx, voci: agenda, chat: chats, adesso }))
    if (!ag.ok) throw new Error(ag.errore)
    const tutte = [...corrette, ...schedeDellAgenda(ag.risultato, new Map())]

    const sintesiEsito = await esegui<RisultatoBloccoSintesi>(
      payloadSintesi({ canale: 'instagram', contesto: ctx, chat: chats, schede: corrette, statoLead: [], esclusi: { instagram: new Set(), messenger: new Set() }, media }),
    )
    if (!sintesiEsito.ok) throw new Error(sintesiEsito.errore)

    const doc = uniscRecap({
      canale: 'instagram',
      giorno: '2026-10-14',
      generatoIl: adesso.toISOString(),
      chat: chats,
      schede: tutte,
      candidati: [],
      sintesi: JSON.parse(JSON.stringify(sintesiEsito.risultato)),
      contesto: { agenda, stato_lead: [] },
      contenuti: media,
      escluse: 1,
      avvisi: [],
      generatoCon: { modello: 'claude-sonnet-5-5', effort: 'medium', versione_prompt: '2026-10-14.1', servito_da_fallback: false },
    })
    const per = (u: string) => doc.leads.find((l) => l.username === u)
    expect(per('lead_due')?.origine).toMatchObject({ tipo: 'testo', shortcode: 'ReelFinto01' })
    expect(per('lead_due')?.source).toBe('dal testo: reel del 12/10')
    expect(per('lead_piccolo')).toMatchObject({ minore_14: true, messages: [] })
    expect(per('lead_link')?.suggested_message).toBe('')
    expect(per('lead_rifiuto')).toMatchObject({ analisi_mancante: true })
    expect(doc.non_leads.map((n) => n.username)).toEqual(['brand_finto'])
    expect(doc.agenda?.[0]).toMatchObject({ username: 'lead_uno', status: 'promemoria da inviare' })
    expect(doc.content.posts[0]).toMatchObject({ shortcode: 'ReelFinto01', dm: 1 })
    expect(doc.stato).toBe('parziale')
    expect(doc.escluse).toBe(1)
    expect(JSON.stringify(doc)).not.toContain('Ho 13 anni')
    expect(leggiRecap(JSON.parse(JSON.stringify(doc)))).not.toBeNull()
  })
})
