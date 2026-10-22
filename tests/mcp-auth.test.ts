import {
  AuthApiError,
  AuthInvalidJwtError,
  AuthRetryableFetchError,
} from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({
  publicEnv: { supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'chiave-finta', appUrl: 'http://localhost:3000' },
}))

// Every Supabase client of the module: getClaims for the verifier, rpc('mcp_chi_sono') for the token's own client.
const finto = vi.hoisted(() => ({
  getClaims: vi.fn(),
  rpc: vi.fn(),
  creati: [] as unknown[][],
}))
vi.mock('@supabase/supabase-js', async (originale) => ({
  ...(await originale<typeof import('@supabase/supabase-js')>()),
  createClient: (...args: unknown[]) => {
    finto.creati.push(args)
    return { auth: { getClaims: finto.getClaims }, rpc: finto.rpc }
  },
}))

import { autenticaMcp } from '@/lib/mcp/auth'

const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.firma-del-token-finto'
const METADATI = 'http://localhost:3000/.well-known/oauth-protected-resource/mcp'
const CLIENT = '6c1f0c64-4f9b-4c49-9a3e-2f8c4c0a7e11'
const SESSIONE = '0d0b8f7e-2d8c-4f6e-9a55-6a3b5f1c2e90'

function claims(altro: Record<string, unknown> = {}) {
  return {
    iss: 'http://127.0.0.1:54321/auth/v1',
    role: 'authenticated',
    aud: ['authenticated'],
    sub: '61616161-6161-4161-8161-616161616161',
    session_id: SESSIONE,
    client_id: CLIENT,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...altro,
  }
}

function chiSono(risposta: unknown, altro: { error?: unknown; status?: number } = {}) {
  finto.rpc.mockResolvedValue({ data: risposta, error: altro.error ?? null, status: altro.status ?? 200 })
}

let log: ReturnType<typeof vi.spyOn>[] = []

