import { describe, expect, it } from 'vitest'

import { aggiornamentoDaEsito, esitoCallSchema } from '@/lib/validation/esito'

const call_id = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'

describe('esito della call', () => {
  it('chiusa implica svolta e qualificata', () => {
    const v = esitoCallSchema.parse({ call_id, esito: 'chiusa' })
    expect(aggiornamentoDaEsito(v)).toEqual({
      stato: 'svolta',
      esito: 'chiusa',
      qualificata: true,
      obiezione_principale: null,
    })
  })

  it('persa e follow-up pretendono la qualifica', () => {
    expect(esitoCallSchema.safeParse({ call_id, esito: 'persa' }).success).toBe(false)
    const v = esitoCallSchema.parse({
      call_id,
      esito: 'persa',
      qualificata: false,
      obiezione: '  prezzo  ',
    })
    expect(aggiornamentoDaEsito(v)).toEqual({
      stato: 'svolta',
      esito: 'persa',
      qualificata: false,
      obiezione_principale: 'prezzo',
    })
  })

  it('un’obiezione vuota non viene salvata', () => {
    const v = esitoCallSchema.parse({ call_id, esito: 'follow_up', qualificata: true, obiezione: ' ' })
    expect(aggiornamentoDaEsito(v).obiezione_principale).toBeNull()
  })

  it('no show, cancellata e riprogrammata non hanno esito né qualifica', () => {
    for (const esito of ['no_show', 'cancellata', 'riprogrammata'] as const) {
      const v = esitoCallSchema.parse({ call_id, esito })
      expect(aggiornamentoDaEsito(v)).toEqual({
        stato: esito,
        esito: null,
        qualificata: null,
        obiezione_principale: null,
      })
    }
  })

  it('"da fare" annulla un esito sbagliato', () => {
    const v = esitoCallSchema.parse({ call_id, esito: 'programmata' })
    expect(aggiornamentoDaEsito(v)).toMatchObject({ stato: 'programmata', esito: null })
  })

  it('rifiuta un esito inventato', () => {
    expect(esitoCallSchema.safeParse({ call_id, esito: 'vinta' }).success).toBe(false)
  })
})
