import { describe, expect, it } from 'vitest'

import {
  aggiungiMesiData,
  creaPeriodo,
  erroreIntervallo,
  hrefPeriodo,
  leggiPeriodo,
  periodoPrecedente,
  periodoSuccessivo,
  presetPeriodi,
  puoAndareAvanti,
  schemaIntervallo,
} from '@/lib/periodo'

const OGGI = '2026-09-27'

describe('leggiPeriodo', () => {
  it('senza parametri è il mese corrente', () => {
    const p = leggiPeriodo({}, OGGI)
    expect([p.da, p.a, p.mese, p.etichetta]).toEqual(['2026-09-01', '2026-09-30', '2026-09-01', 'settembre 2026'])
  })

  it('?mese= continua a funzionare, anche nella forma col giorno', () => {
    expect(leggiPeriodo({ mese: '2026-08' }, OGGI).etichetta).toBe('agosto 2026')
    expect(leggiPeriodo({ mese: '2026-08-01' }, OGGI).a).toBe('2026-08-31')
    expect(leggiPeriodo(new URLSearchParams('mese=2026-02'), OGGI).a).toBe('2026-02-28')
  })

  it('?da=&a= apre un intervallo qualsiasi', () => {
    const p = leggiPeriodo({ da: '2026-07-01', a: '2026-08-15' }, OGGI)
    expect([p.da, p.a, p.mese, p.giorni]).toEqual(['2026-07-01', '2026-08-15', null, 46])
    expect(p.etichetta).toBe('01/07/2026 – 15/08/2026')
    expect(p.frase).toBe('dal 01/07/2026 al 15/08/2026')
    expect(p.confronto).toBe('vs periodo precedente')
  })

  it('un intervallo valido vince su ?mese=', () => {
    expect(leggiPeriodo({ mese: '2026-05', da: '2026-07-01', a: '2026-07-10' }, OGGI).da).toBe('2026-07-01')
  })

  it('un intervallo che è esattamente un mese diventa quel mese', () => {
    const p = leggiPeriodo({ da: '2026-09-01', a: '2026-09-30' }, OGGI)
    expect(p.mese).toBe('2026-09-01')
    expect(p.parametri).toEqual({ mese: '2026-09' })
  })

  it('parametri non validi: si torna al mese corrente', () => {
    const casi: Record<string, string>[] = [
      { da: '2026-02-30', a: '2026-03-10' }, // data inesistente
      { da: '2026-08-10', a: '2026-08-01' }, // da dopo a
      { da: '2026-08-10' }, // manca la fine
      { da: '2026-09-01', a: '2027-09-28' }, // oltre oggi + 1 anno
      { da: '2023-01-01', a: '2026-01-01' }, // più di 3 anni
      { da: 'ieri', a: 'oggi' },
      { mese: '2026-13' },
    ]
    for (const c of casi) expect(leggiPeriodo(c, OGGI).mese, JSON.stringify(c)).toBe('2026-09-01')
  })

  it('un intervallo non valido ripiega su ?mese= se c’è', () => {
    expect(leggiPeriodo({ mese: '2026-05', da: '2026-08-10', a: '2026-08-01' }, OGGI).mese).toBe('2026-05-01')
  })

  it('prende il primo valore se un parametro è ripetuto', () => {
    expect(leggiPeriodo({ mese: ['2026-06', '2026-07'] }, OGGI).mese).toBe('2026-06-01')
  })
})

describe('limiti dell’intervallo', () => {
  it('la fine può arrivare esattamente a oggi + 1 anno', () => {
    expect(erroreIntervallo('2026-09-01', '2027-09-27', OGGI)).toBeNull()
    expect(erroreIntervallo('2026-09-01', '2027-09-28', OGGI)).toMatch(/un anno/)
  })

  it('durata massima 3 anni', () => {
    expect(erroreIntervallo('2023-01-01', '2025-12-31', OGGI)).toBeNull()
    expect(erroreIntervallo('2023-01-01', '2026-01-01', OGGI)).toMatch(/3 anni/)
  })

  it('un solo giorno è un periodo valido', () => {
    const p = leggiPeriodo({ da: '2026-08-15', a: '2026-08-15' }, OGGI)
    expect([p.giorni, p.etichetta, p.frase]).toEqual([1, '15/08/2026', 'il 15/08/2026'])
    expect(periodoPrecedente(p)).toEqual({ da: '2026-08-14', a: '2026-08-14' })
  })

  it('lo schema del form rilegge il proprio output senza cambiarlo', () => {
    const schema = schemaIntervallo(OGGI)
    const uno = schema.parse({ da: '2026-07-01', a: '2026-08-15' })
    expect(schema.parse(uno)).toEqual(uno)
    expect(schema.safeParse({ da: '2026-08-15', a: '2026-07-01' }).success).toBe(false)
    expect(schema.safeParse({ da: '', a: '2026-07-01' }).error?.issues[0].path).toEqual(['da'])
  })
})

