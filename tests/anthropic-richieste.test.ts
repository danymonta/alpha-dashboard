import Anthropic from '@anthropic-ai/sdk'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { creaClaudeFinto } from '../e2e/claude-finto.mjs'
import { LIMITI, misureSchema, testiMalFormati, verificaCorpoRichiesta, verificaSchemaStrutturato } from '../e2e/schema-strutturato.mjs'
import { FORMATO_ANALISI_CALL, SchemaAnalisiCall } from '@/lib/call/analisi/schema'
import { contenutoCall, sistemaCall } from '@/lib/call/analisi/prompt'
import { descriviErrore4xx } from '@/lib/insight/esegui'
import { FORMATO_AGENDA, FORMATO_CORREZIONI, FORMATO_SCHEDE, FORMATO_SINTESI } from '@/lib/insight/schema'
import { benFormato, chiediAClaude } from '@/lib/marketing/analisi/claude'
import { contenutoAnalisi, sistemaAnalisi } from '@/lib/marketing/analisi/prompt'
import { FORMATO_ANALISI_REEL, FORMATO_SCHEDA_VISIVA, LettoAnalisiReel } from '@/lib/marketing/analisi/schema'
import { contenutoPunteggio, sistemaPunteggio } from '@/lib/marketing/punteggio/prompt'
import { FORMATO_PUNTEGGIO, LettoPunteggio } from '@/lib/marketing/punteggio/schema'
import { contenutoSpunti, sistemaSpunti } from '@/lib/marketing/spunti/prompt'
import { FORMATO_SPUNTI, LettoSpunti } from '@/lib/marketing/spunti/schema'

/**
 * The requests to Claude against what the real API refuses (1.37.1): Weekly brief and call analysis
 * went to production with a request that nobody had ever sent to Anthropic, because the fake Claude
 * answered whatever it was asked. Now the fake Claude refuses with 400 what the documentation of
 * structured outputs refuses (e2e/schema-strutturato.mjs), and this file holds every format of the
 * app to the same rules, so that a regression is seen before the deploy.
 */

const FORMATI = {
  'scheda visiva del reel': FORMATO_SCHEDA_VISIVA,
  'analisi del reel': FORMATO_ANALISI_REEL,
  'punteggio del reel': FORMATO_PUNTEGGIO,
  'analisi della call': FORMATO_ANALISI_CALL,
  'spunti della settimana': FORMATO_SPUNTI,
  'insight, schede': FORMATO_SCHEDE,
  'insight, agenda': FORMATO_AGENDA,
  'insight, sintesi': FORMATO_SINTESI,
  'insight, correzioni': FORMATO_CORREZIONI,
}

describe('gli schemi dell’app contro le regole dello structured output', () => {
  for (const [nome, formato] of Object.entries(FORMATI)) {
    it(`${nome}: dentro le regole documentate`, () => {
      expect(formato.type).toBe('json_schema')
      expect(verificaSchemaStrutturato(formato.schema)).toEqual([])
      const m = misureSchema(formato.schema)
      expect(m.opzionali).toBeLessThanOrEqual(LIMITI.opzionali)
      expect(m.unioni).toBeLessThanOrEqual(LIMITI.unioni)
    })
  }
})

