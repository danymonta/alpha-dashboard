import { describe, expect, it } from 'vitest'

import * as format from '@/lib/format'
import { formato } from '@/lib/format'
import { COOKIE_LINGUA, eLingua, linguaIniziale } from '@/lib/i18n/lingua'
import { creaPeriodo, presetPeriodi } from '@/lib/periodo'

/** The numbers and the dates of the two languages (1.53.0): Italian as always, English from one place. */
describe('formato', () => {
  const it_ = formato('it')
  const en = formato('en')

  it('in italiano non cambia niente: le funzioni di sempre sono quelle italiane', () => {
    expect(format.formatEuro(1250)).toBe(it_.formatEuro(1250))
    expect(format.formatData('2026-10-22')).toBe('22/10/2026')
    expect(format.formatMese('2026-10-01')).toBe('ottobre 2026')
    expect(it_.formatEuro(1250).replace(/\s/g, ' ')).toBe('1.250,00 €')
    expect(it_.formatPercentuale(0.4234)).toBe('42,3%')
  })

  it('importi in euro all’irlandese', () => {
    expect(en.formatEuro(1250)).toBe('€1,250.00')
    expect(en.formatEuro(-1250, { compatto: true })).toBe('-€1,250')
    expect(en.formatEuro(null)).toBe(format.VUOTO)
    expect(en.formatNumero(12480)).toBe('12,480')
    expect(en.formatRapporto(12.5)).toBe('12.5')
    expect(en.formatEuroAsse(1500)).toBe('€1.5k')
    expect(en.formatEuroAsse(800)).toBe('€800')
  })

  it('percentuali e delta', () => {
    expect(en.formatPercentuale(0.4234)).toBe('42.3%')
    expect(en.formatPercentuale(0.13, { unDecimale: true })).toBe('13.0%')
    expect(en.formatDelta(0.125)).toBe('+12.5%')
    expect(en.formatDelta(Number.NaN)).toBe(format.VUOTO)
  })

  it('date e mesi in inglese, scritti senza dipendere dal motore (mai «Sept»)', () => {
    expect(en.formatData('2026-10-22')).toBe('22 Oct 2026')
    expect(en.formatData('2026-09-02')).toBe('02 Sep 2026')
    expect(en.formatData(null)).toBe(format.VUOTO)
    expect(en.formatMese('2026-10-01')).toBe('October 2026')
    expect(en.formatNomeMese('2026-08-01')).toBe('August')
    expect(en.formatMeseBreve('2026-09-01')).toBe('Sep')
    expect(en.formatMeseBreve('2027-01-01')).toBe('Jan 27')
  })

  it('il campo di un importo resta italiano: i form lo leggono così', () => {
    expect(en.formatImportoInput(1500)).toBe(it_.formatImportoInput(1500))
  })
})

describe('il periodo nelle due lingue', () => {
  it('etichetta, frase e confronto', () => {
    const settembre = { da: '2026-09-01', a: '2026-09-30' }
    expect(creaPeriodo(settembre).etichetta).toBe('settembre 2026')
    const en = creaPeriodo(settembre, 'en')
    expect(en.etichetta).toBe('September 2026')
    expect(en.frase).toBe('in September 2026')
    expect(en.confronto).toBe('vs August')
    expect(creaPeriodo({ da: '2026-07-01', a: '2026-08-15' }, 'en').frase).toBe('from 01 Jul 2026 to 15 Aug 2026')
    expect(creaPeriodo({ da: '2025-01-01', a: '2025-12-31' }, 'en').etichetta).toBe('year 2025')
  })

  it('le scelte rapide', () => {
    expect(presetPeriodi('2026-10-22', 'en').map((p) => p.etichetta)).toEqual([
      'Today',
      'This month',
      'Last month',
      'Last 90 days',
      'This quarter',
      'This year',
    ])
    expect(presetPeriodi('2026-10-22')[0].etichetta).toBe('Oggi')
  })
})

describe('la lingua iniziale', () => {
  it('senza cookie: inglese per il business coach, italiano per gli altri', () => {
    expect(linguaIniziale(undefined, 'business_coach')).toBe('en')
    for (const ruolo of ['admin', 'setter', 'closer', 'coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
      expect(linguaIniziale(undefined, ruolo)).toBe('it')
    }
    expect(linguaIniziale(null, null)).toBe('it')
  })

  it('il cookie vince sul ruolo', () => {
    expect(linguaIniziale('it', 'business_coach')).toBe('it')
    expect(linguaIniziale('en', 'admin')).toBe('en')
  })

  it('un cookie che non è una lingua non vale', () => {
    expect(linguaIniziale('fr', 'admin')).toBe('it')
    expect(linguaIniziale('', 'business_coach')).toBe('en')
    expect(eLingua('EN')).toBe(false)
    expect(COOKIE_LINGUA).toBe('alpha_lingua')
  })
})
