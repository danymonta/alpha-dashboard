import { describe, expect, it } from 'vitest'

import { RUOLI_RECAP, percorsoIniziale, soloRecap } from '@/lib/auth/roles'
import { RECAP } from '@/lib/i18n/testi/recap'
import { etichettaPunto, giornoBreve, leggiRecap, recapVuoto } from '@/lib/recap/recap'

const mese = { breve: (iso: string) => `b:${iso}`, lungo: (iso: string) => `l:${iso}` }

describe('il recap vendite (1.58.0)', () => {
  it('lo aprono l’admin e il business coach; il business coach solo quello', () => {
    expect([...RUOLI_RECAP]).toEqual(['admin', 'business_coach'])
    expect(soloRecap('business_coach')).toBe(true)
    expect(soloRecap('admin')).toBe(false)
    expect(percorsoIniziale('business_coach')).toBe('/recap')
    expect(percorsoIniziale('admin')).toBe('/')
  })

  it('legge la risposta di recap_sales: numeri anche come testo, null dove SQL non ha denominatore', () => {
    const r = leggiRecap({
      da: '2026-10-01',
      a: '2026-10-31',
      granularita: 'giorno',
      valori: {
        dm_totali: 30,
        dm_outbound: 10,
        dm_inbound: 12,
        follow_up: 8,
        conversazioni: 9,
        call_prenotate: 4,
        call_svolte: 3,
        no_show: 1,
        show_rate: 0.75,
        chiuse: 1,
        close_rate: '0.3333',
        cash_nuovi_clienti: '1500.00',
        revenue_nuovi: 3000,
      },
      delta: { dm_totali: 0.2, cash_nuovi_clienti: null },
      funnel: [{ ordine: 1, fase: 'DM totali', valore: 30, passaggio: null }],
      serie: [{ inizio: '2026-10-01', fine: '2026-10-01', dm_outbound: 2, cash_nuovi_clienti: '500.00' }],
    })
    expect(r.valori.cash_nuovi_clienti).toBe(1500)
    expect(r.valori.close_rate).toBeCloseTo(0.3333)
    expect(r.delta.dm_totali).toBe(0.2)
    expect(r.delta.cash_nuovi_clienti).toBeNull()
    expect(r.delta.chiuse).toBeNull()
    expect(r.serie[0]).toMatchObject({ dm_outbound: 2, dm_inbound: 0, cash_nuovi_clienti: 500 })
    expect(recapVuoto(r)).toBe(false)
    expect(leggiRecap({ granularita: 'boh' }).granularita).toBe('giorno')
    expect(recapVuoto(leggiRecap({}))).toBe(true)
  })

  it('le etichette dei punti: giorno, settimana, mese, nelle due lingue', () => {
    expect(giornoBreve('2026-10-05', 'it')).toBe('05/10')
    expect(giornoBreve('2026-10-05', 'en')).toBe('5 Oct')
    const p = { inizio: '2026-10-05', fine: '2026-10-11' }
    expect(etichettaPunto(p, 'giorno', 'it', mese, RECAP.it.settimanaDal)).toEqual({ breve: '05/10', lunga: '05/10' })
    expect(etichettaPunto(p, 'settimana', 'it', mese, RECAP.it.settimanaDal)).toEqual({
      breve: '05/10',
      lunga: 'dal 05/10 al 11/10',
    })
    expect(etichettaPunto(p, 'settimana', 'en', mese, RECAP.en.settimanaDal).lunga).toBe('5 Oct to 11 Oct')
    expect(etichettaPunto(p, 'mese', 'it', mese, RECAP.it.settimanaDal)).toEqual({ breve: 'b:2026-10-05', lunga: 'l:2026-10-05' })
  })

  it('le fasi del funnel di funnel_periodo hanno tutte le loro parole', () => {
    for (const fase of ['DM totali', 'Conversazioni', 'Call prenotate', 'Call svolte', 'Chiuse']) {
      expect(RECAP.it.fasi[fase], fase).toBeTruthy()
      expect(RECAP.en.fasi[fase], fase).toBeTruthy()
    }
  })

  it('nessun trattino lungo nelle parole del recap', () => {
    for (const lingua of ['it', 'en'] as const) {
      expect(JSON.stringify(RECAP[lingua])).not.toContain('—')
    }
  })
})
