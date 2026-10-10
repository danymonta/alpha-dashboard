import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/env', () => ({
  publicEnv: { supabaseUrl: 'http://127.0.0.1:54321/', supabasePublishableKey: 'chiave-finta', appUrl: 'http://localhost:3000/' },
}))

import { GET as metadati, OPTIONS } from '@/app/.well-known/oauth-protected-resource/[[...percorso]]/route'
import { POST as mcp } from '@/app/mcp/route'
import { origineAmmessaMcp } from '@/lib/mcp/origine'

/**
 * The protected resource metadata (RFC 9728) and the 401 that points to it:
 * built from the environment, never from the Host header.
 */

const FALSO = { host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' }

function contesto(percorso?: string[]) {
  return { params: Promise.resolve(percorso === undefined ? {} : { percorso }) }
}

describe('/.well-known/oauth-protected-resource', () => {
  it.each([
    ['la radice', undefined],
    ['/mcp', ['mcp']],
  ])('%s: la risorsa /mcp e Supabase Auth come server di accesso', async (_, percorso) => {
    const risposta = await metadati(new Request('https://evil.example/.well-known/oauth-protected-resource/mcp', { headers: FALSO }), contesto(percorso))
    expect(risposta.status).toBe(200)
    expect(await risposta.json()).toEqual({
      resource: 'http://localhost:3000/mcp',
      authorization_servers: ['http://127.0.0.1:54321/auth/v1'],
      bearer_methods_supported: ['header'],
      resource_name: 'Alpha Management',
    })
    expect(risposta.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(risposta.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it.each([
    ['un’altra risorsa', ['altro']],
    ['un percorso sotto /mcp', ['mcp', 'x']],
  ])('%s: 404', async (_, percorso) => {
    const risposta = await metadati(new Request('http://localhost:3000/'), contesto(percorso))
    expect(risposta.status).toBe(404)
    expect((await OPTIONS(new Request('http://localhost:3000/'), contesto(percorso))).status).toBe(404)
  })

  it('OPTIONS risponde per il CORS (MCP Inspector)', async () => {
    const risposta = await OPTIONS(new Request('http://localhost:3000/'), contesto(['mcp']))
    expect(risposta.status).toBe(204)
    expect(risposta.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
  })
})

describe('il 401 di /mcp', () => {
  it('punta ai metadati dell’ambiente, anche con un Host falso', async () => {
    const risposta = await mcp(new Request('http://localhost:3000/mcp', { method: 'POST', headers: FALSO, body: '{}' }))
    expect(risposta.status).toBe(401)
    expect(risposta.headers.get('WWW-Authenticate')).toBe(
      'Bearer error="invalid_token", error_description="Missing Authorization header", resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"',
    )
    expect(risposta.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('le origini ammesse su /mcp', () => {
  it.each([
    [null, true],
    ['https://claude.ai', true],
    ['https://claude.com', true],
    ['http://localhost:3000', true],
    ['https://claude.ai.evil.com', false],
    ['https://evil.example', false],
    ['null', false],
    ['https://claude.ai/percorso', false],
  ])('%s in produzione: %s', (origine, attesa) => {
    expect(origineAmmessaMcp(origine, true)).toBe(attesa)
  })

  it('MCP Inspector in locale: localhost e 127.0.0.1 su ogni porta, mai in produzione', () => {
    expect(origineAmmessaMcp('http://localhost:6274', false)).toBe(true)
    expect(origineAmmessaMcp('http://127.0.0.1:6274', false)).toBe(true)
    expect(origineAmmessaMcp('http://localhost:6274', true)).toBe(false)
    expect(origineAmmessaMcp('https://localhost:6274', false)).toBe(false)
  })
})
