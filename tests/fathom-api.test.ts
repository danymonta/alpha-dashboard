import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { cercaRegistrazionePerLink, paginaRiunioni, provaChiave, riassunto, trascrizione } from '@/lib/fathom/api'
import { baseFathom } from '@/lib/fathom/config'
import { ErroreFathom, FRASI_FATHOM } from '@/lib/fathom/frasi'

// A fake Fathom API; every meeting, person and word is invented.
const CHIAVE = `chiave-e2eFinto-${'x'.repeat(30)}`
type Stato = { richieste: URL[]; intestazioni: Record<string, string | string[] | undefined>[]; status: number | null; retryAfter: string | null; corpo: unknown }
const stato: Stato = { richieste: [], intestazioni: [], status: null, retryAfter: null, corpo: null }
const RIUNIONI = [1, 2, 3, 4, 5].map((n) => ({
  recording_id: 9700000 + n,
  url: `https://fathom.video/calls/${7700000 + n}`,
  share_url: `https://fathom.video/share/Tok${n}`,
  title: `Titolo ${n}`,
  recording_start_time: '2026-10-14T16:00:00Z',
  recording_end_time: '2026-10-14T16:41:00Z',
  calendar_invitees: [{ name: 'Persona Inventata', email: 'persona@esempio.test', is_external: true }],
  recorded_by: { email: 'dany@alpha.test' },
}))

