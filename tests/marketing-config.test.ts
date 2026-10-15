import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  effortAnalisi,
  effortVisione,
  ideeDaProporre,
  latoFotogrammi,
  modelloAnalisi,
  MODELLO_ANALISI_PREDEFINITO,
  urlPassoMarketing,
  UrlPassoMarketingNonValido,
} from '@/lib/marketing/analisi/config'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('configurazione dell’analisi dei reel', () => {
  it('il modello: quello predefinito, o uno che ha la forma di un modello Claude', () => {
    vi.stubEnv('MARKETING_MODELLO_ANALISI', '')
    expect(modelloAnalisi()).toBe(MODELLO_ANALISI_PREDEFINITO)
    vi.stubEnv('MARKETING_MODELLO_ANALISI', 'claude-opus-5')
    expect(modelloAnalisi()).toBe('claude-opus-5')
    vi.stubEnv('MARKETING_MODELLO_ANALISI', 'gpt-4; rm -rf')
    expect(modelloAnalisi()).toBe(MODELLO_ANALISI_PREDEFINITO)
  })

  it('l’effort: low, medium o high, altrimenti medium', () => {
    vi.stubEnv('MARKETING_EFFORT_VISIONE', 'HIGH')
    vi.stubEnv('MARKETING_EFFORT_ANALISI', 'altissimo')
    expect(effortVisione()).toBe('high')
    expect(effortAnalisi()).toBe('medium')
  })

  it('il lato dei fotogrammi: 896 o 1280', () => {
    expect(latoFotogrammi()).toBe(896)
    vi.stubEnv('MARKETING_LATO_FOTOGRAMMI', '1280')
    expect(latoFotogrammi()).toBe(1280)
    vi.stubEnv('MARKETING_LATO_FOTOGRAMMI', '4000')
    expect(latoFotogrammi()).toBe(896)
  })

  it('quante idee e di che tipo per verdetto', () => {
    expect(ideeDaProporre('cambiare')).toEqual({ quante: 3, tipo: 'rifacimento' })
    expect(ideeDaProporre('spingere')).toEqual({ quante: 2, tipo: 'seguito' })
    expect(ideeDaProporre('mantenere')).toEqual({ quante: 2, tipo: 'rifacimento_o_nuovo' })
    expect(ideeDaProporre(null)).toEqual({ quante: 2, tipo: 'nuovo' })
  })

  it('l’indirizzo dei passi in locale: manuale o vuoto è nessun invio, un indirizzo locale vale, altro no', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('MARKETING_URL_PASSO', '')
    expect(urlPassoMarketing()).toBeNull()
    vi.stubEnv('MARKETING_URL_PASSO', 'manuale')
    expect(urlPassoMarketing()).toBeNull()
    vi.stubEnv('MARKETING_URL_PASSO', 'http://host.docker.internal:3200/api/cron/marketing')
    expect(urlPassoMarketing()).toBe('http://host.docker.internal:3200/api/cron/marketing')
    for (const brutto of ['https://altrove.example/api/cron/marketing', 'http://127.0.0.1:3200/altro', 'http://evil.test/api/cron/marketing']) {
      vi.stubEnv('MARKETING_URL_PASSO', brutto)
      expect(() => urlPassoMarketing()).toThrow(UrlPassoMarketingNonValido)
    }
  })
})