describe('il controllo sa riconoscere uno schema fuori regola', () => {
  const base = (extra: Record<string, unknown> = {}) => ({
    type: 'object',
    properties: { a: { type: 'string', ...extra } },
    required: ['a'],
    additionalProperties: false,
  })
  it('una proprietà può chiamarsi come una parola chiave', () => {
    const s = { type: 'object', properties: { format: { type: 'string' }, if: { type: 'string' }, not: { type: 'string' } }, required: ['format', 'if', 'not'], additionalProperties: false }
    expect(verificaSchemaStrutturato(s)).toEqual([])
  })
  it.each([
    ['minLength', { minLength: 1 }],
    ['maxLength', { maxLength: 10 }],
    ['pattern con lookahead', { pattern: '^(?=a)a$' }],
    ['formato sconosciuto', { format: 'telefono' }],
    ['enum vuoto', { enum: [] }],
  ])('%s', (_nome, extra) => {
    expect(verificaSchemaStrutturato(base(extra)).length).toBeGreaterThan(0)
  })
  it('array: maxItems no, minItems solo 0 o 1', () => {
    const arr = (extra: Record<string, unknown>) => ({ type: 'object', properties: { l: { type: 'array', items: { type: 'string' }, ...extra } }, required: ['l'], additionalProperties: false })
    expect(verificaSchemaStrutturato(arr({ maxItems: 3 })).length).toBeGreaterThan(0)
    expect(verificaSchemaStrutturato(arr({ minItems: 2 })).length).toBeGreaterThan(0)
    expect(verificaSchemaStrutturato(arr({ minItems: 1 }))).toEqual([])
  })
  it('un oggetto senza additionalProperties: false', () => {
    expect(verificaSchemaStrutturato({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }).length).toBeGreaterThan(0)
  })
  it('troppi opzionali e troppe unioni', () => {
    const chiavi = Array.from({ length: 25 }, (_, i) => `k${i}`)
    const opzionali = { type: 'object', properties: Object.fromEntries(chiavi.map((k) => [k, { type: 'string' }])), required: [], additionalProperties: false }
    expect(verificaSchemaStrutturato(opzionali).join(' ')).toContain('opzionali')
    const unioni = {
      type: 'object',
      properties: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`u${i}`, { anyOf: [{ type: 'string' }, { type: 'null' }] }])),
      required: Array.from({ length: 17 }, (_, i) => `u${i}`),
      additionalProperties: false,
    }
    expect(verificaSchemaStrutturato(unioni).join(' ')).toContain('unioni')
  })
  it('uno schema ricorsivo', () => {
    const s = { type: 'object', properties: { nodo: { $ref: '#/$defs/n' } }, required: ['nodo'], additionalProperties: false, $defs: { n: { type: 'object', properties: { figlio: { $ref: '#/$defs/n' } }, required: ['figlio'], additionalProperties: false } } }
    expect(verificaSchemaStrutturato(s).join(' ')).toContain('ricorsivo')
  })
  it('il corpo: surrogato isolato, blocco vuoto, troppi punti di cache, max_tokens', () => {
    const corpo = (extra: Record<string, unknown>) => ({
      model: 'claude-sonnet-5-5',
      max_tokens: 1000,
      system: [{ type: 'text', text: 'sistema' }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'ciao' }] }],
      ...extra,
    })
    expect(verificaCorpoRichiesta(corpo({}))).toEqual([])
    expect(verificaCorpoRichiesta(corpo({ messages: [{ role: 'user', content: [{ type: 'text', text: 'ciao \ud83d' }] }] })).join(' ')).toContain('surrogato')
    expect(verificaCorpoRichiesta(corpo({ messages: [{ role: 'user', content: [{ type: 'text', text: '  ' }] }] })).join(' ')).toContain('vuoto')
    expect(verificaCorpoRichiesta(corpo({ max_tokens: 500_000 })).join(' ')).toContain('max_tokens')
    const cinque = Array.from({ length: 5 }, () => ({ type: 'text', text: 'x', cache_control: { type: 'ephemeral' } }))
    expect(verificaCorpoRichiesta(corpo({ system: cinque })).join(' ')).toContain('cache')
    expect(testiMalFormati({ a: ['ok', 'rotto \udc00'] })).toEqual(['$.a[1]'])
  })
})

type Finto = { url: string; chiudi: () => Promise<void>; ultime: () => { corpo: Record<string, unknown>; rifiutata?: string[] }[]; azzera: () => void }
let finto: Finto
let client: Anthropic
beforeAll(async () => {
  finto = (await creaClaudeFinto({ lentoMs: 200 })) as Finto
  client = new Anthropic({ apiKey: 'finta', authToken: null, baseURL: finto.url, maxRetries: 0 })
})
afterAll(async () => {
  await finto.chiudi()
})
let errori: unknown[][]
beforeEach(() => {
  finto.azzera()
  errori = []
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errori.push(a))
})

const base = { effort: 'medium' as const, minimo: 1000, entro: Date.now() + 120_000, cliente: undefined as Anthropic | undefined }

