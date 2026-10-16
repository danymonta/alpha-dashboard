import { describe, expect, it } from 'vitest'

import { livelloPerformance } from '@/lib/call/analisi/performance'

type Criteri = Parameters<typeof livelloPerformance>[0]
const c = (a: string, b: string, p: string, o: string, ch: string) =>
  ({ scoperta: a, obiettivo: b, presentazione: p, obiezioni: o, chiusura: ch }) as Criteri

describe('livello della performance, calcolato dal codice (sì 2, in parte 1, no 0)', () => {
  it.each([
    [c('si', 'si', 'si', 'si', 'si'), 'ottima'], // 10/10
    [c('si', 'si', 'si', 'si', 'in_parte'), 'ottima'], // 9/10 = 0,90
    [c('si', 'si', 'si', 'in_parte', 'in_parte'), 'buona'], // 8/10
    [c('si', 'si', 'si', 'in_parte', 'no'), 'discreta'], // 7/10
    [c('si', 'si', 'si', 'no', 'no'), 'discreta'], // 6/10
    [c('si', 'si', 'in_parte', 'no', 'no'), 'media'], // 5/10
    [c('si', 'in_parte', 'in_parte', 'no', 'no'), 'media'], // 4/10
    [c('si', 'in_parte', 'no', 'no', 'no'), 'scarsa'], // 3/10
    [c('no', 'no', 'no', 'no', 'no'), 'scarsa'],
  ])('%j -> %s', (criteri, livello) => expect(livelloPerformance(criteri)).toBe(livello))

  it('un criterio non applicabile non conta', () => {
    expect(livelloPerformance(c('si', 'si', 'si', 'non_applicabile', 'si'))).toBe('ottima')
    expect(livelloPerformance(c('no', 'non_applicabile', 'non_applicabile', 'non_applicabile', 'non_applicabile'))).toBe('scarsa')
  })
  it('senza criteri applicabili nessun livello', () => {
    expect(livelloPerformance(c('non_applicabile', 'non_applicabile', 'non_applicabile', 'non_applicabile', 'non_applicabile'))).toBeNull()
  })
})
