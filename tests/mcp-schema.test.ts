import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('server-only', () => ({}))
// the same converter Alfire uses, counted: one conversion per schema
vi.mock('ai', async (originale) => {
  const ai = await originale<typeof import('ai')>()
  return { ...ai, zodSchema: vi.fn(ai.zodSchema) }
})

import { zodSchema } from 'ai'

import { schemaMcp } from '@/lib/mcp/schema'
import { contenutoSchema, sezioneContenutoSchema } from '@/lib/validation/contenuto'

const OPZIONI = { target: 'draft-2020-12' } as const

/** Every object in a JSON Schema, nested ones included. */
function oggetti(nodo: unknown): Record<string, unknown>[] {
  if (Array.isArray(nodo)) return nodo.flatMap(oggetti)
  if (nodo === null || typeof nodo !== 'object') return []
  const o = nodo as Record<string, unknown>
  return [o, ...Object.values(o).flatMap(oggetti)]
}

const prova = z
  .object({
    nome: z.string({ required_error: 'Scrivi il nome.' }).trim().min(1, 'Scrivi il nome.'),
    status: z.enum(['Not started', 'To be edited'], { errorMap: () => ({ message: 'Scegli lo Status.' }) }).optional(),
    contenuti: z
      .array(z.object({ name: z.string().min(1, 'Scrivi il Name.') }).strict())
      .min(1)
      .max(20, 'Al massimo 20 contenuti per volta.')
      .optional(),
  })
  .strict()

describe('schemaMcp: la validazione è quella di zod 3', () => {
  it('un input valido arriva trasformato come lo trasforma lo schema dell’app', () => {
    expect(schemaMcp(prova)['~standard'].validate({ nome: '  Trazioni  ', status: 'To be edited' })).toEqual({
      value: { nome: 'Trazioni', status: 'To be edited' },
    })
  })

  it('un input sbagliato dà le parole italiane dello schema, col percorso del campo', () => {
    const esito = schemaMcp(prova)['~standard'].validate({ nome: ' ', contenuti: [{ name: '' }], altro: 1 })
    expect(esito).toEqual({
      issues: expect.arrayContaining([
        { message: 'Scrivi il nome.', path: ['nome'] },
        { message: 'Scrivi il Name.', path: ['contenuti', 0, 'name'] },
        expect.objectContaining({ path: [] }), // the unknown key of a strict object
      ]),
    })
  })

  it('parità con la 1.32.0: passa esattamente quello che i moduli accettano (caratteri contati come Postgres)', () => {
    const sezione = z.object({ testo: sezioneContenutoSchema.shape.testo }).strict()
    const testi = [
      '💪'.repeat(30_000),
      '💪'.repeat(30_001),
      `${'a'.repeat(30_000)}\n\n  \n`,
      `\n\n${'a'.repeat(30_000)}`,
      'x'.repeat(30_001),
    ]
    for (const testo of testi) {
      const app = sezioneContenutoSchema.shape.testo.safeParse(testo).success
      expect('value' in schemaMcp(sezione)['~standard'].validate({ testo }), testo.slice(0, 3)).toBe(app)
    }
    expect(testi.map((t) => sezioneContenutoSchema.shape.testo.safeParse(t).success)).toEqual([
      true,
      false,
      true,
      true,
      false,
    ])

    for (const nome of ['💪'.repeat(150), '💪'.repeat(300), 'a'.repeat(300), 'a'.repeat(301)]) {
      const input = { tipo: 'reel', nome }
      expect('value' in schemaMcp(contenutoSchema)['~standard'].validate(input)).toBe(
        contenutoSchema.safeParse(input).success,
      )
    }
  })
})

