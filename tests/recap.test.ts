import { describe, expect, it } from 'vitest'

import { RUOLI_RECAP, percorsoIniziale, soloRecap } from '@/lib/auth/roles'
import { RECAP } from '@/lib/i18n/testi/recap'
import {
  CHIAVI_GIORNO,
  CHIAVI_RIEPILOGO,
  COLONNE_CLOSING,
  COLONNE_SETTING,
  DETTAGLIO_CLOSING,
  DETTAGLIO_SETTING,
  GRUPPI_RIEPILOGO,
  giornoVuoto,
  giorniVicini,
  leggiRecapMese,
  livelloAttivita,
  meseVuoto,
  settimaneDelMese,
} from '@/lib/recap/recap'
import { COOKIE_VISTA_RECAP, cookieVistaRecap, vistaRecapDaUrl, vistaRecapIniziale } from '@/lib/recap/vista'

function giorniDi(primo: string, quanti: number): string[] {
  return Array.from({ length: quanti }, (_, i) => `${primo.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)
}

describe('il recap vendite (1.58.0, a calendario dalla 1.59.0)', () => {
  it('lo aprono l’admin e il business coach; il business coach solo quello', () => {
    expect([...RUOLI_RECAP]).toEqual(['admin', 'business_coach'])
    expect(soloRecap('business_coach')).toBe(true)
    expect(soloRecap('admin')).toBe(false)
    expect(percorsoIniziale('business_coach')).toBe('/recap')
    expect(percorsoIniziale('admin')).toBe('/')
  })

  it('legge la risposta di recap_mese: numeri anche come testo, null dove SQL non ha denominatore', () => {
    const r = leggiRecapMese({
      mese: '2026-10-01',
      da: '2026-10-01',
      a: '2026-10-31',
      oggi: '2026-10-23',
      precedente_da: '2026-09-01',
      valori: { dm_totali: 30, close_rate: '0.3333', cash_nuovi_clienti: '1500.00', show_rate: null },
      delta: { dm_totali: 0.2, cash_nuovi_clienti: null },
      riepilogo: { tasso_conversazione: '0.25', cash_medio_chiusura: null, dm_per_call: 36.44 },
      riepilogo_precedente: {},
      giorni: [
        { giorno: '2026-10-01', dm_outbound: '2', cash: '500.00', show_rate: null, close_rate: 0.5 },
        { giorno: '2026-10-02' },
      ],
      totali: { dm_outbound: 2, cash: 500 },
    })
    expect(r.valori.cash_nuovi_clienti).toBe(1500)
    expect(r.valori.close_rate).toBeCloseTo(0.3333)
    expect(r.valori.show_rate).toBeNull()
    expect(r.valori.chiuse).toBe(0)
    expect(r.delta.dm_totali).toBe(0.2)
    expect(r.delta.cash_nuovi_clienti).toBeNull()
    expect(r.delta.chiuse).toBeNull()
    expect(r.riepilogo.tasso_conversazione).toBe(0.25)
    expect(r.riepilogo.cash_medio_chiusura).toBeNull()
    expect(r.riepilogoPrecedente.close_rate).toBeNull()
    expect(r.giorni[0]).toMatchObject({ giorno: '2026-10-01', dm_outbound: 2, dm_inbound: 0, cash: 500, close_rate: 0.5 })
    expect(r.giorni[1].show_rate).toBeNull()
    expect(giornoVuoto(r.giorni[1])).toBe(true)
    expect(giornoVuoto(r.giorni[0])).toBe(false)
    expect(meseVuoto(r)).toBe(false)
    expect(meseVuoto(leggiRecapMese({}))).toBe(true)
    expect(r.precedenteDa).toBe('2026-09-01')
  })

  it('il calendario parte dal lunedì e chiude la settimana con celle vuote', () => {
    // 01/10/2026 is a Thursday: three empty cells before it, 31 days, one empty cell after
    const ottobre = settimaneDelMese(giorniDi('2026-10-01', 31))
    expect(ottobre).toHaveLength(5)
    expect(ottobre[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(ottobre[4]).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null])
    // 01/02/2026 is a Sunday: six empty cells, then February
    const febbraio = settimaneDelMese(giorniDi('2026-02-01', 28))
    expect(febbraio[0].slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(febbraio[0][6]).toBe('2026-02-01')
    expect(febbraio.flat().filter(Boolean)).toHaveLength(28)
    // 01/06/2026 is a Monday
    expect(settimaneDelMese(giorniDi('2026-06-01', 30))[0][0]).toBe('2026-06-01')
    expect(settimaneDelMese([])).toEqual([])
  })

  it('il colore dei DM ha tre livelli, mai senza DM', () => {
    expect(livelloAttivita(0, 50)).toBe(0)
    expect(livelloAttivita(10, 0)).toBe(0)
    expect(livelloAttivita(1, 60)).toBe(1)
    expect(livelloAttivita(41, 60)).toBe(1)
    expect(livelloAttivita(42, 60)).toBe(2)
    expect(livelloAttivita(54, 60)).toBe(3)
    expect(livelloAttivita(60, 60)).toBe(3)
  })

  it('le frecce del giorno restano nel mese e mai nel futuro', () => {
    const giorni = giorniDi('2026-10-01', 31)
    expect(giorniVicini('2026-10-01', giorni, '2026-10-23')).toEqual({ prima: null, dopo: '2026-10-02' })
    expect(giorniVicini('2026-10-23', giorni, '2026-10-23')).toEqual({ prima: '2026-10-22', dopo: null })
    expect(giorniVicini('2026-10-31', giorni, '2026-11-05')).toEqual({ prima: '2026-10-30', dopo: null })
    expect(giorniVicini('2026-11-01', giorni, '2026-11-05')).toEqual({ prima: null, dopo: null })
  })

  it('la riga del foglio e il dettaglio usano tutte le chiavi del giorno, e il riepilogo tutte le sue', () => {
    expect(new Set([...DETTAGLIO_SETTING, ...DETTAGLIO_CLOSING])).toEqual(new Set(CHIAVI_GIORNO))
    for (const k of [...COLONNE_SETTING, ...COLONNE_CLOSING]) expect(CHIAVI_GIORNO).toContain(k)
    expect(GRUPPI_RIEPILOGO.flatMap((g) => g.voci.map((v) => v.chiave)).sort()).toEqual([...CHIAVI_RIEPILOGO].sort())
    for (const lingua of ['it', 'en'] as const) {
      for (const k of CHIAVI_GIORNO) {
        expect(RECAP[lingua].voci[k], `${lingua} ${k}`).toBeTruthy()
        expect(RECAP[lingua].colonne[k], `${lingua} ${k}`).toBeTruthy()
      }
      for (const k of CHIAVI_RIEPILOGO) expect(RECAP[lingua].riepilogo[k].spiegazione, `${lingua} ${k}`).toBeTruthy()
    }
  })

  it('le parole di un giorno: date, plurali, nelle due lingue', () => {
    expect(RECAP.it.dataLunga('2026-10-23')).toBe('venerdì 23 ottobre 2026')
    expect(RECAP.en.dataLunga('2026-10-23')).toBe('Friday 23 October 2026')
    expect(RECAP.it.dataCorta('2026-10-05')).toBe('lun 05/10')
    expect(RECAP.en.dataCorta('2026-10-05')).toBe('Mon 5 Oct')
    expect(RECAP.it.cellaChiuse(1, '1')).toBe('1 chiusa')
    expect(RECAP.it.cellaChiuse(2, '2')).toBe('2 chiuse')
    expect(RECAP.it.cellaPrenotate(1, '1')).toBe('1 prenotata')
    expect(RECAP.en.cellaDm(1, '1')).toBe('1 DM')
    expect(RECAP.en.cellaDm(38, '38')).toBe('38 DMs')
    expect(RECAP.it.giorniVuoti(1)).toBe('1 giorno senza attività')
    expect(RECAP.it.giorniVuoti(4)).toBe('4 giorni senza attività')
    expect(RECAP.it.vuotoTitolo('ottobre 2026')).toBe('Nessuna attività a ottobre 2026')
  })

  it('la vista: l’indirizzo vince, poi quella ricordata, poi il calendario', () => {
    expect(vistaRecapIniziale(undefined, undefined)).toBe('calendario')
    expect(vistaRecapIniziale('tabella', 'calendario')).toBe('tabella')
    expect(vistaRecapIniziale(undefined, 'tabella')).toBe('tabella')
    expect(vistaRecapIniziale('boh', 'boh')).toBe('calendario')
    expect(vistaRecapDaUrl('calendario')).toBe('calendario')
    expect(cookieVistaRecap('tabella', true)).toBe(
      `${COOKIE_VISTA_RECAP}=tabella; Path=/recap; Max-Age=31536000; SameSite=Lax; Secure`,
    )
    expect(cookieVistaRecap('calendario', false)).not.toContain('Secure')
  })

  it('nessun trattino lungo nelle parole del recap', () => {
    for (const lingua of ['it', 'en'] as const) {
      expect(JSON.stringify(RECAP[lingua])).not.toContain('—')
      expect(RECAP[lingua].dataLunga('2026-10-23')).not.toContain('—')
    }
  })
})
