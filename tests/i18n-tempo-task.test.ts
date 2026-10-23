import { describe, expect, it } from 'vitest'

import { formato } from '@/lib/format'
import { MIEI_TASK, traduciErroreTask } from '@/lib/i18n/testi/task'
import { MIO_TEMPO, traduciErroreTempo } from '@/lib/i18n/testi/tempo'
import { etichettaCompletato, GRUPPI } from '@/lib/miei-task'
import { periodoTempo } from '@/lib/tempo'
import {
  MESSAGGIO_24,
  MESSAGGIO_24_INIZIO,
  MESSAGGIO_FASCIA_A_META,
  MESSAGGIO_FINE_PRIMA,
  messaggioMezzanotte,
  tempoManualeSchema,
} from '@/lib/validation/tempo'

/** I miei task and Il mio tempo in English (1.53.0): the Italian words of always, the English ones beside them. */

const OGGI = '2026-10-05'

describe('I miei task in inglese', () => {
  it('i gruppi in italiano sono quelli di lib/miei-task', () => {
    for (const g of GRUPPI) expect(MIEI_TASK.it.gruppi[g.chiave]).toBe(g.titolo)
    expect(MIEI_TASK.en.gruppi.settimana).toBe('Next 7 days')
  })

  it('«Completato» dice il giorno nella lingua della pagina', () => {
    const en = MIEI_TASK.en.completato
    const data = formato('en').formatData
    expect(etichettaCompletato('2026-10-05T16:42:00+00:00', OGGI, en, data)).toBe('Completed today at 18:42')
    expect(etichettaCompletato('2026-10-04T07:05:00+00:00', OGGI, en, data)).toBe('Completed yesterday at 09:05')
    expect(etichettaCompletato('2026-09-28T10:00:00+00:00', OGGI, en, data)).toBe('Completed on 28 Sep 2026')
    expect(etichettaCompletato(null, OGGI, en, data)).toBe('Completed')
    // Italian, as always
    expect(etichettaCompletato('2026-09-28T10:00:00+00:00', OGGI)).toBe('Completato il 28/09/2026')
  })

  it('«con» elenca le persone', () => {
    expect(MIEI_TASK.it.con(['Anna', 'Marco'])).toBe('con Anna e Marco')
    expect(MIEI_TASK.en.con(['Anna'])).toBe('with Anna')
    expect(MIEI_TASK.en.con(['Anna', 'Marco', 'Luca'])).toBe('with Anna, Marco and Luca')
  })

  it('le risposte note delle azioni si traducono, le altre restano', () => {
    expect(traduciErroreTask('Task non aggiornato. Riprova.', 'en')).toBe('Task not updated. Try again.')
    expect(traduciErroreTask('Task non aggiornato. Riprova.', 'it')).toBe('Task non aggiornato. Riprova.')
    expect(traduciErroreTask('Un messaggio del database', 'en')).toBe('Un messaggio del database')
  })
})

describe('Il mio tempo in inglese', () => {
  it('il periodo ha le parole e le date della lingua', () => {
    const it_ = periodoTempo({}, OGGI)
    expect(it_.titolo).toBe('Questa settimana')
    expect(it_.etichetta).toBe('05/10/2026 – 11/10/2026')
    const en = periodoTempo({}, OGGI, 'en')
    expect(en.titolo).toBe('This week')
    expect(en.etichetta).toBe('05 Oct 2026 – 11 Oct 2026')
    expect(periodoTempo({ settimana: '2026-09-28' }, OGGI, 'en').titolo).toBe('Last week')
    expect(periodoTempo({ settimana: '2026-09-15' }, OGGI, 'en').titolo).toBe('Week of 14 Sep 2026')
    expect(periodoTempo({ da: '2026-09-01', a: '2026-09-30' }, OGGI, 'en').titolo).toBe(MIO_TEMPO.en.periodo.libero)
  })

  it('i messaggi dello schema hanno tutti la loro traduzione', () => {
    for (const messaggio of [
      MESSAGGIO_24,
      MESSAGGIO_24_INIZIO,
      MESSAGGIO_FASCIA_A_META,
      MESSAGGIO_FINE_PRIMA,
      'Al massimo 2000 caratteri',
      'Scrivi la durata, ad esempio 1:30, 90 o 1h30',
    ]) {
      const inglese = traduciErroreTempo(messaggio, 'en')
      expect(inglese, messaggio).not.toBe(messaggio)
      expect(traduciErroreTempo(messaggio, 'it')).toBe(messaggio)
    }
  })

  it('una durata che lo schema rifiuta ha il suo messaggio inglese', () => {
    const esito = tempoManualeSchema.safeParse({
      progetto_id: '00000000-0000-4000-8000-000000000001',
      data: '2026-10-01',
      durata: 'boh',
    })
    expect(esito.success).toBe(false)
    const messaggio = esito.success ? '' : esito.error.issues[0]!.message
    expect(traduciErroreTempo(messaggio, 'en')).toBe('Write the duration, for example 1:30, 90 or 1h30')
  })

  it('una fascia oltre la mezzanotte dice le due voci in inglese', () => {
    expect(traduciErroreTempo(messaggioMezzanotte('2026-10-01', '23:00', '01:00'), 'en')).toBe(
      'The end time must be after the start time. If it goes past midnight it is two entries: on the start day 1 h as a duration, without a range (from 23:00 to midnight), and on the next day the range 00:00–01:00',
    )
    expect(traduciErroreTempo(messaggioMezzanotte('2026-10-01', '22:30', '00:00'), 'en')).toBe(
      'The end time must be after the start time. Up to midnight log 1 h 30 min as a duration, without a range (from 22:30 to midnight)',
    )
  })

  it('i motivi di un timer senza fascia in inglese', () => {
    expect(MIO_TEMPO.en.form.orariTimer('23:30–00:30, a cavallo della mezzanotte')).toBe('23:30–00:30, across midnight')
    expect(MIO_TEMPO.it.form.orariTimer('23:30–00:30, a cavallo della mezzanotte')).toBe(
      '23:30–00:30, a cavallo della mezzanotte',
    )
  })

  it('nessun trattino lungo nelle parole delle due pagine', () => {
    expect(JSON.stringify([MIEI_TASK, MIO_TEMPO])).not.toContain('—')
  })
})
