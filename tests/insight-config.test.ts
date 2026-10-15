import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  ANTHROPIC_API_BASE,
  baseAnthropic,
  concorrenzaInsight,
  costoMaxInsight,
  effortInsight,
  inProduzione,
  insightConfigurato,
  modelloInsight,
  urlPasso,
  urlPassoValido,
  UrlPassoNonValido,
} from '@/lib/insight/config'

// Every variable the configuration reads, blank: each test sets only what it needs.
const VARIABILI = [
  'VERCEL_ENV',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'INSIGHT_MODEL',
  'INSIGHT_EFFORT',
  'INSIGHT_CONCORRENZA',
  'INSIGHT_COSTO_MAX_USD',
  'INSIGHT_URL_PASSO',
  'NEXT_PUBLIC_APP_URL',
]

const CHIAVE_PROVA = 'sk-ant-prova-' + 'x'.repeat(40)
const avvisi = vi.spyOn(console, 'warn').mockImplementation(() => {})

beforeEach(() => {
  for (const nome of VARIABILI) vi.stubEnv(nome, '')
  vi.stubEnv('NODE_ENV', 'test')
  avvisi.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** No warning ever says a value. */
function nessunValoreNeiLog(...valori: string[]) {
  const scritto = avvisi.mock.calls.flat().join(' ')
  for (const v of valori) expect(scritto).not.toContain(v)
}

describe('insightConfigurato', () => {
  it('is false without the key, or with a blank one', () => {
    expect(insightConfigurato()).toBe(false)
    vi.stubEnv('ANTHROPIC_API_KEY', '   ')
    expect(insightConfigurato()).toBe(false)
    vi.stubEnv('ANTHROPIC_API_KEY', '\n\t')
    expect(insightConfigurato()).toBe(false)
  })

  it('is true with a key', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', CHIAVE_PROVA)
    expect(insightConfigurato()).toBe(true)
  })
})

describe('inProduzione', () => {
  it('is Vercel production or a production build', () => {
    expect(inProduzione()).toBe(false)
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(inProduzione()).toBe(true)
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(inProduzione()).toBe(false)
    vi.stubEnv('NODE_ENV', 'production')
    expect(inProduzione()).toBe(true)
  })
})

describe('baseAnthropic', () => {
  it('is Anthropic without ANTHROPIC_BASE_URL', () => {
    expect(baseAnthropic()).toBe(ANTHROPIC_API_BASE)
    expect(ANTHROPIC_API_BASE).toBe('https://api.anthropic.com')
  })

  it('takes the fake model of the tests outside production', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://127.0.0.1:6011')
    expect(baseAnthropic()).toBe('http://127.0.0.1:6011')
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://localhost:4011/')
    expect(baseAnthropic()).toBe('http://localhost:4011')
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://proxy.example.test/anthropic/')
    expect(baseAnthropic()).toBe('https://proxy.example.test/anthropic')
  })

  it('production ignores ANTHROPIC_BASE_URL', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://127.0.0.1:6011')
    vi.stubEnv('NODE_ENV', 'production')
    expect(baseAnthropic()).toBe('https://api.anthropic.com')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(baseAnthropic()).toBe('https://api.anthropic.com')
  })

  it('never sends the key in clear to another machine, and never logs the value', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://192.168.1.20:6011')
    expect(baseAnthropic()).toBe(ANTHROPIC_API_BASE)
    vi.stubEnv('ANTHROPIC_BASE_URL', 'non-un-indirizzo')
    expect(baseAnthropic()).toBe(ANTHROPIC_API_BASE)
    expect(avvisi).toHaveBeenCalledTimes(2)
    nessunValoreNeiLog('192.168.1.20', 'non-un-indirizzo')
  })
})

