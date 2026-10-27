import { describe, expect, it } from 'vitest'

import { CATEGORIE_OBIEZIONI } from '@/lib/call/analisi/icp-call'
import { angoloCategoria, conteggiObiezioni, nomeCategoria, topicDalleCall } from '@/lib/marketing/dalle-call'

// Topics from the sales calls (27/10/2026). Every text is invented.

describe('topicDalleCall', () => {
  it('the order and the numbers are the SQL count; examples, answer and ideas from the analyses, distinct', () => {
    const analisi = [
      {
        obiezioni: [
          { categoria: 'tempo', sintesi: 'Lavoro fino a tardi', gestita: 'in_parte', risposta: 'Tre allenamenti brevi' },
          { categoria: 'prezzo_cassa', sintesi: 'Ora non riesco', gestita: 'si', risposta: 'Parliamo del valore' },
        ],
        spunti_contenuto: [{ idea: 'La settimana tipo', perche: 'Chiedono tutti del tempo' }],
      },
      {
        obiezioni: [
          { categoria: 'tempo', sintesi: 'lavoro  fino a tardi', gestita: 'si', risposta: 'Venti minuti a casa' },
          { categoria: 'condizioni_personali', sintesi: 'Qualcosa di personale', gestita: 'no', risposta: null },
        ],
        spunti_contenuto: [{ idea: 'La settimana tipo', perche: '' }, { idea: 'Allenarsi la sera', perche: '' }],
      },
    ]
    const topic = topicDalleCall(analisi, [
      { categoria: 'tempo', quante: 2 },
      { categoria: 'prezzo_cassa', quante: 1 },
    ])
    expect(topic.map((t) => [t.categoria, t.quante])).toEqual([
      ['tempo', 2],
      ['prezzo_cassa', 1],
      ['condizioni_personali', null],
    ])
    expect(topic[0].esempi).toEqual(['Lavoro fino a tardi'])
    expect(topic[0].risposta).toBe('Venti minuti a casa')
    expect(topic[0].idee.map((i) => i.idea)).toEqual(['La settimana tipo', 'Allenarsi la sera'])
    // personal conditions: never an example
    expect(topic[2].esempi).toEqual([])
  })

  it('no analyses and no count: no topics', () => {
    expect(topicDalleCall([], [])).toEqual([])
  })
})

describe('words', () => {
  it('every category has a name and a topic in both languages, never a price', () => {
    for (const c of Object.keys(CATEGORIE_OBIEZIONI)) {
      for (const l of ['it', 'en'] as const) {
        expect(nomeCategoria(c, l).length).toBeGreaterThan(2)
        const angolo = angoloCategoria(c, l)
        expect(angolo.length).toBeGreaterThan(10)
        expect(angolo).not.toMatch(/€|euro|\d+\s*(?:€|eur)/iu)
      }
    }
    expect(angoloCategoria('sconosciuta', 'it')).toBe(angoloCategoria('altro', 'it'))
  })

  it('reads the SQL counts safely', () => {
    expect(conteggiObiezioni([{ categoria: 'tempo', quante: 3 }, { categoria: 1 }, null])).toEqual([{ categoria: 'tempo', quante: 3 }])
    expect(conteggiObiezioni(null)).toEqual([])
  })
})
