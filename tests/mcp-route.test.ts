import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/env', () => ({
  publicEnv: { supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'chiave-finta', appUrl: 'http://localhost:3000' },
}))

import { opzioniDiPartenza } from '@/lib/marketing/opzioni'

import { supabaseFinto, ha, argomenti, type Chiamata, type RispostaFinta } from './helpers/supabase-finto-mcp'

/**
 * /mcp end to end with the SDK's own client, the way Claude talks to it: the
 * token check is replaced by a fixed identity (tests/mcp-auth.test.ts covers
 * it), the database by a fake client; everything in between is real (the
 * route, the SDK's handler, the tools, the shared core).
 */
const stato = vi.hoisted(() => ({
  ruolo: 'marketing' as 'admin' | 'editor' | 'marketing',
  db: null as unknown,
}))

vi.mock('@/lib/mcp/auth', () => ({
  autenticaMcp: vi.fn(async (intestazione: string | null) =>
    intestazione === 'Bearer token-finto'
      ? {
          ok: true,
          ruolo: stato.ruolo,
          sessione: 'sessione-di-prova',
          authInfo: {
            token: 'token-finto',
            clientId: '6c1f0c64-4f9b-4c49-9a3e-2f8c4c0a7e11',
            scopes: [],
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            extra: { ruolo: stato.ruolo, sessione: 'sessione-di-prova' },
          },
        }
      : {
          ok: false,
          risposta: Response.json(
            { error: 'invalid_token', messaggio: 'x' },
            { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", resource_metadata="m"' } },
          ),
        },
  ),
  clientConToken: vi.fn(() => stato.db),
}))

import { DELETE, GET, POST } from '@/app/mcp/route'
import { ICP, ICP_AGGIORNATO_IL } from '@/lib/marketing/icp'
import { REGOLA_ICP } from '@/lib/mcp/istruzioni'
import { azzeraLimiti } from '@/lib/mcp/limiti'

const URL_MCP = 'http://localhost:3000/mcp'
const NUOVO = '9b2e1c3d-1111-4a2b-8c3d-4e5f6a7b8c9d'

let rispondi: (c: Chiamata) => RispostaFinta
let fake: ReturnType<typeof supabaseFinto>

/** The route as a fetch: what Next would call. */
async function allaRoute(url: string | URL, init?: RequestInit): Promise<Response> {
  const richiesta = new Request(url, init)
  if (richiesta.method === 'POST') return POST(richiesta)
  if (richiesta.method === 'GET') return GET(richiesta)
  if (richiesta.method === 'DELETE') return DELETE(richiesta)
  return new Response(null, { status: 405 })
}

const aperti: Client[] = []

async function collega(opzioni: ConstructorParameters<typeof Client>[1] = {}) {
  const transport = new StreamableHTTPClientTransport(new URL(URL_MCP), {
    fetch: allaRoute,
    requestInit: { headers: { Authorization: 'Bearer token-finto' } },
  })
  const client = new Client({ name: 'prova', version: '1.0.0' }, opzioni)
  await client.connect(transport)
  aperti.push(client)
  return client
}

function testoDi(risultato: unknown): string {
  const contenuto = (risultato as { content: { type: string; text: string }[] }).content
  return contenuto[0]?.text ?? ''
}

let log: ReturnType<typeof vi.spyOn>[] = []

beforeEach(() => {
  stato.ruolo = 'marketing'
  rispondi = (c) => (ha(c, 'limit') ? { data: [], count: 0 } : { data: null, count: 0 })
  // the labels of the app (marketing_opzioni) are read by every tool: the starting ones
  const partenza = opzioniDiPartenza()
  const etichette = [...partenza.reel_type, ...partenza.formato]
  fake = supabaseFinto((c) => (c.nome === 'marketing_opzioni' ? { data: etichette } : rispondi(c)))
  stato.db = fake.client
  azzeraLimiti()
  log = (['info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
})

afterEach(async () => {
  while (aperti.length) await aperti.pop()?.close()
  for (const spia of log) spia.mockRestore()
})

describe('il client MCP dell’SDK contro /mcp', () => {
  it('protocollo del 2025 (Claude oggi): il marketing vede 10 strumenti, con titoli e suggerimenti', async () => {
    const client = await collega()
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual([
      'etichette_contenuti',
      'elenco_contenuti',
      'leggi_contenuto',
      'icp',
      'guida_contenuti',
      'spunti_contenuti',
      'crea_contenuti',
      'modifica_contenuto',
      'cambia_status',
      'scrivi_sezione',
    ])
    const crea = tools.find((t) => t.name === 'crea_contenuti')
    expect(crea?.title).toBe('Crea contenuti')
    expect(crea?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false })
    expect(crea?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false })
    expect(JSON.stringify(crea?.inputSchema)).not.toContain('$schema')
    expect(client.getInstructions()).toContain('📸 Instagram Posts DANYMONTA')
    expect(client.getServerVersion()).toMatchObject({ name: 'alpha-management', title: 'Alpha Management' })
  })

  it('l’admin ha anche elimina_contenuto, segnato distruttivo', async () => {
    stato.ruolo = 'admin'
    const client = await collega()
    const { tools } = await client.listTools()
    const elimina = tools.find((t) => t.name === 'elimina_contenuto')
    expect(elimina?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })
    expect(tools).toHaveLength(11)
  })

  it('protocollo 2026-07-28: le stesse cose, senza sessione', async () => {
    const client = await collega({ versionNegotiation: { mode: { pin: '2026-07-28' } } })
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(10)
    const elenco = await client.callTool({ name: 'elenco_contenuti', arguments: {} })
    expect(elenco.isError).toBeFalsy()
    expect(JSON.parse(testoDi(elenco))).toMatchObject({ totale: 0, mostrati: 0, contenuti: [] })
  })

  it('elenco_contenuti e crea_contenuti passano dall’SDK fino al database, con le etichette', async () => {
    rispondi = (c) => {
      if (ha(c, 'insert')) return { data: { id: NUOVO, updated_at: '2026-10-09T09:00:00+00:00' } }
      if (ha(c, 'limit')) return { data: [], count: 0 }
      return { data: null, count: 0 }
    }
    const client = await collega()
    const creati = await client.callTool({
      name: 'crea_contenuti',
      arguments: { contenuti: [{ name: 'Trazioni', modello: 'Carousel Topic', status: 'To be edited' }] },
    })
    expect(creati.isError).toBeFalsy()
    expect(JSON.parse(testoDi(creati))).toMatchObject({
      creati: 1,
      contenuti: [{ esito: 'creato', id: NUOVO, Name: 'Trazioni', Modello: 'Carousel Topic', Status: 'To be edited' }],
    })
    const [inserimento] = fake.chiamate.filter((c) => ha(c, 'insert'))
    expect(argomenti(inserimento, 'insert')?.[0]).toMatchObject({ tipo: 'carousel', stato: 'to_be_edited' })
  })

  it('un ingresso sbagliato non arriva al database: l’errore è in italiano', async () => {
    const client = await collega()
    const troppi = await client.callTool({
      name: 'crea_contenuti',
      arguments: { contenuti: Array.from({ length: 21 }, (_, i) => ({ name: `C${i}` })) },
    })
    expect(troppi.isError).toBe(true)
    expect(testoDi(troppi)).toContain('Da 1 a 20 contenuti per volta: dividi in più chiamate.')
    const etichetta = await client.callTool({ name: 'cambia_status', arguments: { id: NUOVO, status: 'to_be_edited' } })
    expect(etichetta.isError).toBe(true)
    expect(testoDi(etichetta)).toContain('Status: uno tra Not started, To be recorded')
    expect(fake.chiamate).toEqual([])
  })

  it('icp passa dall’SDK senza toccare il database, e le istruzioni dicono di leggerlo prima dei contenuti', async () => {
    for (const ruolo of ['marketing', 'editor', 'admin'] as const) {
      stato.ruolo = ruolo
      const client = await collega()
      const icp = (await client.listTools()).tools.find((t) => t.name === 'icp')
      expect(icp?.title, ruolo).toBe('Profilo del cliente ideale')
      expect(icp?.annotations, ruolo).toMatchObject({ readOnlyHint: true, openWorldHint: false })
      expect(icp?.inputSchema, ruolo).toMatchObject({ type: 'object', additionalProperties: false })
      const risposta = await client.callTool({ name: 'icp', arguments: {} })
      expect(risposta.isError, ruolo).toBeFalsy()
      expect(JSON.parse(testoDi(risposta)), ruolo).toEqual({ aggiornato_il: ICP_AGGIORNATO_IL, profilo: ICP })
      expect(client.getInstructions(), ruolo).toContain(REGOLA_ICP)
    }
    expect(fake.chiamate).toEqual([])
  })

  it('il marketing non ha elimina_contenuto: lo strumento non esiste per lui', async () => {
    const client = await collega()
    await expect(
      client.callTool({ name: 'elimina_contenuto', arguments: { id: NUOVO, name: 'X' } }),
    ).rejects.toThrow()
    expect(fake.chiamate).toEqual([])
  })
})