let server: Server
let base = ''
beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1')
    stato.richieste.push(u)
    stato.intestazioni.push(req.headers)
    if (stato.status !== null) {
      const status = stato.status
      stato.status = null
      res.writeHead(status, stato.retryAfter ? { 'retry-after': stato.retryAfter } : {})
      return res.end('{}')
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    if (u.pathname.endsWith('/meetings')) {
      const da = Number(u.searchParams.get('cursor') ?? 0)
      return res.end(JSON.stringify({ items: RIUNIONI.slice(da, da + 2), next_cursor: da + 2 < 5 ? String(da + 2) : null }))
    }
    if (u.pathname.endsWith('/transcript')) return res.end(JSON.stringify(stato.corpo ?? { transcript: [{ speaker: { display_name: 'A' }, text: 'ciao', timestamp: '00:00:01' }] }))
    if (u.pathname.endsWith('/summary')) return res.end(JSON.stringify({ summary: { template_name: 'g', markdown_formatted: '## Summary' } }))
    if (u.pathname.endsWith('/meeting_types')) return res.end(JSON.stringify({ items: [{ name: 'x' }], next_cursor: null }))
    res.end('{}')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/external/v1`
})
afterAll(() => new Promise((r) => server.close(() => r(undefined))))
beforeEach(() => {
  stato.richieste = []
  stato.intestazioni = []
  stato.status = null
  stato.retryAfter = null
  stato.corpo = null
})

const op = () => ({ chiave: CHIAVE, base })

describe('API di Fathom', () => {
  it('manda la chiave solo nell’header e mai include_*', async () => {
    await paginaRiunioni({ ...op(), dal: new Date('2026-10-13T00:00:00Z'), al: new Date('2026-10-17T00:00:00Z') })
    expect(stato.intestazioni[0]['x-api-key']).toBe(CHIAVE)
    expect(stato.richieste[0].search).not.toContain(CHIAVE)
    expect([...stato.richieste[0].searchParams.keys()].filter((k) => k.startsWith('include_'))).toEqual([])
    expect(stato.richieste[0].searchParams.get('created_after')).toBe('2026-10-13T00:00:00.000Z')
  })
  it('legge dalla riunione solo i campi che servono, mai gli invitati', async () => {
    const { riunioni } = await paginaRiunioni({ ...op(), dal: new Date(), al: new Date() })
    expect(riunioni[0]).toEqual({
      recording_id: 9700001, url: 'https://fathom.video/calls/7700001', share_url: 'https://fathom.video/share/Tok1',
      titolo: 'Titolo 1', inizio: '2026-10-14T16:00:00.000Z', durata_secondi: 2460,
    })
    expect(JSON.stringify(riunioni)).not.toContain('esempio.test')
  })
  it('trova la registrazione di un link seguendo il cursore', async () => {
    const r = await cercaRegistrazionePerLink({ ...op(), link: 'https://fathom.video/share/Tok5?timestamp=9', programmataIl: new Date('2026-10-14T16:00:00Z') })
    expect(r.trovata && r.riunione.recording_id).toBe(9700005)
    expect(r.richieste).toBe(3)
    expect(stato.richieste.map((u) => u.searchParams.get('cursor'))).toEqual([null, '2', '4'])
  })
  it('non trova un link che non c’è, e il numero di /calls/<n> non è un id', async () => {
    expect((await cercaRegistrazionePerLink({ ...op(), link: 'https://fathom.video/share/Altro', programmataIl: new Date() })).trovata).toBe(false)
    // 9700001 is a recording id: a link /calls/9700001 is not that recording
    expect((await cercaRegistrazionePerLink({ ...op(), link: 'https://fathom.video/calls/9700001', programmataIl: new Date() })).trovata).toBe(false)
  })
  it('si ferma alle pagine date', async () => {
    const r = await cercaRegistrazionePerLink({ ...op(), link: 'https://fathom.video/share/Tok5', programmataIl: new Date(), paginaMax: 1 })
    expect(r).toEqual({ trovata: false, richieste: 1 })
  })
  it('trascrizione e riassunto sono sincroni, senza destination_url', async () => {
    expect(await trascrizione({ ...op(), recordingId: 9700001 })).toHaveLength(1)
    expect(await riassunto({ ...op(), recordingId: 9700001 })).toBe('## Summary')
    expect(stato.richieste.every((u) => !u.searchParams.has('destination_url'))).toBe(true)
  })
  it('un 401 è la chiave, ogni altro 4xx è «non trovata», un 5xx si riprova una volta', async () => {
    stato.status = 401
    await expect(trascrizione({ ...op(), recordingId: 1 })).rejects.toMatchObject({ tipo: 'chiave' })
    for (const s of [400, 403, 404]) {
      stato.status = s
      await expect(trascrizione({ ...op(), recordingId: 1 })).rejects.toMatchObject({ tipo: 'non_trovata' })
    }
    stato.status = 503
    stato.richieste = []
    expect(await trascrizione({ ...op(), recordingId: 1 })).toHaveLength(1)
    expect(stato.richieste).toHaveLength(2)
  })
  it('un 429 con una lunga attesa ferma con «limite»', async () => {
    stato.status = 429
    stato.retryAfter = '30'
    await expect(trascrizione({ ...op(), recordingId: 1 })).rejects.toMatchObject({ tipo: 'limite', attesaMs: 30_000 })
  })
  it('un corpo che non si legge è «formato»; i messaggi sono frasi fisse senza chiave', async () => {
    stato.corpo = { altro: 1 }
    const e = await trascrizione({ ...op(), recordingId: 1 }).catch((x) => x)
    expect(e).toBeInstanceOf(ErroreFathom)
    expect(e.tipo).toBe('formato')
    expect(e.message).toBe(FRASI_FATHOM.formato)
    expect(e.message).not.toContain(CHIAVE)
  })
  it('la prova della chiave non legge riunioni', async () => {
    await provaChiave(op())
    expect(stato.richieste.map((u) => u.pathname)).toEqual(['/external/v1/meeting_types'])
  })
  it('una chiave di prova non parte mai verso un host che non è di loopback', async () => {
    await expect(provaChiave({ chiave: CHIAVE, base: 'https://api.fathom.ai/external/v1' })).rejects.toMatchObject({ tipo: 'chiave' })
  })
})

describe('baseFathom', () => {
  it('prende E2E_FATHOM_FINTO solo in locale, col login di sviluppo, su loopback', () => {
    vi.stubEnv('E2E_FATHOM_FINTO', 'http://127.0.0.1:4013')
    vi.stubEnv('ENABLE_DEV_LOGIN', 'true')
    vi.stubEnv('NODE_ENV', 'test')
    expect(baseFathom()).toBe('http://127.0.0.1:4013/external/v1')
    vi.stubEnv('ENABLE_DEV_LOGIN', '')
    expect(baseFathom()).toBe('https://api.fathom.ai/external/v1')
    vi.stubEnv('ENABLE_DEV_LOGIN', 'true')
    vi.stubEnv('E2E_FATHOM_FINTO', 'http://esempio.test:4013')
    expect(baseFathom()).toBe('https://api.fathom.ai/external/v1')
    vi.stubEnv('E2E_FATHOM_FINTO', 'http://127.0.0.1:4013')
    vi.stubEnv('NODE_ENV', 'production')
    expect(baseFathom()).toBe('https://api.fathom.ai/external/v1')
    vi.unstubAllEnvs()
  })
})