describe('periodo precedente', () => {
  it('un mese: il mese prima', () => {
    expect(periodoPrecedente({ da: '2026-09-01', a: '2026-09-30' })).toEqual({ da: '2026-08-01', a: '2026-08-31' })
    expect(periodoPrecedente({ da: '2026-01-01', a: '2026-01-31' })).toEqual({ da: '2025-12-01', a: '2025-12-31' })
  })

  it('mesi interi: gli stessi mesi interi prima (lug–set → apr–giu)', () => {
    expect(periodoPrecedente({ da: '2026-07-01', a: '2026-09-30' })).toEqual({ da: '2026-04-01', a: '2026-06-30' })
    expect(periodoPrecedente({ da: '2026-01-01', a: '2026-12-31' })).toEqual({ da: '2025-01-01', a: '2025-12-31' })
  })

  it('febbraio bisestile come mese precedente', () => {
    expect(periodoPrecedente({ da: '2028-03-01', a: '2028-03-31' })).toEqual({ da: '2028-02-01', a: '2028-02-29' })
  })

  it('altrimenti: la finestra di pari giorni subito prima', () => {
    // 30 days
    expect(periodoPrecedente({ da: '2026-08-29', a: '2026-09-27' })).toEqual({ da: '2026-07-30', a: '2026-08-28' })
    // 32 days across two months: same case as the pgTAP test
    expect(periodoPrecedente({ da: '2033-05-15', a: '2033-06-15' })).toEqual({ da: '2033-04-13', a: '2033-05-14' })
  })

  it('un mese che non inizia il primo non è un mese intero', () => {
    // 29 days
    expect(periodoPrecedente({ da: '2026-09-02', a: '2026-09-30' })).toEqual({ da: '2026-08-04', a: '2026-09-01' })
  })

  it('il successivo è lo specchio del precedente', () => {
    expect(periodoSuccessivo({ da: '2026-04-01', a: '2026-06-30' })).toEqual({ da: '2026-07-01', a: '2026-09-30' })
    expect(periodoSuccessivo({ da: '2026-07-30', a: '2026-08-28' })).toEqual({ da: '2026-08-29', a: '2026-09-27' })
    expect(periodoSuccessivo({ da: '2026-01-01', a: '2026-01-31' })).toEqual({ da: '2026-02-01', a: '2026-02-28' })
  })

  it('la freccia avanti si spegne quando il periodo dopo inizierebbe nel futuro', () => {
    expect(puoAndareAvanti(leggiPeriodo({}, OGGI), OGGI)).toBe(false)
    expect(puoAndareAvanti(leggiPeriodo({ mese: '2026-08' }, OGGI), OGGI)).toBe(true)
    expect(puoAndareAvanti(leggiPeriodo({ da: '2026-08-29', a: '2026-09-27' }, OGGI), OGGI)).toBe(false)
    expect(puoAndareAvanti(leggiPeriodo({ da: '2026-08-01', a: '2026-09-10' }, OGGI), OGGI)).toBe(true)
  })
})

describe('etichette', () => {
  it('mesi interi nello stesso anno, a cavallo d’anno, anno intero', () => {
    expect(creaPeriodo({ da: '2026-07-01', a: '2026-09-30' }).etichetta).toBe('luglio – settembre 2026')
    expect(creaPeriodo({ da: '2026-07-01', a: '2026-09-30' }).frase).toBe('da luglio a settembre 2026')
    expect(creaPeriodo({ da: '2025-11-01', a: '2026-01-31' }).etichetta).toBe('nov 2025 – gen 2026')
    expect(creaPeriodo({ da: '2026-01-01', a: '2026-12-31' }).etichetta).toBe('anno 2026')
    expect(creaPeriodo({ da: '2026-01-01', a: '2026-12-31' }).confronto).toBe('vs 2025')
  })

  it('il confronto di un mese nomina il mese prima', () => {
    const p = creaPeriodo({ da: '2026-09-01', a: '2026-09-30' })
    expect(p.confronto).toBe('vs agosto')
    expect(p.frase).toBe('a settembre 2026')
    expect(p.precedente.etichetta).toBe('agosto 2026')
  })
})

describe('hrefPeriodo', () => {
  it('tiene gli altri filtri e toglie il periodo vecchio', () => {
    expect(hrefPeriodo('/sales', { da: '2026-07-01', a: '2026-08-15' }, { tipo: 'nuovo', mese: '2026-05', setter: undefined })).toBe(
      '/sales?tipo=nuovo&da=2026-07-01&a=2026-08-15',
    )
  })

  it('un mese intero torna ?mese=', () => {
    expect(hrefPeriodo('/payments', { da: '2026-08-01', a: '2026-08-31' }, { vista: 'incassate' })).toBe(
      '/payments?vista=incassate&mese=2026-08',
    )
  })
})

describe('preset', () => {
  const perChiave = (oggi: string) => Object.fromEntries(presetPeriodi(oggi).map((p) => [p.chiave, [p.da, p.a]]))

  it('relativi a oggi', () => {
    expect(perChiave(OGGI)).toEqual({
      'questo-mese': ['2026-09-01', '2026-09-30'],
      'mese-scorso': ['2026-08-01', '2026-08-31'],
      'ultimi-30': ['2026-08-29', '2026-09-27'],
      'ultimi-90': ['2026-06-30', '2026-09-27'],
      trimestre: ['2026-07-01', '2026-09-30'],
      anno: ['2026-01-01', '2026-12-31'],
    })
  })

  it('a inizio anno attraversano il capodanno', () => {
    const p = perChiave('2027-01-05')
    expect(p['mese-scorso']).toEqual(['2026-12-01', '2026-12-31'])
    expect(p['ultimi-90']).toEqual(['2026-10-08', '2027-01-05'])
    expect(p.trimestre).toEqual(['2027-01-01', '2027-03-31'])
  })

  it('ogni preset è un intervallo valido', () => {
    for (const p of presetPeriodi(OGGI)) expect(erroreIntervallo(p.da, p.a, OGGI), p.chiave).toBeNull()
  })
})

describe('aggiungiMesiData', () => {
  it('schiaccia il giorno sulla fine del mese', () => {
    expect(aggiungiMesiData('2026-01-31', 1)).toBe('2026-02-28')
    expect(aggiungiMesiData('2028-02-29', 12)).toBe('2029-02-28')
    expect(aggiungiMesiData('2026-09-27', 12)).toBe('2027-09-27')
  })
})
