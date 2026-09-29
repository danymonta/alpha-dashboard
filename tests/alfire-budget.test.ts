import { afterEach, describe, expect, it, vi } from 'vitest'

import { budgetAlfire } from '@/lib/alfire/config'

vi.mock('server-only', () => ({}))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('quanto può usare Alfire per ogni risposta', () => {
  it('sul piano gratuito di Groq: la risposta più lunga sta negli 8K token al minuto', () => {
    vi.stubEnv('ALFIRE_PIANO', '')
    expect(budgetAlfire()).toEqual({ messaggi: 8, passi: 6, risposta: 1200, sempreTutti: false })
  })

  it('sul piano Developer lavora come un agente: più storia, più passi, risposte lunghe', () => {
    vi.stubEnv('ALFIRE_PIANO', 'developer')
    const budget = budgetAlfire()
    expect(budget.messaggi).toBeGreaterThan(8)
    expect(budget.passi).toBeGreaterThan(6)
    expect(budget.risposta).toBeGreaterThan(1200)
    expect(budget.sempreTutti).toBe(true)
  })
})
