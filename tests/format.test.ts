import { describe, expect, it } from 'vitest'

import {
  VUOTO,
  formatData,
  formatEuro,
  formatMese,
  formatNumero,
  formatPercentuale,
  primoDelMese,
  rapporto,
} from '@/lib/format'

describe('formatEuro', () => {
  it('formatta in italiano con due decimali', () => {
    expect(formatEuro(1234.5)).toBe('1.234,50\u00a0€')
  })

  it('accetta il numeric di Postgres, che arriva come stringa', () => {
    expect(formatEuro('4500.00')).toBe('4.500,00\u00a0€')
  })

  it('gestisce i negativi dei rimborsi', () => {
    expect(formatEuro(-800)).toBe('-800,00\u00a0€')
  })

  it('non inventa zeri quando il valore manca', () => {
    expect(formatEuro(null)).toBe(VUOTO)
    expect(formatEuro(undefined)).toBe(VUOTO)
  })
})

describe('rapporto e percentuali', () => {
  it('con denominatore zero non restituisce NaN né Infinity', () => {
    expect(rapporto(3, 0)).toBeNull()
    expect(formatPercentuale(rapporto(3, 0))).toBe(VUOTO)
  })

  it('calcola un tasso normale', () => {
    expect(rapporto(3, 12)).toBe(0.25)
    expect(formatPercentuale(0.25)).toBe('25%')
  })

  it('non confonde zero con assenza di dato', () => {
    expect(rapporto(0, 12)).toBe(0)
    expect(formatPercentuale(0)).toBe('0%')
  })
  it('in una colonna di quote, sempre un decimale', () => {
    expect(formatPercentuale(0.13, { unDecimale: true })).toBe('13,0%')
    expect(formatPercentuale(0.4029, { unDecimale: true })).toBe('40,3%')
    expect(formatPercentuale(null, { unDecimale: true })).toBe(VUOTO)
  })
})

describe('numeri', () => {
  it('usa il separatore delle migliaia italiano', () => {
    expect(formatNumero(12345)).toBe('12.345')
  })

  it('mostra il segnaposto quando non c’è valore', () => {
    expect(formatNumero(null)).toBe(VUOTO)
  })
})

describe('date', () => {
  it('formatta dd/MM/yyyy', () => {
    expect(formatData('2026-09-07')).toBe('07/09/2026')
  })

  it('non slitta di un giorno per via del fuso', () => {
    expect(formatData('2026-01-01')).toBe('01/01/2026')
    expect(formatData('2026-12-31')).toBe('31/12/2026')
  })

  it('scrive il mese per esteso in italiano', () => {
    expect(formatMese('2026-09-01')).toBe('settembre 2026')
  })

  it('riporta al primo del mese', () => {
    expect(primoDelMese('2026-09-26')).toBe('2026-09-01')
  })
})
