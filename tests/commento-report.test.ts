import { describe, expect, it } from 'vitest'

import { LEGENDA_SETTING } from '@/lib/metriche/legenda'
import {
  COMMENTO,
  COMMENTO_CHIESTO_DAL,
  LIVELLI_IN_TARGET,
  LIVELLI_QUALITA,
  SCALA_IN_TARGET,
  SCALA_QUALITA,
  SCALE_COMMENTO,
  TESTI_COMMENTO,
  MARKETING,
  MOTIVO_NON_CHIUSURA,
  NOTE_CLOSER,
  NOTE_SETTER,
  ESITO_DEL_CLOSER,
  commentoDaCompletare,
  etichettaLivello,
  giornataConAttivita,
} from '@/lib/setting/commento'
import { Constants } from '@/lib/supabase/database.types'
import {
  GRUPPI_REPORT,
  REPORT_VUOTO,
  correzioneReportSchema,
  nuovoReportSchema,
  reportGiornalieroSchema,
} from '@/lib/validation/report'

const giorno = { data: '2026-09-29', ...REPORT_VUOTO }

describe('il commento del setter sulla giornata: lo schema', () => {
  it('accetta le due scale e i due testi, e un report senza risposte', () => {
    expect(
      reportGiornalieroSchema.safeParse({
        ...giorno,
        dm_outbound: 20,
        lead_in_target: 'circa_meta',
        qualita_conversazioni: 'medie',
        cosa_frenava: 'Sono solo curioso',
        domande_contenuti: 'Chiedono se serve la palestra',
      }).success,
    ).toBe(true)
    // never a blocked save: the scales are asked, not required
    expect(reportGiornalieroSchema.safeParse({ ...giorno, dm_outbound: 20 }).success).toBe(true)
  })

  it('i livelli sono quelli del database, in quell’ordine', () => {
    expect(LIVELLI_IN_TARGET).toEqual(Constants.public.Enums.quota_in_target)
    expect(LIVELLI_QUALITA).toEqual(Constants.public.Enums.qualita_conversazioni)
    expect(SCALA_IN_TARGET.opzioni.map((o) => o.valore)).toEqual([...LIVELLI_IN_TARGET])
    expect(SCALA_QUALITA.opzioni.map((o) => o.valore)).toEqual([...LIVELLI_QUALITA])
  })

  it('rifiuta un livello che non esiste', () => {
    expect(reportGiornalieroSchema.safeParse({ ...giorno, lead_in_target: 'tutti' }).success).toBe(false)
    expect(reportGiornalieroSchema.safeParse({ ...giorno, qualita_conversazioni: 'ottime' }).success).toBe(false)
  })

  it('un testo vuoto o di soli spazi è nessuna risposta; oltre 1000 caratteri no', () => {
    const parsed = reportGiornalieroSchema.parse({ ...giorno, cosa_frenava: '   ', domande_contenuti: '' })
    expect(parsed.cosa_frenava).toBeNull()
    expect(parsed.domande_contenuti).toBeNull()
    expect(reportGiornalieroSchema.safeParse({ ...giorno, cosa_frenava: 'x'.repeat(1001) }).success).toBe(false)
    expect(reportGiornalieroSchema.safeParse({ ...giorno, domande_contenuti: 'x'.repeat(1000) }).success).toBe(true)
  })

  it('una risposta non mandata resta com’è (undefined), null la toglie', () => {
    const soloNumeri: Record<string, unknown> = { ...giorno }
    for (const campo of ['lead_in_target', 'qualita_conversazioni', 'cosa_frenava', 'domande_contenuti']) delete soloNumeri[campo]
    const parsed = reportGiornalieroSchema.parse(soloNumeri)
    expect(parsed.lead_in_target).toBeUndefined()
    expect(parsed.cosa_frenava).toBeUndefined()
    expect(reportGiornalieroSchema.parse({ ...giorno, lead_in_target: null }).lead_in_target).toBeNull()
  })

  it('le stesse risposte per l’admin: nuova giornata e correzione', () => {
    const risposte = { lead_in_target: 'pochi', qualita_conversazioni: 'scarse', cosa_frenava: 'Non ho tempo per una call' }
    expect(
      nuovoReportSchema.safeParse({ ...giorno, ...risposte, setter_id: '22222222-2222-4222-8222-222222222222' }).success,
    ).toBe(true)
    expect(
      correzioneReportSchema.safeParse({ ...REPORT_VUOTO, ...risposte, id: '22222222-2222-4222-8222-222222222222' }).success,
    ).toBe(true)
  })
})

