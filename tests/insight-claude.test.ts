import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { clienteInsight, InsightNonConfigurato, TIMEOUT_CLIENTE_MS } from '@/lib/insight/claude'

// The Anthropic client of the Insight (1.35.0, C43): every option explicit.

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('clienteInsight', () => {
  it('throws instead of building a client when the key is missing, even with ANTHROPIC_AUTH_TOKEN', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'token-che-non-deve-servire')
    expect(() => clienteInsight()).toThrow(InsightNonConfigurato)
  })

  it('throws on a blank key', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '   ')
    expect(() => clienteInsight()).toThrow(InsightNonConfigurato)
  })

  it('apiKey and baseURL explicit, no auth token, maxRetries 0, timeout 150 s', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('ANTHROPIC_API_KEY', ' finta ')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'token-che-non-deve-servire')
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://127.0.0.1:6011')
    const client = clienteInsight()
    expect(client.apiKey).toBe('finta')
    expect(client.authToken).toBeNull()
    expect(client.baseURL).toBe('http://127.0.0.1:6011')
    expect(client.maxRetries).toBe(0)
    expect(client.timeout).toBe(TIMEOUT_CLIENTE_MS)
  })

  it('a test key never goes to a base that is not this machine, outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('ANTHROPIC_API_KEY', 'finta')
    for (const base of ['https://api.anthropic.com', 'https://altrove.example']) {
      vi.stubEnv('ANTHROPIC_BASE_URL', base)
      expect(() => clienteInsight()).toThrow(InsightNonConfigurato)
    }
    // no ANTHROPIC_BASE_URL at all: api.anthropic.com, refused too
    vi.stubEnv('ANTHROPIC_BASE_URL', '')
    expect(() => clienteInsight()).toThrow(InsightNonConfigurato)
    // a real key may (a developer trying the real model on purpose)
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-api03-prova')
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://api.anthropic.com')
    expect(clienteInsight().baseURL).toBe('https://api.anthropic.com')
  })

  it('in production always api.anthropic.com, whatever ANTHROPIC_BASE_URL says', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('ANTHROPIC_API_KEY', 'finta')
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://altrove.example')
    expect(clienteInsight().baseURL).toBe('https://api.anthropic.com')
  })
})
