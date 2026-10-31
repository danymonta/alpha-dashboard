import { describe, expect, it } from 'vitest'

import { CALENDARIO_CONTENUTI } from '@/lib/i18n/testi/calendario-contenuti'
import {
  LIMITE_SENZA_DATA,
  ORDINE_STATUS,
  PUNTI_PER_GIORNO,
  VISIBILI_PER_GIORNO,
  conPostDate,
  giorniConContenuti,
  grigliaMese,
  intervalloGriglia,
  ordineCalendario,
  perGiorno,
  puntiDelGiorno,
  statiContati,
} from '@/lib/marketing/calendario'

describe('la griglia del mese, da lunedì a domenica', () => {
  it('ottobre 2026 va dal 28/09 al 01/11: cinque settimane', () => {
    expect(intervalloGriglia('2026-10-01')).toEqual({ da: '2026-09-28', a: '2026-11-01' })
    const griglia = grigliaMese('2026-10-01', '2026-10-31')
    expect(griglia).toHaveLength(5)
    expect(griglia.every((s) => s.length === 7)).toBe(true)
    expect(griglia[0][0]).toEqual({ data: '2026-09-28', delMese: false, oggi: false })
    expect(griglia[0][3]).toEqual({ data: '2026-10-01', delMese: true, oggi: false })
    expect(griglia[4][5]).toEqual({ data: '2026-10-31', delMese: true, oggi: true })
    expect(griglia[4][6]).toEqual({ data: '2026-11-01', delMese: false, oggi: false })
  })

  it('febbraio 2027 è esattamente dal 01/02 al 28/02: quattro settimane', () => {
    expect(intervalloGriglia('2027-02-01')).toEqual({ da: '2027-02-01', a: '2027-02-28' })
    const griglia = grigliaMese('2027-02-01', '2026-10-31')
    expect(griglia).toHaveLength(4)
    expect(griglia.flat().every((g) => g.delMese)).toBe(true)
  })

  it('un mese che chiede sei settimane: novembre 2026 (da domenica 1 a lunedì 30)', () => {
    expect(intervalloGriglia('2026-11-01')).toEqual({ da: '2026-10-26', a: '2026-12-06' })
    expect(grigliaMese('2026-11-01', '2026-10-31')).toHaveLength(6)
  })

  it('accetta anche un giorno qualsiasi del mese', () => {
    expect(intervalloGriglia('2026-10-17')).toEqual(intervalloGriglia('2026-10-01'))
  })

  it('segna oggi, e solo oggi', () => {
    const giorni = grigliaMese('2026-10-01', '2026-10-09').flat()
    expect(giorni.filter((g) => g.oggi).map((g) => g.data)).toEqual(['2026-10-09'])
    expect(grigliaMese('2026-12-01', '2026-10-09').flat().some((g) => g.oggi)).toBe(false)
  })

  it('le settimane sono consecutive, senza buchi, anche al cambio d’ora', () => {
    const giorni = grigliaMese('2026-03-01', '2026-10-09').flat().map((g) => g.data)
    expect(giorni[0]).toBe('2026-02-23')
    expect(new Set(giorni).size).toBe(giorni.length)
    expect(giorni).toContain('2026-03-29')
    expect(giorni).toContain('2026-03-30')
  })
})

