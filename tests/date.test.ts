import { describe, expect, it } from 'vitest'

import {
  aggiungiGiorni,
  dataReportValida,
  etichettaGiorno,
  etichettaGiornoBreve,
  finestraReport,
  formatOra,
  isDataISO,
  oggiRoma,
} from '@/lib/date'

describe('oggiRoma', () => {
  it('a mezzanotte e mezza in Italia è già il giorno nuovo, anche se in UTC no', () => {
    // 22:30 UTC del 25/09 = 00:30 del 26/09 a Roma (ora legale, UTC+2)
    expect(oggiRoma(new Date('2026-09-25T22:30:00Z'))).toBe('2026-09-26')
  })

  it('rispetta l’ora solare d’inverno', () => {
    // 23:30 UTC del 14/01 = 00:30 del 15/01 a Roma (UTC+1)
    expect(oggiRoma(new Date('2026-01-14T23:30:00Z'))).toBe('2026-01-15')
    expect(oggiRoma(new Date('2026-01-14T22:30:00Z'))).toBe('2026-01-14')
  })
})

describe('aggiungiGiorni', () => {
  it('attraversa i cambi di mese e di anno', () => {
    expect(aggiungiGiorni('2026-10-01', -1)).toBe('2026-09-30')
    expect(aggiungiGiorni('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('non perde un giorno al cambio dell’ora legale', () => {
    expect(aggiungiGiorni('2026-03-28', 1)).toBe('2026-03-29')
    expect(aggiungiGiorni('2026-03-29', 1)).toBe('2026-03-30')
    expect(aggiungiGiorni('2026-10-25', 1)).toBe('2026-10-26')
  })
})

describe('finestra del report', () => {
  const oggi = '2026-09-26'

  it('copre oggi e i 7 giorni precedenti, come la policy RLS', () => {
    expect(finestraReport(oggi)).toEqual({ minima: '2026-09-19', massima: oggi })
  })

  it('accetta una data dentro la finestra', () => {
    expect(dataReportValida('2026-09-19', oggi)).toBe('2026-09-19')
    expect(dataReportValida('2026-09-25', oggi)).toBe('2026-09-25')
  })

  it('riporta a oggi ciò che è fuori finestra, nel futuro o malformato', () => {
    expect(dataReportValida('2026-09-18', oggi)).toBe(oggi)
    expect(dataReportValida('2026-09-27', oggi)).toBe(oggi)
    expect(dataReportValida('2026-02-30', oggi)).toBe(oggi)
    expect(dataReportValida('ieri', oggi)).toBe(oggi)
    expect(dataReportValida(undefined, oggi)).toBe(oggi)
  })
})

describe('isDataISO', () => {
  it('rifiuta date inesistenti', () => {
    expect(isDataISO('2026-02-29')).toBe(false)
    expect(isDataISO('2028-02-29')).toBe(true)
  })
})

describe('etichette', () => {
  const oggi = '2026-09-26'

  it('usa Oggi e Ieri, poi il giorno della settimana', () => {
    expect(etichettaGiorno('2026-09-26', oggi)).toBe('Oggi')
    expect(etichettaGiorno('2026-09-25', oggi)).toBe('Ieri')
    expect(etichettaGiorno('2026-09-27', oggi)).toBe('Domani')
    expect(etichettaGiorno('2026-09-21', oggi)).toBe('lunedì 21/09')
  })

  it('ha una versione breve per le colonne strette', () => {
    expect(etichettaGiornoBreve('2026-09-26', oggi)).toBe('oggi')
    expect(etichettaGiornoBreve('2026-09-21', oggi)).toBe('lun 21/09')
  })

  it('mostra l’ora di salvataggio in ora italiana', () => {
    expect(formatOra('2026-09-26T16:42:10Z')).toBe('18:42')
  })
})

describe('mesi', () => {
  it('legge il parametro del mese', async () => {
    const { parseMese } = await import('@/lib/date')
    expect(parseMese('2026-09')).toBe('2026-09-01')
    expect(parseMese('2026-09-01')).toBe('2026-09-01')
    expect(parseMese('2026-13')).toBeNull()
    expect(parseMese('settembre')).toBeNull()
    expect(parseMese(undefined)).toBeNull()
  })

  it('somma e sottrae mesi attraversando l’anno', async () => {
    const { aggiungiMesi } = await import('@/lib/date')
    expect(aggiungiMesi('2026-01-01', -1)).toBe('2025-12-01')
    expect(aggiungiMesi('2026-12-01', 1)).toBe('2027-01-01')
    expect(aggiungiMesi('2026-09-01', -12)).toBe('2025-09-01')
  })

  it('trova l’ultimo giorno del mese, febbraio bisestile compreso', async () => {
    const { fineMese } = await import('@/lib/date')
    expect(fineMese('2026-02-01')).toBe('2026-02-28')
    expect(fineMese('2028-02-01')).toBe('2028-02-29')
    expect(fineMese('2026-09-01')).toBe('2026-09-30')
  })
})
