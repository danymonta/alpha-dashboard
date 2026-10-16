import { describe, expect, it } from 'vitest'

import { filtriDaParametri, FILTRI_PREDEFINITI, hrefAnalisi, sonoFiltriPredefiniti } from '@/lib/marketing/analisi/filtri'
import { eMediaId, hrefAnalisiReel, urlConReel, urlSenzaReel } from '@/lib/marketing/analisi/pannello'

describe('indirizzo del pannello dei reel', () => {
  it('?reel si aggiunge, sostituisce e si toglie senza toccare i filtri', () => {
    expect(urlConReel('/marketing/analisi', 'periodo=90&verdetto=cambiare', '17990000000000002')).toBe(
      '/marketing/analisi?periodo=90&verdetto=cambiare&reel=17990000000000002',
    )
    expect(urlConReel('/marketing/analisi', 'reel=1&ordine=views', '2')).toBe('/marketing/analisi?reel=2&ordine=views')
    expect(urlSenzaReel('/marketing/analisi', 'periodo=90&reel=2')).toBe('/marketing/analisi?periodo=90')
    expect(urlSenzaReel('/marketing/analisi', 'reel=2')).toBe('/marketing/analisi')
    expect(hrefAnalisiReel('42')).toBe('/marketing/analisi?reel=42')
  })

  it('solo un id di Instagram, cifre', () => {
    expect(eMediaId('17990000000000002')).toBe(true)
    for (const x of ['', 'abc', '12a', '1'.repeat(31), null, undefined, '../x']) expect(eMediaId(x as never)).toBe(false)
  })
})

describe('i filtri dell’analisi', () => {
  it('un valore sconosciuto torna al predefinito, mai un errore', () => {
    expect(filtriDaParametri({})).toEqual(FILTRI_PREDEFINITI)
    expect(filtriDaParametri({ periodo: '7', verdetto: 'boh', punteggio: 'ottimo', ordine: 'x', senza_contenuto: 'si' })).toEqual(FILTRI_PREDEFINITI)
    // «Da analizzare» of the verdicts is gone (1.39.0): the score filter says «Non valutati»
    expect(filtriDaParametri({ verdetto: 'da_analizzare' })).toEqual(FILTRI_PREDEFINITI)
    expect(filtriDaParametri({ periodo: ['90'], verdetto: 'cambiare', punteggio: 'riscrivere', ordine: 'lead', senza_contenuto: '1' })).toEqual({
      periodo: 90,
      verdetto: 'cambiare',
      punteggio: 'riscrivere',
      ordine: 'lead',
      senzaContenuto: true,
    })
    expect(filtriDaParametri({ punteggio: 'non_valutato', ordine: 'punteggio' })).toMatchObject({ punteggio: 'non_valutato', ordine: 'punteggio' })
  })

  it('l’indirizzo lascia fuori i predefiniti e porta il pannello', () => {
    expect(hrefAnalisi(FILTRI_PREDEFINITI)).toBe('/marketing/analisi')
    expect(hrefAnalisi({ ...FILTRI_PREDEFINITI, periodo: 180, senzaContenuto: true }, '5')).toBe(
      '/marketing/analisi?periodo=180&senza_contenuto=1&reel=5',
    )
    expect(sonoFiltriPredefiniti(FILTRI_PREDEFINITI)).toBe(true)
    expect(sonoFiltriPredefiniti({ ...FILTRI_PREDEFINITI, ordine: 'views' })).toBe(false)
    expect(sonoFiltriPredefiniti({ ...FILTRI_PREDEFINITI, punteggio: 'non_valutato' })).toBe(false)
    expect(hrefAnalisi({ ...FILTRI_PREDEFINITI, punteggio: 'scartare', ordine: 'punteggio' })).toBe('/marketing/analisi?punteggio=scartare&ordine=punteggio')
  })
})

describe('la scheda del pannello', () => {
  it('?scheda si scrive accanto al reel e se ne va con lui', async () => {
    const { eSchedaReel, urlConScheda } = await import('@/lib/marketing/analisi/pannello')
    expect(urlConScheda('/marketing/analisi', 'reel=2&periodo=90', 'numeri')).toBe('/marketing/analisi?reel=2&periodo=90&scheda=numeri')
    expect(urlConScheda('/marketing/analisi', 'reel=2&scheda=rifare', 'perche')).toBe('/marketing/analisi?reel=2&scheda=perche')
    expect(urlSenzaReel('/marketing/analisi', 'periodo=90&reel=2&scheda=perche')).toBe('/marketing/analisi?periodo=90')
    expect(['rifare', 'perche', 'numeri'].every(eSchedaReel)).toBe(true)
    for (const x of ['', 'altro', null, undefined]) expect(eSchedaReel(x as never)).toBe(false)
  })
})
