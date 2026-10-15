import { describe, expect, it } from 'vitest'

import { entroIlLimite, PREZZI_USD_PER_MTOK, stimaCosto, TOKEN_SYSTEM } from '@/lib/insight/stima-costo'

// The estimate before the analysis (1.35.0, D19): for the cap only.

describe('stimaCosto', () => {
  it('no blocks, no cost', () => {
    expect(stimaCosto([])).toBe(0)
  })

  it('the prices are Claude Sonnet 5.5 (the same as insight_costo_usd)', () => {
    expect(PREZZI_USD_PER_MTOK).toEqual({ input: 2, cache_scritti: 2.5, cache_letti: 0.2, output: 10 })
  })

  it('a day like 08/10 (110 chats) stays around 1 $ and under the 3 $ cap', () => {
    const blocchi = [
      ...Array.from({ length: 13 }, () => ({ tipo: 'schede' as const, elementi: 9, caratteri: 5_500 })),
      ...Array.from({ length: 3 }, () => ({ tipo: 'riattivazione' as const, elementi: 6, caratteri: 10_000 })),
      { tipo: 'agenda' as const, elementi: 6, caratteri: 8_000 },
      { tipo: 'sintesi' as const, elementi: 0, caratteri: 0 },
      { tipo: 'sintesi' as const, elementi: 0, caratteri: 0 },
    ]
    const stima = stimaCosto(blocchi)
    expect(stima).toBeGreaterThan(0.7)
    expect(stima).toBeLessThan(1.5)
    expect(entroIlLimite(stima, 3)).toBe(true)
  })

  it('a broken window with 600 chats goes over the cap', () => {
    const blocchi = Array.from({ length: 60 }, () => ({ tipo: 'schede' as const, elementi: 10, caratteri: 17_000 }))
    expect(entroIlLimite(stimaCosto(blocchi), 3)).toBe(false)
  })

  it('one block: the system prompt written once, nothing read', () => {
    const una = stimaCosto([{ tipo: 'schede', elementi: 1, caratteri: 0 }])
    const atteso = ((1_500 * 2 + TOKEN_SYSTEM * 2.5 + 400 * 10) / 1_000_000)
    expect(una).toBe(Math.ceil(atteso * 100) / 100)
  })
})