beforeEach(() => {
  finto.getClaims.mockReset()
  finto.rpc.mockReset()
  finto.creati.length = 0
  finto.getClaims.mockResolvedValue({ data: { claims: claims() }, error: null })
  chiSono({ esito: 'ok', ruolo: 'marketing', livello: 'employee', filtro: true })
  log = (['info', 'warn', 'error', 'log'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
})

afterEach(() => {
  // the token never reaches a log line, whatever happened
  for (const spia of log) {
    for (const chiamata of spia.mock.calls) expect(JSON.stringify(chiamata)).not.toContain(TOKEN)
    spia.mockRestore()
  }
})

async function corpo(r: Response) {
  return (await r.json()) as { error: string; messaggio: string }
}

describe('autenticaMcp: chi non ha un token valido riceve 401 con resource_metadata', () => {
  it('senza intestazione: 401, la sfida punta ai metadati e il corpo è in italiano', async () => {
    const esito = await autenticaMcp(null)
    expect(esito.ok).toBe(false)
    if (esito.ok) return
    expect(esito.risposta.status).toBe(401)
    expect(esito.risposta.headers.get('WWW-Authenticate')).toContain(`resource_metadata="${METADATI}"`)
    expect(esito.risposta.headers.get('WWW-Authenticate')).toContain('error="invalid_token"')
    expect((await corpo(esito.risposta)).messaggio).toMatch(/ricollega Alpha Management in Claude/)
  })

  it.each([
    ['Basic', 'Basic dXRlbnRlOnBhc3N3b3Jk'],
    ['Bearer senza token', 'Bearer'],
  ])('%s: 401', async (_, intestazione) => {
    const esito = await autenticaMcp(intestazione)
    expect(!esito.ok && esito.risposta.status).toBe(401)
    expect(finto.getClaims).not.toHaveBeenCalled()
  })

  it.each([
    ['scaduto (getClaims lo dice)', () => finto.getClaims.mockResolvedValue({ data: null, error: new AuthInvalidJwtError('JWT has expired') })],
    ['firma sbagliata', () => finto.getClaims.mockResolvedValue({ data: null, error: new AuthInvalidJwtError('Invalid JWT signature') })],
    ['JSON che non è JSON', () => finto.getClaims.mockRejectedValue(new SyntaxError('Unexpected token'))],
    ['scade fra 20 secondi', () => finto.getClaims.mockResolvedValue({ data: { claims: claims({ exp: Math.floor(Date.now() / 1000) + 20 }) }, error: null })],
    ['emittente di un altro progetto', () => finto.getClaims.mockResolvedValue({ data: { claims: claims({ iss: 'https://altro.supabase.co/auth/v1' }) }, error: null })],
    ['aud diverso da authenticated', () => finto.getClaims.mockResolvedValue({ data: { claims: claims({ aud: ['http://localhost:3000/mcp'] }) }, error: null })],
    ['un JWT del sito, senza client_id', () => finto.getClaims.mockResolvedValue({ data: { claims: claims({ client_id: undefined }) }, error: null })],
    ['client_id che non è un uuid', () => finto.getClaims.mockResolvedValue({ data: { claims: claims({ client_id: 'abc' }) }, error: null })],
    ['ruolo anon', () => finto.getClaims.mockResolvedValue({ data: { claims: claims({ role: 'anon' }) }, error: null })],
  ])('%s: 401 senza chiedere al database', async (_, prepara) => {
    prepara()
    const esito = await autenticaMcp(`Bearer ${TOKEN}`)
    expect(!esito.ok && esito.risposta.status).toBe(401)
    expect(finto.rpc).not.toHaveBeenCalled()
  })

  it('aud come stringa «authenticated» va bene come l’array', async () => {
    finto.getClaims.mockResolvedValue({ data: { claims: claims({ aud: 'authenticated' }) }, error: null })
    expect((await autenticaMcp(`Bearer ${TOKEN}`)).ok).toBe(true)
  })

  it('sessione OAuth chiusa (Scollega, client eliminato): 401', async () => {
    chiSono({ esito: 'sessione' })
    const esito = await autenticaMcp(`Bearer ${TOKEN}`)
    expect(!esito.ok && esito.risposta.status).toBe(401)
  })

  it.each([
    ['HTTP 401', { error: { code: 'PGRST301', message: 'x' }, status: 401 }],
    ['PGRST303', { error: { code: 'PGRST303', message: 'JWT expired' }, status: 401 }],
    ['PGRST302', { error: { code: 'PGRST302', message: 'x' }, status: 400 }],
  ])('PostgREST rifiuta il JWT (%s): 401', async (_, errore) => {
    chiSono(null, errore)
    const esito = await autenticaMcp(`Bearer ${TOKEN}`)
    expect(!esito.ok && esito.risposta.status).toBe(401)
  })
})

describe('autenticaMcp: un account disattivato riceve 403 insufficient_scope', () => {
  it('account disattivato: 403, intestazione ASCII e corpo in italiano', async () => {
    chiSono({ esito: 'ruolo' })
    const esito = await autenticaMcp(`Bearer ${TOKEN}`)
    expect(esito.ok).toBe(false)
    if (esito.ok) return
    expect(esito.risposta.status).toBe(403)
    const sfida = esito.risposta.headers.get('WWW-Authenticate') ?? ''
    expect(sfida).toContain('error="insufficient_scope"')
    expect(sfida).toContain(`resource_metadata="${METADATI}"`)
    expect(sfida).toMatch(/^[\x20-\x7e]+$/)
    const { error, messaggio } = await corpo(esito.risposta)
    expect(error).toBe('insufficient_scope')
    expect(messaggio).toBe(
      'Il tuo account non può usare Alpha Management da Claude: serve l’account attivo. Se è stato disattivato, chiedi all’admin.',
    )
  })
})

describe('autenticaMcp: Supabase che non risponde è 503, mai 401', () => {
  it.each([
    ['rete verso Supabase Auth', () => finto.getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError('fetch failed', 0) })],
    ['Supabase Auth in errore 5xx', () => finto.getClaims.mockResolvedValue({ data: null, error: new AuthApiError('boom', 503, 'unexpected_failure') })],
    ['un’eccezione qualsiasi di getClaims', () => finto.getClaims.mockRejectedValue(new TypeError('fetch failed'))],
    ['mcp_chi_sono senza rete', () => chiSono(null, { error: { code: '', message: 'TypeError: fetch failed' }, status: 0 })],
    ['mcp_chi_sono in errore 5xx', () => chiSono(null, { error: { code: 'PGRST002', message: 'schema cache' }, status: 503 })],
    ['statement_timeout', () => chiSono(null, { error: { code: '57014', message: 'canceling statement' }, status: 500 })],
    ['un 42501 inatteso', () => chiSono(null, { error: { code: '42501', message: 'x' }, status: 403 })],
  ])('%s: 503 con Retry-After', async (_, prepara) => {
    prepara()
    const esito = await autenticaMcp(`Bearer ${TOKEN}`)
    expect(esito.ok).toBe(false)
    if (esito.ok) return
    expect(esito.risposta.status).toBe(503)
    expect(esito.risposta.headers.get('Retry-After')).toBe('30')
    expect(esito.risposta.headers.get('WWW-Authenticate')).toBeNull()
    expect((await corpo(esito.risposta)).messaggio).toBe('Alpha Management non risponde adesso: riprova tra poco.')
  })

  it('il filtro delle Data API non ha girato su questa richiesta: 503 «sospeso»', async () => {
    chiSono({ esito: 'ok', ruolo: 'admin', livello: 'admin', filtro: false })
    const esito = await autenticaMcp(`Bearer ${TOKEN}`)
    expect(esito.ok).toBe(false)
    if (esito.ok) return
    expect(esito.risposta.status).toBe(503)
    expect(await corpo(esito.risposta)).toEqual({
      error: 'filtro_assente',
      messaggio: 'Il collegamento a Claude è sospeso: avvisa l’admin.',
    })
  })
})