describe('«Da completare»: la giornata con attività chiede le due scale', () => {
  const vuota = { dm_outbound: 0, dm_inbound: 0, follow_up: 0, conversazioni: 0 }

  it('attività: DM totali > 0 o conversazioni > 0', () => {
    expect(giornataConAttivita(vuota)).toBe(false)
    expect(giornataConAttivita({ ...vuota, dm_outbound: 1 })).toBe(true)
    expect(giornataConAttivita({ ...vuota, dm_inbound: 3 })).toBe(true)
    expect(giornataConAttivita({ ...vuota, follow_up: 2 })).toBe(true)
    expect(giornataConAttivita({ ...vuota, conversazioni: 5 })).toBe(true)
  })

  it('con attività e una scala mancante: da completare', () => {
    expect(commentoDaCompletare({ ...vuota, dm_outbound: 10 })).toBe(true)
    expect(commentoDaCompletare({ ...vuota, conversazioni: 4, lead_in_target: 'pochi' })).toBe(true)
    expect(commentoDaCompletare({ ...vuota, follow_up: 1, qualita_conversazioni: 'buone', lead_in_target: null })).toBe(true)
  })

  it('senza attività non si chiede niente, anche senza risposte', () => {
    expect(commentoDaCompletare(vuota)).toBe(false)
    // calls proposed or booked alone are not DM activity
    expect(commentoDaCompletare({ ...vuota, lead_in_target: null, qualita_conversazioni: null })).toBe(false)
  })

  it('con le due scale scelte è completo; i testi restano facoltativi', () => {
    expect(
      commentoDaCompletare({ ...vuota, dm_outbound: 30, conversazioni: 8, lead_in_target: 'quasi_tutti', qualita_conversazioni: 'medie' }),
    ).toBe(false)
  })

  it('un report compilato prima che le domande esistessero non è mai «da completare»', () => {
    const conDm = { ...vuota, dm_outbound: 12 }
    expect(COMMENTO_CHIESTO_DAL).toBe('2026-09-30')
    // created on 29/09 at 23:30 in Rome (21:30 UTC): before
    expect(commentoDaCompletare(conDm, '2026-09-29T21:30:00Z')).toBe(false)
    // created on 30/09 at 00:30 in Rome (22:30 UTC of the 29th): asked, whatever day it reports
    expect(commentoDaCompletare(conDm, '2026-09-29T22:30:00Z')).toBe(true)
    expect(commentoDaCompletare(conDm, '2026-10-02T08:00:00Z')).toBe(true)
    // not saved yet: asked
    expect(commentoDaCompletare(conDm, null)).toBe(true)
    expect(commentoDaCompletare(conDm)).toBe(true)
  })
})

