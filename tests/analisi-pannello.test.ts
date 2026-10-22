import { describe, expect, it } from 'vitest'

import { eMediaId, hrefAnalisiReel, urlConReel, urlSenzaReel } from '@/lib/marketing/analisi/pannello'

describe('indirizzo del pannello dei reel', () => {
  it('?reel si aggiunge, sostituisce e si toglie senza toccare i filtri', () => {
    expect(urlConReel('/marketing/pubblicati', 'periodo=90&cambiare=1', '17990000000000002')).toBe(
      '/marketing/pubblicati?periodo=90&cambiare=1&reel=17990000000000002',
    )
    expect(urlConReel('/marketing/pubblicati', 'reel=1&tipo=reel', '2')).toBe('/marketing/pubblicati?reel=2&tipo=reel')
    expect(urlSenzaReel('/marketing/pubblicati', 'periodo=90&reel=2')).toBe('/marketing/pubblicati?periodo=90')
    expect(urlSenzaReel('/marketing/pubblicati', 'reel=2')).toBe('/marketing/pubblicati')
    // the link of a reel's panel (a content's «Apri nei Pubblicati», a call's «Dalle registrazioni»)
    expect(hrefAnalisiReel('42')).toBe('/marketing/pubblicati?reel=42')
  })

  it('solo un id di Instagram, cifre', () => {
    expect(eMediaId('17990000000000002')).toBe(true)
    for (const x of ['', 'abc', '12a', '1'.repeat(31), null, undefined, '../x']) expect(eMediaId(x as never)).toBe(false)
  })
})

describe('la scheda del pannello', () => {
  it('?scheda si scrive accanto al reel e se ne va con lui', async () => {
    const { eSchedaReel, urlConScheda } = await import('@/lib/marketing/analisi/pannello')
    expect(urlConScheda('/marketing/pubblicati', 'reel=2&periodo=90', 'numeri')).toBe('/marketing/pubblicati?reel=2&periodo=90&scheda=numeri')
    expect(urlConScheda('/marketing/pubblicati', 'reel=2&scheda=rifare', 'perche')).toBe('/marketing/pubblicati?reel=2&scheda=perche')
    expect(urlSenzaReel('/marketing/pubblicati', 'periodo=90&reel=2&scheda=perche')).toBe('/marketing/pubblicati?periodo=90')
    expect(['rifare', 'perche', 'numeri'].every(eSchedaReel)).toBe(true)
    for (const x of ['', 'altro', null, undefined]) expect(eSchedaReel(x as never)).toBe(false)
  })
})