describe('schemaMcp: il JSON Schema degli strumenti', () => {
  beforeEach(() => {
    vi.mocked(zodSchema).mockClear()
  })

  it('un oggetto semplice: type object, niente $schema né $ref, nessuna proprietà in più', () => {
    const json = schemaMcp(prova)['~standard'].jsonSchema.input(OPZIONI)
    expect(json).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['nome'],
      properties: {
        nome: { type: 'string', minLength: 1 },
        status: { type: 'string', enum: ['Not started', 'To be edited'] },
        contenuti: { type: 'array', minItems: 1, maxItems: 20 },
      },
    })
    expect(json).not.toHaveProperty('$schema')
    expect(JSON.stringify(json)).not.toContain('$ref')
    for (const o of oggetti(json).filter((o) => o.type === 'object')) expect(o.additionalProperties).toBe(false)
  })

  it('anche gli schemi dell’app con trasformazioni e controlli (descrivono l’input, mai l’output)', () => {
    const json = schemaMcp(contenutoSchema)['~standard'].jsonSchema.input(OPZIONI)
    expect(json).toMatchObject({ type: 'object', additionalProperties: false, required: ['tipo', 'nome'] })
    expect(json).not.toHaveProperty('$schema')
    expect(JSON.stringify(json)).not.toContain('$ref')
  })

  it('si converte una volta sola per schema, anche con un server nuovo a ogni richiesta', () => {
    const nuovo = z.object({ nome: z.string() }).strict()
    const primo = schemaMcp(nuovo)
    expect(schemaMcp(nuovo)).toBe(primo)
    const a = primo['~standard'].jsonSchema.input(OPZIONI)
    const b = primo['~standard'].jsonSchema.output(OPZIONI)
    expect(b).toBe(a)
    schemaMcp(nuovo)['~standard'].jsonSchema.input(OPZIONI)
    expect(vi.mocked(zodSchema)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(zodSchema)).toHaveBeenCalledWith(nuovo)
    // the conversion is lazy: an adapter only validated never converts
    schemaMcp(z.object({ x: z.string() }).strict())['~standard'].validate({ x: 'y' })
    expect(vi.mocked(zodSchema)).toHaveBeenCalledTimes(1)
  })
})

describe('schemaMcp nel vero SDK MCP', () => {
  let client: Client
  let server: McpServer
  const ricevuti: unknown[] = []

  beforeEach(async () => {
    ricevuti.length = 0
    server = new McpServer({ name: 'prova', version: '0.0.0' })
    server.registerTool(
      'crea_prova',
      { title: 'Crea una prova', description: 'Una prova.', inputSchema: schemaMcp(prova) },
      async (args) => {
        ricevuti.push(args)
        return { content: [{ type: 'text', text: 'ok' }] }
      },
    )
    server.registerTool(
      'senza_input',
      { title: 'Senza input', description: 'Nessun argomento.', inputSchema: schemaMcp(z.object({}).strict()) },
      async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    )
    const [lato, altro] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'prova', version: '0.0.0' })
    await Promise.all([server.connect(altro), client.connect(lato)])
  })

  afterEach(async () => {
    await client.close()
    await server.close()
  })

  it('tools/list pubblica lo schema convertito, senza il dialetto draft-07', async () => {
    const { tools } = await client.listTools()
    const strumento = tools.find((t) => t.name === 'crea_prova')
    expect(strumento?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['nome'],
      properties: { status: { enum: ['Not started', 'To be edited'] } },
    })
    expect(strumento?.inputSchema).not.toHaveProperty('$schema')
    expect(tools.find((t) => t.name === 'senza_input')?.inputSchema).toMatchObject({
      type: 'object',
      properties: {},
      additionalProperties: false,
    })
  })

  it('tools/call valida con zod 3: il gestore riceve l’input trasformato, gli errori arrivano in italiano', async () => {
    const ok = await client.callTool({ name: 'crea_prova', arguments: { nome: '  Trazioni ' } })
    expect(ok.isError).toBeFalsy()
    expect(ricevuti).toEqual([{ nome: 'Trazioni' }])

    const ko = await client.callTool({ name: 'crea_prova', arguments: { nome: '', status: 'Posted' } })
    expect(ko.isError).toBe(true)
    const testo = (ko.content as { type: string; text: string }[])[0].text
    expect(testo).toContain('nome: Scrivi il nome.')
    expect(testo).toContain('status: Scegli lo Status.')
    expect(ricevuti).toHaveLength(1)

    // no arguments at all: the SDK validates {} (an empty-input tool works)
    expect((await client.callTool({ name: 'senza_input' })).isError).toBeFalsy()
  })
})