describe('le richieste vere contro il Claude finto che rifiuta come l’API', () => {
  it('spunti della settimana: accettata', async () => {
    const r = await chiediAClaude({ ...base, passo: 'spunti', sistema: sistemaSpunti(), contenuto: contenutoSpunti({ periodo: 'x' }), formato: FORMATO_SPUNTI, schema: LettoSpunti, maxTokens: 24_000, cliente: client })
    expect(finto.ultime()[0].rifiutata).toBeUndefined()
    expect(r.ok).toBe(true)
  })
  it('analisi della call: accettata', async () => {
    const r = await chiediAClaude({ ...base, passo: 'call', sistema: sistemaCall(), contenuto: contenutoCall({ call: {} }, '[00:01] Closer: ciao', false), formato: FORMATO_ANALISI_CALL, schema: SchemaAnalisiCall, cliente: client })
    expect(finto.ultime()[0].rifiutata).toBeUndefined()
    expect(r.ok === false && r.codice === 'richiesta').toBe(false)
  })
  it('analisi del reel: accettata', async () => {
    const r = await chiediAClaude({ ...base, passo: 'analisi', sistema: sistemaAnalisi(), contenuto: contenutoAnalisi({ periodo_giorni: 90 }, {}), formato: FORMATO_ANALISI_REEL, schema: LettoAnalisiReel, cliente: client })
    expect(finto.ultime()[0].rifiutata).toBeUndefined()
    expect(r.ok === false && r.codice === 'richiesta').toBe(false)
  })
  it('punteggio del reel: accettata, con la guida nel sistema', async () => {
    const r = await chiediAClaude({ ...base, passo: 'punteggio', sistema: sistemaPunteggio(), contenuto: contenutoPunteggio({ trascrizione: 'Niente sbarra? Nessun problema.' }), formato: FORMATO_PUNTEGGIO, schema: LettoPunteggio, cliente: client })
    expect(finto.ultime()[0].rifiutata).toBeUndefined()
    expect(r.ok).toBe(true)
  })
  it('uno schema fuori regola: 400, codice «richiesta» e una riga di log col messaggio dell’API, mai la richiesta', async () => {
    const storto = { type: 'json_schema' as const, schema: { type: 'object', properties: { a: { type: 'string', minLength: 1 } }, required: ['a'], additionalProperties: false } }
    const r = await chiediAClaude({ ...base, passo: 'spunti', sistema: sistemaSpunti(), contenuto: contenutoSpunti({ segreto: 'NON NEL LOG' }), formato: storto, schema: LettoSpunti, cliente: client })
    expect(r).toMatchObject({ ok: false, codice: 'richiesta' })
    const riga = errori.map((a) => a.join(' ')).find((t) => t.startsWith('[claude] spunti:'))
    expect(riga).toMatch(/^\[claude\] spunti: 400 invalid_request_error: .*minLength/)
    expect(riga).not.toContain('NON NEL LOG')
    expect(riga!.length).toBeLessThan(400)
  })
  it('un testo con un surrogato isolato parte ben formato (un taglio dentro un’emoji non fa più un 400)', async () => {
    const emoji = '😀'
    const rotto = `parole ${emoji.slice(0, 1)}`
    const r = await chiediAClaude({ ...base, passo: 'spunti', sistema: sistemaSpunti(), contenuto: [{ type: 'text', text: `<passo>spunti_settimana</passo>\n${rotto}` }], formato: FORMATO_SPUNTI, schema: LettoSpunti, cliente: client })
    expect(finto.ultime()[0].rifiutata).toBeUndefined()
    expect(r.ok).toBe(true)
    expect(benFormato([{ type: 'text', text: rotto }])[0]).toMatchObject({ text: 'parole �' })
  })
})

describe('la riga di log di un 4xx', () => {
  const errore = (stato: number, corpo: unknown) => Anthropic.APIError.generate(stato, corpo as object, undefined, new Headers())
  it('stato, tipo e messaggio; tagliato a 300 e senza chiavi', () => {
    const lungo = `chiave sk-ant-api03-abcDEF_123 ${'x'.repeat(500)}`
    const riga = descriviErrore4xx(errore(400, { type: 'error', error: { type: 'invalid_request_error', message: lungo } }))!
    expect(riga.startsWith('400 invalid_request_error: chiave [chiave] ')).toBe(true)
    expect(riga.length).toBeLessThanOrEqual('400 invalid_request_error: '.length + 300)
    expect(riga).not.toContain('sk-ant')
  })
  it('né un 429 né un 5xx né un errore qualsiasi', () => {
    expect(descriviErrore4xx(errore(429, { type: 'error', error: { type: 'rate_limit_error', message: 'x' } }))).toBeNull()
    expect(descriviErrore4xx(errore(529, { type: 'error', error: { type: 'overloaded_error', message: 'x' } }))).toBeNull()
    expect(descriviErrore4xx(new Error('qualcosa'))).toBeNull()
  })
})
