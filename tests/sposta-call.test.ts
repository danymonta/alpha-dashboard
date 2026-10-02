import { describe, expect, it } from 'vitest'

import {
  SPOSTA,
  motivoNonSpostabile,
  quandoBreve,
  quandoBreveDa,
  scorciatoieSpostamento,
  spostamentoPredefinito,
  tracciaSpostamento,
} from '@/lib/call/spostamento'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import {
  GIORNI_AVANTI_CALL,
  GIORNI_INDIETRO_CALL_ADMIN,
  SPOSTA_SOLO_AVANTI,
  erroreFinestraSpostamento,
  schemaSpostamento,
} from '@/lib/validation/call'

// Moving a call (Dany, 02/10/2026): the same call goes to a new day and time.
const call_id = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const oggi = oggiRoma()

describe('sposta la call: la finestra del nuovo giorno', () => {
  it('closer e setter: da oggi in avanti, anche un’ora di oggi', () => {
    const schema = schemaSpostamento(false)
    expect(schema.safeParse({ call_id, data: oggi, ora: '08:00' }).success).toBe(true)
    expect(schema.safeParse({ call_id, data: aggiungiGiorni(oggi, 1), ora: '18:00' }).success).toBe(true)
    const ieri = schema.safeParse({ call_id, data: aggiungiGiorni(oggi, -1), ora: '18:00' })
    expect(ieri.success).toBe(false)
    expect(ieri.error?.issues[0]).toMatchObject({ path: ['data'], message: SPOSTA_SOLO_AVANTI })
  })

  it('l’admin registra anche una mossa già avvenuta, fino a un anno indietro', () => {
    const schema = schemaSpostamento(true)
    expect(schema.safeParse({ call_id, data: aggiungiGiorni(oggi, -1), ora: '18:00' }).success).toBe(true)
    expect(schema.safeParse({ call_id, data: aggiungiGiorni(oggi, -GIORNI_INDIETRO_CALL_ADMIN), ora: '18:00' }).success).toBe(true)
    expect(erroreFinestraSpostamento(aggiungiGiorni(oggi, -GIORNI_INDIETRO_CALL_ADMIN - 1), true, oggi)).toBe(
      'Al massimo un anno indietro',
    )
  })

  it('al massimo 6 mesi avanti, per tutti: oltre è un errore di battitura', () => {
    for (const admin of [false, true]) {
      expect(erroreFinestraSpostamento(aggiungiGiorni(oggi, GIORNI_AVANTI_CALL), admin, oggi)).toBeNull()
      expect(erroreFinestraSpostamento(aggiungiGiorni(oggi, GIORNI_AVANTI_CALL + 1), admin, oggi)).toBe('Al massimo 6 mesi da oggi')
    }
  })

  it('giorno e ora sono obbligatori e ben scritti', () => {
    const schema = schemaSpostamento(false)
    const domani = aggiungiGiorni(oggi, 1)
    expect(schema.safeParse({ call_id, ora: '18:00' }).error?.issues[0]).toMatchObject({ path: ['data'], message: 'Scegli il nuovo giorno' })
    expect(schema.safeParse({ call_id, data: domani }).error?.issues[0]).toMatchObject({ path: ['ora'], message: 'Scegli l’ora' })
    for (const ora of ['24:00', '9:00', '18:60', '']) {
      expect(schema.safeParse({ call_id, data: domani, ora }).success, ora).toBe(false)
    }
    expect(schema.safeParse({ call_id: 'non-un-id', data: domani, ora: '18:00' }).success).toBe(false)
  })
})

describe('sposta la call: il foglio e la traccia sulla scheda', () => {
  it('il foglio parte dal giorno dopo la call, alla stessa ora; mai prima di domani', () => {
    expect(spostamentoPredefinito('2026-10-05', '19:00', '2026-10-02')).toEqual({ data: '2026-10-06', ora: '19:00' })
    // a call of last week (or of today) moves to tomorrow
    expect(spostamentoPredefinito('2026-09-30', '19:00', '2026-10-02')).toEqual({ data: '2026-10-03', ora: '19:00' })
    expect(spostamentoPredefinito('2026-10-02', '21:30', '2026-10-02')).toEqual({ data: '2026-10-03', ora: '21:30' })
  })

  it('le scorciatoie: oggi, domani, dopodomani; l’admin anche ieri', () => {
    expect(scorciatoieSpostamento('2026-10-02', false)).toEqual([
      { etichetta: 'Oggi', valore: '2026-10-02' },
      { etichetta: 'Domani', valore: '2026-10-03' },
      { etichetta: 'Dopodomani', valore: '2026-10-04' },
    ])
    expect(scorciatoieSpostamento('2026-10-02', true)[0]).toEqual({ etichetta: 'Ieri', valore: '2026-10-01' })
  })

  it('«Spostata dal 30/09 alle 19:00», e quante volte', () => {
    // 17:00 UTC = 19:00 in Rome (summer time)
    expect(tracciaSpostamento({ spostata_dal: null, volte_spostata: 0 }, '2026-10-02')).toBeNull()
    expect(tracciaSpostamento({ spostata_dal: '2026-09-30T17:00:00Z', volte_spostata: 1 }, '2026-10-02')).toBe(
      'Spostata dal 30/09 alle 19:00',
    )
    expect(tracciaSpostamento({ spostata_dal: '2026-09-30T17:00:00Z', volte_spostata: 3 }, '2026-10-02')).toBe(
      'Spostata 3 volte, l’ultima dal 30/09 alle 19:00',
    )
    // winter time, and another year: the year is said
    expect(quandoBreve('2025-12-30T17:00:00Z', '2026-10-02')).toBe('30/12/2025 alle 18:00')
    expect(quandoBreveDa('2026-10-03', '18:00', '2026-10-02')).toBe('03/10 alle 18:00')
  })
})

describe('sposta la call: chi sposta quale call', () => {
  it('una call svolta non si sposta, per nessuno; il setter sposta solo le call da fare', () => {
    for (const ruolo of ['admin', 'closer'] as const) {
      expect(motivoNonSpostabile('programmata', ruolo)).toBeNull()
      expect(motivoNonSpostabile('riprogrammata', ruolo)).toBeNull()
      expect(motivoNonSpostabile('no_show', ruolo)).toBeNull()
      expect(motivoNonSpostabile('cancellata', ruolo)).toBeNull()
      expect(motivoNonSpostabile('svolta', ruolo)).toBe(SPOSTA.svolta)
    }
    expect(motivoNonSpostabile('programmata', 'setter')).toBeNull()
    expect(motivoNonSpostabile('riprogrammata', 'setter')).toBe(SPOSTA.setterRiprogrammata)
    for (const stato of ['svolta', 'no_show', 'cancellata']) {
      expect(motivoNonSpostabile(stato, 'setter')).toBe(SPOSTA.setterConEsito)
    }
  })
})
