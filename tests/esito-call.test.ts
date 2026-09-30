import { describe, expect, it } from 'vitest'

import { MOTIVO_NON_CHIUSURA, NOTE_CALL } from '@/lib/setting/commento'
import { aggiornamentoDaEsito, chiedeMotivo, esitoCallSchema } from '@/lib/validation/esito'

const call_id = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'

describe('esito della call', () => {
  it('chiusa implica svolta e qualificata, senza motivo', () => {
    const v = esitoCallSchema.parse({ call_id, esito: 'chiusa' })
    expect(aggiornamentoDaEsito(v)).toEqual({
      stato: 'svolta',
      esito: 'chiusa',
      qualificata: true,
      obiezione_principale: null,
    })
  })

  it('persa e follow-up pretendono la qualifica e il motivo di non chiusura', () => {
    expect(esitoCallSchema.safeParse({ call_id, esito: 'persa', motivo: 'Fuori budget' }).success).toBe(false)
    const v = esitoCallSchema.parse({
      call_id,
      esito: 'persa',
      qualificata: false,
      motivo: '  fuori budget  ',
    })
    expect(aggiornamentoDaEsito(v)).toEqual({
      stato: 'svolta',
      esito: 'persa',
      qualificata: false,
      obiezione_principale: 'fuori budget',
    })
  })

  it('follow-up o persa senza motivo non si salvano (Dany, 30/09/2026)', () => {
    for (const esito of ['follow_up', 'persa'] as const) {
      for (const motivo of [undefined, null, '', '   ']) {
        const r = esitoCallSchema.safeParse({ call_id, esito, qualificata: true, motivo })
        expect(r.success, `${esito} con motivo ${JSON.stringify(motivo)}`).toBe(false)
        expect(r.error?.issues[0]).toMatchObject({ path: ['motivo'], message: MOTIVO_NON_CHIUSURA.manca })
      }
    }
  })

  it('il motivo ha un tetto di 500 caratteri', () => {
    expect(esitoCallSchema.safeParse({ call_id, esito: 'persa', qualificata: true, motivo: 'x'.repeat(500) }).success).toBe(true)
    const r = esitoCallSchema.safeParse({ call_id, esito: 'persa', qualificata: true, motivo: 'x'.repeat(501) })
    expect(r.error?.issues[0]?.message).toBe(MOTIVO_NON_CHIUSURA.troppoLungo)
  })

  it('chiusa, no show e gli altri esiti non chiedono il motivo', () => {
    for (const esito of ['chiusa', 'no_show', 'cancellata', 'riprogrammata', 'programmata'] as const) {
      expect(esitoCallSchema.safeParse({ call_id, esito }).success, esito).toBe(true)
      expect(chiedeMotivo(esito)).toBe(false)
    }
    expect(chiedeMotivo('follow_up')).toBe(true)
    expect(chiedeMotivo('persa')).toBe(true)
  })

  it('le note aggiuntive sono facoltative: non mandate restano, vuote si tolgono', () => {
    const senza = esitoCallSchema.parse({ call_id, esito: 'follow_up', qualificata: true, motivo: 'Deve parlarne con la compagna' })
    expect(aggiornamentoDaEsito(senza)).not.toHaveProperty('note')
    const con = esitoCallSchema.parse({ call_id, esito: 'follow_up', qualificata: true, motivo: 'Non è il momento', note: ' Richiamare a gennaio ' })
    expect(aggiornamentoDaEsito(con)).toMatchObject({ obiezione_principale: 'Non è il momento', note: 'Richiamare a gennaio' })
    const vuote = esitoCallSchema.parse({ call_id, esito: 'persa', qualificata: false, motivo: 'Vuole provare da solo', note: '  ' })
    expect(aggiornamentoDaEsito(vuote)).toMatchObject({ note: null })
    const r = esitoCallSchema.safeParse({ call_id, esito: 'persa', qualificata: false, motivo: 'x', note: 'x'.repeat(1001) })
    expect(r.error?.issues[0]?.message).toBe(NOTE_CALL.troppoLungo)
  })

  it('no show, cancellata e riprogrammata non hanno esito, qualifica né motivo', () => {
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
