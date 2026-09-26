import { describe, expect, it } from 'vitest'

import { parseImporto } from '@/lib/importi'

describe('parseImporto', () => {
  it('capisce le migliaia col punto', () => {
    expect(parseImporto('1.500')).toBe(1500)
    expect(parseImporto('12.500')).toBe(12500)
    expect(parseImporto('1.250.000')).toBe(1250000)
  })

  it('capisce i decimali con la virgola', () => {
    expect(parseImporto('1.500,50')).toBe(1500.5)
    expect(parseImporto('1500,5')).toBe(1500.5)
    expect(parseImporto('0,99')).toBe(0.99)
  })

  it('accetta il punto decimale quando non può essere un separatore delle migliaia', () => {
    expect(parseImporto('1500.50')).toBe(1500.5)
    expect(parseImporto('99.9')).toBe(99.9)
  })

  it('ignora simbolo dell’euro e spazi', () => {
    expect(parseImporto('€ 2 400')).toBe(2400)
    expect(parseImporto('2.400,00 €')).toBe(2400)
  })

  it('rifiuta ciò che non è un importo', () => {
    expect(parseImporto('')).toBeNull()
    expect(parseImporto('abc')).toBeNull()
    expect(parseImporto('1,2,3')).toBeNull()
    expect(parseImporto('1.50.0')).toBeNull()
    expect(parseImporto('10,123')).toBeNull()
    expect(parseImporto('-50')).toBeNull()
  })
})
