import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  SPOSTA,
  STATI_FERMI,
  avvisoEsitoFermo,
  correzioneSenzaTraccia,
  motivoNonSpostabile,
  motivoQuandoBloccato,
  quandoBreve,
  quandoBreveDa,
  restaNelSuoGiorno,
  rifiutoSpostaAlfire,
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
  it('una call svolta e un no show non si spostano, per nessuno (Dany, 02/10/2026)', () => {
    expect(STATI_FERMI).toEqual(['svolta', 'no_show'])
    for (const stato of ['svolta', 'no_show']) expect(restaNelSuoGiorno(stato), stato).toBe(true)
    for (const stato of ['programmata', 'riprogrammata', 'cancellata']) expect(restaNelSuoGiorno(stato), stato).toBe(false)
    for (const ruolo of ['admin', 'closer'] as const) {
      expect(motivoNonSpostabile('svolta', ruolo)).toBe(SPOSTA.svolta)
      expect(motivoNonSpostabile('no_show', ruolo)).toBe(SPOSTA.noShow)
    }
    expect(motivoNonSpostabile('svolta', 'setter')).toBe(SPOSTA.setterSvolta)
    expect(motivoNonSpostabile('no_show', 'setter')).toBe(SPOSTA.setterNoShow)
  })

  it('closer e admin spostano le call da fare, le cancellate e le riprogrammate', () => {
    for (const ruolo of ['admin', 'closer'] as const) {
      for (const stato of ['programmata', 'riprogrammata', 'cancellata']) {
        expect(motivoNonSpostabile(stato, ruolo), `${ruolo} ${stato}`).toBeNull()
      }
    }
  })

  it('il setter sposta solo le call da fare; le altre con un esito le sposta il closer', () => {
    expect(motivoNonSpostabile('programmata', 'setter')).toBeNull()
    expect(motivoNonSpostabile('riprogrammata', 'setter')).toBe(SPOSTA.setterRiprogrammata)
    expect(motivoNonSpostabile('cancellata', 'setter')).toBe(SPOSTA.setterConEsito)
  })

  it('le frasi dicono la verità: nessuno sposta una call svolta o un no show, il closer non fissa call', () => {
    // never "la sposta lui": nobody moves it
    for (const frase of [SPOSTA.svolta, SPOSTA.noShow, SPOSTA.setterSvolta, SPOSTA.setterNoShow]) {
      expect(frase).not.toMatch(/la sposta/)
    }
    // the closer and the admin undo a wrong outcome; the setter asks them
    expect(SPOSTA.svolta).toContain('annullalo prima')
    expect(SPOSTA.noShow).toContain('annullalo prima')
    expect(SPOSTA.setterSvolta).toContain('lo corregge il closer (o l’admin)')
    expect(SPOSTA.setterNoShow).toContain('lo corregge il closer (o l’admin)')
    // the closer books no call: who does is said
    expect(SPOSTA.svolta).toContain('che fissa il setter (o l’admin)')
    expect(SPOSTA.noShow).toContain('che fissa il setter (o l’admin)')
    expect(SPOSTA.setterSvolta).toContain('fissa una nuova call')
    expect(SPOSTA.setterNoShow).toContain('fissa una nuova call')
    expect(SPOSTA.noShow).toContain('show rate')
  })

  it('la matita: il setter corregge data e ora solo delle call da fare; closer e admin di ogni call, no show compreso', () => {
    for (const stato of ['programmata', 'riprogrammata', 'cancellata', 'svolta', 'no_show']) {
      expect(motivoQuandoBloccato(stato, 'setter'), stato).toBe(motivoNonSpostabile(stato, 'setter'))
    }
    expect(motivoQuandoBloccato('no_show', 'setter')).toBe(SPOSTA.setterNoShow)
    expect(motivoQuandoBloccato('svolta', 'setter')).toBe(SPOSTA.setterSvolta)
    // a typo is not a move: closer and admin correct the date of a held call and
    // of a no-show (Dany, 03/10/2026), while «Sposta» still refuses both
    for (const ruolo of ['admin', 'closer'] as const) {
      for (const stato of ['programmata', 'riprogrammata', 'cancellata', 'svolta', 'no_show']) {
        expect(motivoQuandoBloccato(stato, ruolo), `${ruolo} ${stato}`).toBeNull()
      }
      expect(motivoNonSpostabile('no_show', ruolo)).toBe(SPOSTA.noShow)
    }
  })

  it('Alfire: «sposta» rifiutato dice a closer e admin che una data sbagliata la corregge modifica; al setter le sue parole', () => {
    for (const ruolo of ['admin', 'closer'] as const) {
      // the person reads the words, the model also which action corrects the day
      expect(rifiutoSpostaAlfire('svolta', ruolo)).toEqual({ errore: `${SPOSTA.svolta}. ${SPOSTA.soloLaData}`, per_alfire: SPOSTA.soloLaDataPerAlfire })
      expect(rifiutoSpostaAlfire('no_show', ruolo)).toEqual({ errore: `${SPOSTA.noShow}. ${SPOSTA.soloLaData}`, per_alfire: SPOSTA.soloLaDataPerAlfire })
      for (const stato of ['programmata', 'riprogrammata', 'cancellata']) expect(rifiutoSpostaAlfire(stato, ruolo), stato).toBeNull()
    }
    for (const stato of ['programmata', 'riprogrammata', 'cancellata', 'svolta', 'no_show']) {
      const motivo = motivoNonSpostabile(stato, 'setter')
      expect(rifiutoSpostaAlfire(stato, 'setter'), stato).toEqual(motivo ? { errore: motivo } : null)
    }
    expect(SPOSTA.soloLaData).not.toContain('modifica')
    expect(SPOSTA.soloLaDataPerAlfire).toContain('azione modifica')
    // the card of the pencil on a held call or a no-show: a correction, never a move
    expect(correzioneSenzaTraccia('no_show')).toBe(SPOSTA.correzione.noShow)
    expect(correzioneSenzaTraccia('svolta')).toBe(SPOSTA.correzione.svolta)
    for (const stato of ['programmata', 'riprogrammata', 'cancellata']) expect(correzioneSenzaTraccia(stato), stato).toBeNull()
    for (const frase of Object.values(SPOSTA.correzione)) expect(frase).toContain('senza «Spostata dal…»')
  })

  it('il foglio dell’esito dice perché manca «Riprogrammata» e come si corregge', () => {
    expect(avvisoEsitoFermo('svolta')).toBe(SPOSTA.foglioEsito.svolta)
    expect(avvisoEsitoFermo('no_show')).toBe(SPOSTA.foglioEsito.noShow)
    for (const stato of ['programmata', 'riprogrammata', 'cancellata']) expect(avvisoEsitoFermo(stato), stato).toBeNull()
    for (const frase of Object.values(SPOSTA.foglioEsito)) {
      expect(frase).toContain('non si sposta')
      // a wrong date: the pencil (closer and admin, 03/10/2026); a wrong outcome: undone first
      expect(frase).toContain('Se la data è sbagliata correggila con la matita («Modifica»)')
      expect(frase).toContain('annullalo qui sotto, poi sposta la call')
      expect(frase).toContain('che fissa il setter (o l’admin)')
    }
    expect(SPOSTA.foglioEsito.noShow).toContain('show rate')
    // the no-show's date changes with the pencil: the sheet never says it stays on its day
    expect(SPOSTA.foglioEsito.noShow).not.toContain('resta nel suo giorno')
  })

  it('le stesse parole del database (public.sposta_call, calls_esito_solo_closer), apostrofi compresi', () => {
    // sposta_call: 20261002120000, untouched since
    const spostaCall = readFileSync(new URL('../supabase/migrations/20261002120000_no_show_fermo.sql', import.meta.url), 'utf8')
    for (const frase of [
      SPOSTA.svolta,
      SPOSTA.noShow,
      SPOSTA.setterSvolta,
      SPOSTA.setterNoShow,
      SPOSTA.setterRiprogrammata,
      SPOSTA.setterConEsito,
      SPOSTA.stessoMomento,
    ]) {
      expect(spostaCall, frase).toContain(`'${frase}'`)
    }
    // calls_esito_solo_closer: 20261003090000, the setter's words only; closer
    // and admin are never refused a no-show's date any more
    const trigger = readFileSync(new URL('../supabase/migrations/20261003090000_matita_no_show.sql', import.meta.url), 'utf8')
    for (const frase of [SPOSTA.setterSvolta, SPOSTA.setterNoShow, SPOSTA.setterRiprogrammata, SPOSTA.setterConEsito]) {
      expect(trigger, frase).toContain(`'${frase}'`)
    }
    expect(trigger).not.toContain(SPOSTA.noShow)
    expect(trigger).not.toContain(SPOSTA.svolta)
  })
})
