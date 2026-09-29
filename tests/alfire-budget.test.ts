import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// the plan read from Groq lives in the module: a fresh copy for every test
async function config() {
  vi.resetModules()
  return import('@/lib/alfire/config')
}

beforeEach(() => {
  vi.stubEnv('ALFIRE_PIANO', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

function limiti(tokenAlMinuto: string) {
  return new Headers({ 'x-ratelimit-limit-tokens': tokenAlMinuto })
}

describe('quanto può usare Alfire per ogni risposta', () => {
  it('prima di sentire Groq, e sul piano gratuito: la risposta più lunga sta negli 8K token al minuto', async () => {
    const { budgetAlfire, pianoAlfire, ricordaLimiti } = await config()
    expect(pianoAlfire()).toBe('gratuito')
    ricordaLimiti(limiti('8000'))
    expect(pianoAlfire()).toBe('gratuito')
    expect(budgetAlfire()).toEqual({ messaggi: 8, passi: 6, risposta: 1200, sempreTutti: false })
  })

  it('appena Groq dice 250K token al minuto (piano Developer) lavora da agente, senza toccare Vercel', async () => {
    const { budgetAlfire, pianoAlfire, ricordaLimiti } = await config()
    ricordaLimiti(limiti('250000'))
    expect(pianoAlfire()).toBe('developer')
    const budget = budgetAlfire()
    expect(budget.sempreTutti).toBe(true)
    expect(budget.messaggi).toBeGreaterThan(8)
    expect(budget.passi).toBeGreaterThan(6)
    expect(budget.risposta).toBeGreaterThan(1200)
  })

  it('una risposta senza limiti non cambia niente', async () => {
    const { pianoAlfire, ricordaLimiti } = await config()
    ricordaLimiti(limiti('250000'))
    ricordaLimiti(new Headers())
    expect(pianoAlfire()).toBe('developer')
  })

  it('ALFIRE_PIANO lo forza, in un senso o nell’altro', async () => {
    const { pianoAlfire, ricordaLimiti } = await config()
    vi.stubEnv('ALFIRE_PIANO', 'developer')
    expect(pianoAlfire()).toBe('developer')
    vi.stubEnv('ALFIRE_PIANO', 'gratuito')
    ricordaLimiti(limiti('250000'))
    expect(pianoAlfire()).toBe('gratuito')
  })
})

describe('il testo in diretta della voce, piano per piano', () => {
  const voce = (richiesteAlGiorno: string) => new Headers({ 'x-ratelimit-limit-requests': richiesteAlGiorno })

  it('finché Whisper non ha detto il suo piano, il testo in diretta c’è', async () => {
    const { testoInDirettaConsentito, ricordaLimitiVoce } = await config()
    expect(testoInDirettaConsentito()).toBe(true)
    ricordaLimitiVoce(new Headers())
    expect(testoInDirettaConsentito()).toBe(true)
  })

  it('Whisper gratuito (2K richieste al giorno): niente parziali, solo il testo finale', async () => {
    const { testoInDirettaConsentito, ricordaLimitiVoce } = await config()
    ricordaLimitiVoce(voce('2000'))
    expect(testoInDirettaConsentito()).toBe(false)
  })

  it('Whisper sul Developer (200K al giorno): testo in diretta', async () => {
    const { testoInDirettaConsentito, ricordaLimitiVoce } = await config()
    ricordaLimitiVoce(voce('2000'))
    ricordaLimitiVoce(voce('200000'))
    expect(testoInDirettaConsentito()).toBe(true)
  })

  it('ALFIRE_PIANO lo forza, in un senso o nell’altro', async () => {
    const { testoInDirettaConsentito, ricordaLimitiVoce } = await config()
    vi.stubEnv('ALFIRE_PIANO', 'gratuito')
    expect(testoInDirettaConsentito()).toBe(false)
    vi.stubEnv('ALFIRE_PIANO', 'developer')
    ricordaLimitiVoce(voce('2000'))
    expect(testoInDirettaConsentito()).toBe(true)
  })
})
