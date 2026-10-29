import { describe, expect, it } from 'vitest'

import { secondiDelTimer } from '@/lib/tempo'

const inizio = '2026-10-29T08:00:00.000Z'
const ore = (h: number) => Date.parse(inizio) + h * 3600_000

describe('secondiDelTimer', () => {
  it('conta dall’inizio senza pause', () => {
    expect(secondiDelTimer({ inizio }, ore(1))).toBe(3600)
  })
  it('toglie le pause finite', () => {
    expect(secondiDelTimer({ inizio, pausaSecondi: 600 }, ore(1))).toBe(3000)
  })
  it('in pausa il cronometro sta fermo', () => {
    const timer = { inizio, pausaDal: new Date(ore(1)).toISOString(), pausaSecondi: 600 }
    expect(secondiDelTimer(timer, ore(2))).toBe(3000)
    expect(secondiDelTimer(timer, ore(5))).toBe(3000)
  })
  it('mai sotto zero', () => {
    expect(secondiDelTimer({ inizio, pausaSecondi: 99999 }, ore(1))).toBe(0)
  })
})