describe('i contenuti per giorno', () => {
  const righe = [
    { id: 'a', post_date: '2026-10-06', stato: 'posted' as const },
    { id: 'b', post_date: null, stato: 'not_started' as const },
    { id: 'c', post_date: '2026-10-06', stato: 'to_be_edited' as const },
    { id: 'd', post_date: '2026-10-07', stato: 'not_started' as const },
    { id: 'e', post_date: '2026-09-29', stato: 'posted' as const },
  ]

  it('raggruppa per Post Date nell’ordine in cui arrivano; senza data a parte', () => {
    const { perData, senzaData } = perGiorno(righe)
    expect(perData.get('2026-10-06')?.map((r) => r.id)).toEqual(['a', 'c'])
    expect(perData.get('2026-10-07')?.map((r) => r.id)).toEqual(['d'])
    expect(perData.has('2026-10-08')).toBe(false)
    expect(senzaData.map((r) => r.id)).toEqual(['b'])
  })

  it('l’agenda del telefono ha solo i giorni del mese con contenuti, in ordine', () => {
    const { perData } = perGiorno(righe)
    // the 29/09 is in October's grid but not in October
    expect(giorniConContenuti(perData, '2026-10-01')).toEqual(['2026-10-06', '2026-10-07'])
    expect(giorniConContenuti(perData, '2026-11-01')).toEqual([])
  })

  it('un contenuto trascinato cambia solo la sua Post Date', () => {
    const spostate = conPostDate(righe, 'd', '2026-10-20')
    expect(spostate.find((r) => r.id === 'd')?.post_date).toBe('2026-10-20')
    expect(spostate.filter((r) => r.id !== 'd')).toEqual(righe.filter((r) => r.id !== 'd'))
    // the rows passed in stay as they were
    expect(righe.find((r) => r.id === 'd')?.post_date).toBe('2026-10-07')
  })

  it('l’ordine del pannello: i giorni in ordine, poi quelli senza data', () => {
    const conData = righe.filter((r) => r.post_date)
    const senza = righe.filter((r) => !r.post_date)
    expect(ordineCalendario(conData, senza)).toEqual(['e', 'a', 'c', 'd', 'b'])
  })

  it('al massimo 3 contenuti per giorno, poi «+N»; al massimo 50 senza data', () => {
    expect(VISIBILI_PER_GIORNO).toBe(3)
    expect(LIMITE_SENZA_DATA).toBe(50)
  })
})

describe('lo Status a colpo d’occhio', () => {
  it('il mini mese: un pallino per contenuto, al massimo 3, poi «+»', () => {
    expect(PUNTI_PER_GIORNO).toBe(3)
    expect(puntiDelGiorno(['posted'])).toEqual({ punti: ['posted'], altri: 0 })
    expect(puntiDelGiorno(['posted', 'canceled', 'not_started', 'to_be_edited', 'posted'])).toEqual({
      punti: ['posted', 'canceled', 'not_started'],
      altri: 2,
    })
    expect(puntiDelGiorno([])).toEqual({ punti: [], altri: 0 })
  })

  it('gli Status di un giorno, contati nell’ordine del lavoro e senza gli zeri', () => {
    expect(statiContati(['posted', 'not_started', 'posted', 'to_be_recorded'])).toEqual([
      { stato: 'not_started', n: 1 },
      { stato: 'to_be_recorded', n: 1 },
      { stato: 'posted', n: 2 },
    ])
  })

  it('la legenda ha i sei Status nell’ordine del lavoro', () => {
    expect(ORDINE_STATUS).toEqual(['not_started', 'to_be_recorded', 'to_be_edited', 'to_be_posted', 'posted', 'canceled'])
  })
})

describe('le parole del calendario', () => {
  it('i giorni in italiano e in inglese, la settimana da lunedì', () => {
    expect(CALENDARIO_CONTENUTI.it.giorno('2026-10-05')).toBe('lunedì 05/10')
    expect(CALENDARIO_CONTENUTI.en.giorno('2026-10-05')).toBe('Monday 05/10')
    expect(CALENDARIO_CONTENUTI.it.titoloGiorno('2026-10-31', '2026-10-31')).toBe('Oggi, sabato 31/10')
    expect(CALENDARIO_CONTENUTI.it.titoloGiorno('2026-10-06', '2026-10-31')).toBe('Martedì 06/10')
    expect(CALENDARIO_CONTENUTI.it.giorniBrevi[0]).toBe('lun')
    expect(CALENDARIO_CONTENUTI.en.giorniBrevi[6]).toBe('Sun')
  })

  it('i nomi accessibili cominciano con le parole che si vedono (WCAG 2.5.3)', () => {
    expect(CALENDARIO_CONTENUTI.it.voceLegenda('Posted', 3, false)).toMatch(/^Posted, 3 contenuti/)
    expect(CALENDARIO_CONTENUTI.it.card('Reel trazioni', 'Posted', 'Education')).toBe('Reel trazioni, Posted, Education')
    expect(CALENDARIO_CONTENUTI.it.card('Reel trazioni', 'Not started', null)).toBe('Reel trazioni, Not started')
    expect(CALENDARIO_CONTENUTI.it.giornoConContenuti('2026-10-06', 2, 'Posted 1, To be edited 1')).toBe(
      'martedì 06/10, 2 contenuti: Posted 1, To be edited 1',
    )
  })
})