describe('/mcp come lo chiama Claude, a mano (2025-11-25, senza stato)', () => {
  const INTESTAZIONI = {
    Authorization: 'Bearer token-finto',
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }

  function post(corpo: unknown, altre: Record<string, string> = {}) {
    return POST(new Request(URL_MCP, { method: 'POST', headers: { ...INTESTAZIONI, ...altre }, body: JSON.stringify(corpo) }))
  }

  /** The one `message` event of a legacy answer. */
  async function evento(risposta: Response) {
    expect(risposta.headers.get('content-type')).toContain('text/event-stream')
    const testo = await risposta.text()
    const dati = testo
      .split('\n')
      .filter((r) => r.startsWith('data:'))
      .map((r) => r.slice(5).trim())
    expect(testo).toMatch(/^event: message$/m)
    expect(dati).toHaveLength(1)
    return JSON.parse(dati[0]) as { id: number; result?: Record<string, unknown>; error?: unknown }
  }

  it('initialize, initialized, tools/list e tools/call: ognuna una POST, ognuna un evento SSE', async () => {
    const inizio = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'claude-ai', version: '0.1.0' } },
    })
    expect(inizio.status).toBe(200)
    const init = await evento(inizio)
    expect(init.result).toMatchObject({ protocolVersion: '2025-11-25', serverInfo: { name: 'alpha-management' } })
    expect(String(init.result?.instructions)).toContain('Alpha Management è il gestionale di Percorso Alpha.')

    const pronto = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, { 'MCP-Protocol-Version': '2025-11-25' })
    expect(pronto.status).toBe(202)

    const elenco = await evento(
      await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, { 'MCP-Protocol-Version': '2025-11-25' }),
    )
    expect((elenco.result?.tools as unknown[]).length).toBe(10)

    const chiamata = await evento(
      await post(
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'etichette_contenuti', arguments: {} } },
        { 'MCP-Protocol-Version': '2025-11-25' },
      ),
    )
    const testo = (chiamata.result?.content as { text: string }[])[0].text
    expect(JSON.parse(testo)).toMatchObject({
      reel_type: [
        { nome: 'Attraction', codice: 'attraction', colore: 'blue' },
        { nome: 'Education', codice: 'education', colore: 'yellow' },
        { nome: 'Converting', codice: 'converting', colore: 'red' },
        { nome: 'RADIO', codice: 'radio', colore: 'purple' },
        { nome: 'Workshop', codice: 'workshop', colore: 'green' },
      ],
    })
  })

  it('senza text/event-stream in Accept: 406', async () => {
    const risposta = await post(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { Accept: 'application/json', 'MCP-Protocol-Version': '2025-11-25' },
    )
    expect(risposta.status).toBe(406)
  })

  it('GET con il token: 405 (niente sessioni); senza token: 401, prima di tutto', async () => {
    const conToken = await GET(new Request(URL_MCP, { headers: { Authorization: 'Bearer token-finto', Accept: 'text/event-stream' } }))
    expect(conToken.status).toBe(405)
    const senza = await GET(new Request(URL_MCP, { headers: { Accept: 'text/event-stream' } }))
    expect(senza.status).toBe(401)
    expect(senza.headers.get('WWW-Authenticate')).toContain('resource_metadata')
  })

  it('un’origine estranea: 403; claude.ai passa', async () => {
    const corpo = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
    const estranea = await post(corpo, { Origin: 'https://evil.example', 'MCP-Protocol-Version': '2025-11-25' })
    expect(estranea.status).toBe(403)
    expect(await estranea.json()).toMatchObject({ error: 'origine_non_ammessa' })
    const claude = await post(corpo, { Origin: 'https://claude.ai', 'MCP-Protocol-Version': '2025-11-25' })
    expect(claude.status).toBe(200)
  })

  it('un corpo oltre 2 MiB: 413, senza leggerlo', async () => {
    const enorme = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'scrivi_sezione', arguments: { testo: 'x'.repeat(2.1 * 1024 * 1024) } },
    }
    const risposta = await post(enorme, { 'MCP-Protocol-Version': '2025-11-25' })
    expect(risposta.status).toBe(413)
    expect(fake.chiamate).toEqual([])
  })

  it('121 richieste in un minuto sullo stesso collegamento: 429 con Retry-After', async () => {
    const corpo = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
    for (let i = 0; i < 120; i++) {
      const r = await post(corpo, { 'MCP-Protocol-Version': '2025-11-25' })
      expect(r.status, `richiesta ${i + 1}`).toBe(200)
      await r.text()
    }
    const oltre = await post(corpo, { 'MCP-Protocol-Version': '2025-11-25' })
    expect(oltre.status).toBe(429)
    expect(oltre.headers.get('Retry-After')).toBe('60')
    expect(await oltre.json()).toEqual({
      error: 'troppe_richieste',
      messaggio: 'Troppe richieste in poco tempo: aspetta un minuto.',
    })
  })
})
