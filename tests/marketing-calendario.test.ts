import { describe, expect, it } from 'vitest'

import { VISIBILI_PER_GIORNO, grigliaMese, intervalloGriglia, perGiorno } from '@/lib/marketing/calendario'

describe('la griglia del mese, da lunedì a domenica', () => {
  it('ottobre 2026 va dal 28/09 al 01/11: cinque settimane', () => {
    expect(intervalloGriglia('2026-10-01')).toEqual({ da: '2026-09-28', a: '2026-11-01' })
    const griglia = grigliaMese('2026-10-01', '2026-10-09')
    expect(griglia).toHaveLength(5)
    expect(griglia.every((s) => s.length === 7)).toBe(true)
    expect(griglia[0][0]).toEqual({ data: '2026-09-28', delMese: false, oggi: false })
    expect(griglia[0][3]).toEqual({ data: '2026-10-01', delMese: true, oggi: false })
    expect(griglia[4][6]).toEqual({ data: '2026-11-01', delMese: false, oggi: false })
  })

  it('febbraio 2027 è esattamente dal 01/02 al 28/02: quattro settimane', () => {
    expect(intervalloGriglia('2027-02-01')).toEqual({ da: '2027-02-01', a: '2027-02-28' })
    const griglia = grigliaMese('2027-02-01', '2026-10-09')
    expect(griglia).toHaveLength(4)
    expect(griglia.flat().every((g) => g.delMese)).toBe(true)
  })

  it('giugno 2026 parte di lunedì e finisce martedì 30: fino a domenica 05/07', () => {
    expect(intervalloGriglia('2026-06-01')).toEqual({ da: '2026-06-01', a: '2026-07-05' })
    const griglia = grigliaMese('2026-06-01', '2026-10-09')
    expect(griglia).toHaveLength(5)
    expect(griglia[4].map((g) => g.delMese)).toEqual([true, true, false, false, false, false, false])
  })

  it('accetta anche un giorno qualsiasi del mese', () => {
    expect(intervalloGriglia('2026-10-17')).toEqual(intervalloGriglia('2026-10-01'))
  })

  it('segna oggi, e solo oggi', () => {
    const giorni = grigliaMese('2026-10-01', '2026-10-09').flat()
    expect(giorni.filter((g) => g.oggi).map((g) => g.data)).toEqual(['2026-10-09'])
    expect(grigliaMese('2026-11-01', '2026-10-09').flat().some((g) => g.oggi)).toBe(false)
  })

  it('le settimane sono consecutive, senza buchi', () => {
    const giorni = grigliaMese('2026-03-01', '2026-10-09').flat().map((g) => g.data)
    expect(giorni[0]).toBe('2026-02-23')
    expect(new Set(giorni).size).toBe(giorni.length)
    // the change to summer time (29/03/2026) does not skip or repeat a day
    expect(giorni).toContain('2026-03-29')
    expect(giorni).toContain('2026-03-30')
  })
})

describe('perGiorno', () => {
  it('raggruppa per Post Date nell’ordine in cui arrivano; senza data a parte', () => {
    const righe = [
      { id: 'a', post_date: '2026-10-06' },
      { id: 'b', post_date: null },
      { id: 'c', post_date: '2026-10-06' },
      { id: 'd', post_date: '2026-10-07' },
    ]
    const { perData, senzaData } = perGiorno(righe)
    expect(perData.get('2026-10-06')?.map((r) => r.id)).toEqual(['a', 'c'])
    expect(perData.get('2026-10-07')?.map((r) => r.id)).toEqual(['d'])
    expect(perData.has('2026-10-08')).toBe(false)
    expect(senzaData.map((r) => r.id)).toEqual(['b'])
  })

  it('al massimo 3 contenuti per giorno, poi «+N»', () => {
    expect(VISIBILI_PER_GIORNO).toBe(3)
  })
})
