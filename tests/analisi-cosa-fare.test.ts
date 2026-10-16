import { describe, expect, it } from 'vitest'

import { BREVE_FASCIA, cosaFare, FASCE_DA_RIFARE } from '@/lib/marketing/analisi/cosa-fare'
import { CODICI_FASCIA } from '@/lib/marketing/punteggio/tabelle'

describe('cosaFare', () => {
  it('joins the content and the audience in one sentence: the examples of the brief', () => {
    expect(cosaFare({ fascia: 'scartare', verdetto: 'cambiare' }).frase).toBe(
      'Rifallo da capo: l’idea non è allineata a fase, ICP o tono. I numeri confermano: sotto la mediana.',
    )
    expect(cosaFare({ fascia: 'pubblicare_dopo_ritocchi', verdetto: 'spingere', criteriSotto7: 2 }).frase).toBe(
      'Rifallo con qualche ritocco: due criteri sotto 7. Il pubblico l’ha premiato: spingilo.',
    )
  })

  it('has a sentence for every band and every verdict, and the verdict agrees or contrasts with the band', () => {
    for (const fascia of CODICI_FASCIA) {
      for (const verdetto of ['spingere', 'mantenere', 'cambiare', null]) {
        const r = cosaFare({ fascia, verdetto })
        expect(r.chiave).toBe(fascia)
        expect(r.breve).toBe(BREVE_FASCIA[fascia])
        expect(r.frase.startsWith(r.breve === 'Va bene così' ? 'Il contenuto è pronto' : r.breve)).toBe(true)
        expect(r.frase).not.toMatch(/—|–/)
        expect(r.frase.endsWith('.')).toBe(true)
      }
    }
    // a good content with weak numbers, a weak content that the audience liked: said as a contrast
    expect(cosaFare({ fascia: 'pubblicare', verdetto: 'cambiare' }).frase).toContain('Ma i numeri sono sotto la mediana')
    expect(cosaFare({ fascia: 'riscrivere', verdetto: 'spingere' }).frase).toContain('però')
  })

  it('says «troppo presto» or «nessun verdetto» when the numbers are missing', () => {
    expect(cosaFare({ fascia: 'riscrivere', verdetto: null, giovane: true }).frase).toContain('troppo presto')
    expect(cosaFare({ fascia: 'riscrivere', verdetto: null }).frase).toContain('non c’è ancora un verdetto')
    expect(cosaFare({ fascia: 'riscrivere', verdetto: 'sconosciuto' }).frase).toContain('non c’è ancora un verdetto')
  })

  it('counts the criteria under 7 in words, and has a sentence for none or unknown', () => {
    expect(cosaFare({ fascia: 'pubblicare_dopo_ritocchi', verdetto: null, criteriSotto7: 1 }).frase).toContain('un criterio sotto 7')
    expect(cosaFare({ fascia: 'pubblicare_dopo_ritocchi', verdetto: null, criteriSotto7: 4 }).frase).toContain('quattro criteri sotto 7')
    expect(cosaFare({ fascia: 'pubblicare_dopo_ritocchi', verdetto: null, criteriSotto7: 0 }).frase).toContain('manca poco')
    expect(cosaFare({ fascia: 'pubblicare_dopo_ritocchi', verdetto: null }).frase).toContain('i criteri sotto 7')
  })

  it('offers the redo only for the bands that ask for it, a look at how for the touch-ups, nothing for a good reel', () => {
    for (const fascia of CODICI_FASCIA) {
      const azione = cosaFare({ fascia, verdetto: null }).azione
      if (FASCE_DA_RIFARE.includes(fascia)) expect(azione).toBe('aggiungi_rifacimento')
      else if (fascia === 'pubblicare_dopo_ritocchi') expect(azione).toBe('vedi_rifacimento')
      else expect(azione).toBe('nessuna')
    }
  })

  it('without a score the next step is «Analizza», except while Claude works or when the reel is gone', () => {
    const da = cosaFare({ fascia: null, verdetto: 'spingere' })
    expect(da).toMatchObject({ chiave: 'da_valutare', azione: 'analizza', breve: 'Da valutare' })
    expect(da.frase).toContain('il pubblico l’ha premiato')
    expect(cosaFare({ fascia: null, verdetto: null, giovane: true }).frase).toContain('troppo presto')
    expect(cosaFare({ fascia: null, verdetto: 'cambiare', statoAnalisi: 'in_coda' })).toMatchObject({ chiave: 'in_lavoro', azione: 'nessuna' })
    expect(cosaFare({ fascia: null, verdetto: null, statoAnalisi: 'in_corso' }).chiave).toBe('in_lavoro')
    expect(cosaFare({ fascia: null, verdetto: null, statoAnalisi: 'fallita' })).toMatchObject({ chiave: 'non_riuscita', azione: 'analizza', tono: 'critico' })
    expect(cosaFare({ fascia: null, verdetto: null, eliminato: true })).toMatchObject({ chiave: 'eliminato', azione: 'nessuna' })
  })

  it('a score wins over the state of the analysis, and an unknown band is no score', () => {
    expect(cosaFare({ fascia: 'scartare', verdetto: null, statoAnalisi: 'in_coda' }).chiave).toBe('scartare')
    expect(cosaFare({ fascia: 'boh', verdetto: null }).chiave).toBe('da_valutare')
  })
})

describe('spiegazione', () => {
  it('non ripete il titolo: la frase senza la forma breve, con la maiuscola', () => {
    const r = cosaFare({ fascia: 'scartare', verdetto: 'cambiare' })
    expect(r.spiegazione).toBe('L’idea non è allineata a fase, ICP o tono. I numeri confermano: sotto la mediana.')
    expect(r.frase.startsWith(`${r.breve}: `)).toBe(true)
    // «Va bene così» does not start the sentence: it stays whole
    const ok = cosaFare({ fascia: 'pubblicare', verdetto: 'spingere' })
    expect(ok.spiegazione).toBe(ok.frase)
    for (const fascia of ['pubblicare_dopo_ritocchi', 'rifare_le_parti_deboli', 'riscrivere']) {
      expect(cosaFare({ fascia, verdetto: null }).spiegazione).not.toContain(BREVE_FASCIA[fascia as keyof typeof BREVE_FASCIA] + ':')
    }
    expect(cosaFare({ fascia: null, verdetto: null }).spiegazione).toBe(cosaFare({ fascia: null, verdetto: null }).frase)
  })
})