describe('autenticaMcp: il token buono', () => {
  it('passa con ruolo e sessione, e il database lo riceve com’è', async () => {
    const esito = await autenticaMcp(`Bearer ${TOKEN}`)
    expect(esito.ok).toBe(true)
    if (!esito.ok) return
    expect(esito.ruolo).toBe('marketing')
    expect(esito.sessione).toBe(SESSIONE)
    expect(esito.livello).toBe('employee')
    expect(esito.persona).toBe(claims().sub)
    expect(esito.authInfo).toMatchObject({
      token: TOKEN,
      clientId: CLIENT,
      scopes: [],
      extra: { ruolo: 'marketing', livello: 'employee', persona: claims().sub },
    })
    expect(esito.authInfo.resourceMetadataUrl).toBe(METADATI)
    expect(finto.getClaims).toHaveBeenCalledWith(TOKEN)
    expect(finto.rpc).toHaveBeenCalledWith('mcp_chi_sono')
    // the client that asks mcp_chi_sono carries the person's own token, never the service role
    const perRichiesta = finto.creati.find((c) => JSON.stringify(c).includes('Authorization'))
    expect(perRichiesta?.[1]).toBe('chiave-finta')
    expect(perRichiesta?.[2]).toMatchObject({ global: { headers: { Authorization: `Bearer ${TOKEN}` } } })
  })

  it('ogni ruolo attivo entra dal 22/10/2026, con il suo livello nei progetti', async () => {
    for (const [ruolo, livello] of [['setter', 'employee'], ['coach', 'manager'], ['closer', 'employee']] as const) {
      chiSono({ esito: 'ok', ruolo, livello, filtro: true })
      const esito = await autenticaMcp(`Bearer ${TOKEN}`)
      expect(esito.ok && [esito.ruolo, esito.livello], ruolo).toEqual([ruolo, livello])
    }
  })

  it('un ruolo o un livello che mcp_chi_sono non conosce non entra', async () => {
    chiSono({ esito: 'ok', ruolo: 'ospite', livello: 'employee', filtro: true })
    expect((await autenticaMcp(`Bearer ${TOKEN}`)).ok).toBe(false)
    chiSono({ esito: 'ok', ruolo: 'setter', filtro: true })
    const esito = await autenticaMcp(`Bearer ${TOKEN}`)
    expect(!esito.ok && esito.risposta.status).toBe(401)
  })
})