describe('le parole del commento stanno in un solo posto', () => {
  it('ogni livello ha la sua definizione, e la legenda usa le stesse parole', () => {
    for (const scala of SCALE_COMMENTO) {
      for (const o of scala.opzioni) {
        expect(o.definizione.length, `${scala.campo}.${o.valore}`).toBeGreaterThan(5)
        expect(LEGENDA_SETTING[scala.campo].spiegazione).toContain(o.etichetta)
        expect(LEGENDA_SETTING[scala.campo].spiegazione).toContain(o.definizione.replace(/\.$/, ''))
      }
    }
    expect(LEGENDA_SETTING.lead_in_target.etichetta).toBe('Lead in target')
    expect(LEGENDA_SETTING.lead_in_target.spiegazione).toContain('uomo dai 25 anni in su')
  })

  it('le etichette dei valori salvati', () => {
    expect(etichettaLivello('lead_in_target', 'circa_meta')).toBe('Circa metà')
    expect(etichettaLivello('qualita_conversazioni', 'scarse')).toBe('Scarse')
    expect(etichettaLivello('qualita_conversazioni', null)).toBeNull()
  })

  it('le domande di Dany, con i loro esempi; «Altre note» è la nota di sempre', () => {
    expect(SCALA_IN_TARGET.domanda).toMatch(/lead .* in target/)
    expect(SCALA_IN_TARGET.spiegazione).toContain('uomo dai 25 anni in su')
    expect(SCALA_QUALITA.domanda).toMatch(/conversazioni/)
    expect(TESTI_COMMENTO.map((t) => t.campo)).toEqual(['cosa_frenava', 'domande_contenuti', 'note'])
    // what held the leads back from booking: never the price, that is the closer's
    expect(TESTI_COMMENTO[0].domanda).toBe('Cosa frenava i lead dal fissare la call?')
    expect(TESTI_COMMENTO[0].placeholder).toContain('sono solo curioso')
    expect(TESTI_COMMENTO[0].placeholder).not.toMatch(/costa|prezzo|budget/i)
    expect(TESTI_COMMENTO[1].placeholder).toContain('reel')
    expect(TESTI_COMMENTO[2]).toMatchObject({ titolo: 'Altre note', domanda: 'Altro da segnalare?' })
    expect(COMMENTO.daCompletare).toBe('Da completare')
  })

  it('nessun nome interno sullo schermo, e domande che valgono anche quando l’admin compila per un setter', () => {
    const testi = [
      COMMENTO.descrizione,
      COMMENTO.daCompletareSpiegazione,
      MARKETING.setting.nessunTesto,
      ...SCALE_COMMENTO.flatMap((s) => [s.domanda, s.spiegazione ?? '']),
      ...TESTI_COMMENTO.flatMap((t) => [t.domanda, t.placeholder]),
    ]
    for (const t of testi) expect(t, t).not.toMatch(/\bscal[ae]\b/i)
    for (const t of [...SCALE_COMMENTO.map((s) => s.spiegazione ?? ''), ...TESTI_COMMENTO.map((t) => t.domanda)]) {
      expect(t, t).not.toMatch(/\bhai\b|scriverti/)
    }
  })

  it('il foglio dell’esito: ogni parola da qui, e mai importi nei testi del closer', () => {
    expect(MOTIVO_NON_CHIUSURA).toMatchObject({ titolo: 'Motivo di non chiusura', domanda: 'Perché non ha chiuso?' })
    expect(MOTIVO_NON_CHIUSURA.salva).toBe('Un tocco su Sì o No salva l’esito.')
    expect(MOTIVO_NON_CHIUSURA.senzaImporti).toMatch(/importo proposto/)
    expect(NOTE_CLOSER).toMatchObject({ titolo: 'Note aggiuntive', diChi: 'Note aggiuntive del closer', facoltative: 'facoltative' })
  })

  it('due note sulla call, ognuna col suo autore (Dany, 30/09/2026)', () => {
    expect(NOTE_SETTER.titolo).toBe('Note del setter')
    expect(NOTE_SETTER.troppoLungo).toBe('Al massimo 1000 caratteri')
    // the database checks 2000 characters on calls.note_closer
    expect(NOTE_CLOSER.troppoLungo).toBe('Al massimo 2000 caratteri')
    expect(ESITO_DEL_CLOSER).toMatch(/esito.*motivo di non chiusura.*note aggiuntive.*closer/i)
    expect(MARKETING.call.descrizione).toMatch(/note aggiuntive/)
  })

  it('il commento sta con le conversazioni, prima delle call', () => {
    const titoli = GRUPPI_REPORT.map((g) => g.titolo)
    const conCommento = GRUPPI_REPORT.findIndex((g) => g.commento)
    expect(GRUPPI_REPORT[conCommento].campi.map(([campo]) => campo)).toContain('conversazioni')
    expect(conCommento).toBeLessThan(titoli.indexOf('Call'))
    expect(GRUPPI_REPORT.filter((g) => g.commento)).toHaveLength(1)
  })
})