describe('urlPasso', () => {
  it('outside production «manuale» gives null: nothing is dispatched', () => {
    vi.stubEnv('INSIGHT_URL_PASSO', 'manuale')
    expect(urlPasso()).toBeNull()
  })

  it('outside production takes INSIGHT_URL_PASSO (the dev server seen from Docker)', () => {
    vi.stubEnv('INSIGHT_URL_PASSO', 'http://host.docker.internal:3200/api/cron/insight')
    expect(urlPasso()).toBe('http://host.docker.internal:3200/api/cron/insight')
  })

  it('outside production refuses an INSIGHT_URL_PASSO the database would refuse', () => {
    vi.stubEnv('INSIGHT_URL_PASSO', 'http://192.168.1.20:3200/api/cron/insight')
    expect(() => urlPasso()).toThrow(UrlPassoNonValido)
    vi.stubEnv('INSIGHT_URL_PASSO', 'http://host.docker.internal:3200/api/altro')
    expect(() => urlPasso()).toThrow(UrlPassoNonValido)
  })

  it('outside production, without INSIGHT_URL_PASSO, uses the app URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3200')
    expect(urlPasso()).toBe('http://localhost:3200/api/cron/insight')
  })

  it('in production uses APP_URL and ignores INSIGHT_URL_PASSO', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dashboard.percorsoalpha.com')
    vi.stubEnv('INSIGHT_URL_PASSO', 'manuale')
    expect(urlPasso()).toBe('https://dashboard.percorsoalpha.com/api/cron/insight')
    vi.stubEnv('INSIGHT_URL_PASSO', 'http://host.docker.internal:3200/api/cron/insight')
    expect(urlPasso()).toBe('https://dashboard.percorsoalpha.com/api/cron/insight')
    // a path on APP_URL never ends up in the step URL
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dashboard.percorsoalpha.com/insight')
    expect(urlPasso()).toBe('https://dashboard.percorsoalpha.com/api/cron/insight')
  })

  it('in production throws on an app URL that is not https', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://dashboard.percorsoalpha.com')
    expect(() => urlPasso()).toThrow(UrlPassoNonValido)
    // APP_URL missing: the public default is http://localhost:3000
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    expect(() => urlPasso()).toThrow(UrlPassoNonValido)
    // a port: the database's check refuses it
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dashboard.percorsoalpha.com:8443')
    expect(() => urlPasso()).toThrow(UrlPassoNonValido)
  })

  it('says what to do, in Italian', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://dashboard.percorsoalpha.com')
    expect(() => urlPasso()).toThrow('Indirizzo dell’app non configurato: imposta APP_URL su Vercel e rifai il deploy.')
  })

  it('urlPassoValido mirrors the check of insight_impostazioni.url_passo', () => {
    expect(urlPassoValido('https://dashboard.percorsoalpha.com/api/cron/insight', true)).toBe(true)
    expect(urlPassoValido('http://host.docker.internal:3200/api/cron/insight', true)).toBe(false)
    expect(urlPassoValido('http://host.docker.internal:3200/api/cron/insight', false)).toBe(true)
    expect(urlPassoValido('http://127.0.0.1/api/cron/insight', false)).toBe(true)
    expect(urlPassoValido('http://localhost:3200/api/cron/insight', false)).toBe(true)
    expect(urlPassoValido('http://example.test/api/cron/insight', false)).toBe(false)
    expect(urlPassoValido('https://dashboard.percorsoalpha.com/api/cron/insight?x=1', false)).toBe(false)
    expect(urlPassoValido('https://Dashboard.percorsoalpha.com/api/cron/insight', false)).toBe(false)
  })
})

describe('model, effort, concurrency and cost cap', () => {
  it('have the defaults of the specification', () => {
    expect(modelloInsight()).toBe('claude-sonnet-5-5')
    expect(effortInsight()).toBe('medium')
    expect(concorrenzaInsight()).toBe(6)
    expect(costoMaxInsight()).toBe(3)
    expect(avvisi).not.toHaveBeenCalled()
  })

  it('take valid values', () => {
    vi.stubEnv('INSIGHT_MODEL', 'claude-sonnet-5')
    vi.stubEnv('INSIGHT_EFFORT', 'LOW')
    vi.stubEnv('INSIGHT_CONCORRENZA', '2')
    vi.stubEnv('INSIGHT_COSTO_MAX_USD', '2,5')
    expect(modelloInsight()).toBe('claude-sonnet-5')
    expect(effortInsight()).toBe('low')
    expect(concorrenzaInsight()).toBe(2)
    expect(costoMaxInsight()).toBe(2.5)
  })

  it('ignore invalid values, with a warning that never says them', () => {
    vi.stubEnv('INSIGHT_MODEL', 'gpt-oss-120b')
    vi.stubEnv('INSIGHT_EFFORT', 'max')
    vi.stubEnv('INSIGHT_CONCORRENZA', '2.5')
    vi.stubEnv('INSIGHT_COSTO_MAX_USD', '-1')
    expect(modelloInsight()).toBe('claude-sonnet-5-5')
    expect(effortInsight()).toBe('medium')
    expect(concorrenzaInsight()).toBe(6)
    expect(costoMaxInsight()).toBe(3)
    vi.stubEnv('INSIGHT_CONCORRENZA', '0')
    vi.stubEnv('INSIGHT_COSTO_MAX_USD', '1000')
    expect(concorrenzaInsight()).toBe(6)
    expect(costoMaxInsight()).toBe(3)
    vi.stubEnv('INSIGHT_CONCORRENZA', '13')
    vi.stubEnv('INSIGHT_COSTO_MAX_USD', 'tre')
    expect(concorrenzaInsight()).toBe(6)
    expect(costoMaxInsight()).toBe(3)
    nessunValoreNeiLog('gpt-oss-120b', '2.5', '1000', 'tre')
  })
})

describe('the module', () => {
  const sorgente = readFileSync(new URL('../lib/insight/config.ts', import.meta.url), 'utf8')

  it('is server only and never imports the SDK (the page and the settings import it)', () => {
    expect(sorgente.startsWith("import 'server-only'")).toBe(true)
    expect(sorgente).not.toMatch(/(from|import)\s*\(?\s*['"]@anthropic-ai\//)
  })
})
