import { describe, expect, it } from 'vitest'

import { LEGENDA_SETTING } from '@/lib/metriche/legenda'
import {
  chiedeCommento,
  commentoPropostaSchema,
  confermaPropostaAdminSchema,
  confermaPropostaSetterSchema,
  decisioneChiedeCommento,
  scartaPropostaSchema,
  scartaPropostaSetterSchema,
} from '@/app/(app)/today/proposta-instagram'
import {
  CAMPI_OBBLIGATORI,
  COMMENTO,
  COMMENTO_CHIESTO_DAL,
  COMMENTO_OBBLIGATORIO,
  COMMENTO_OBBLIGATORIO_DAL,
  FILTRO_ATTIVITA,
  FILTRO_COMMENTO_MANCANTE,
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
  commentoMancante,
  commentoObbligatorio,
  etichettaLivello,
  giornataConAttivita,
  paroleMancanti,
  risposteMancanti,
  statoCommento,
  testoScritto,
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

describe('il commento obbligatorio dall’08/10/2026 (Dany: «deve lui sempre lasciare un commento della giornata»)', () => {
  const vuota = { dm_outbound: 0, dm_inbound: 0, follow_up: 0, conversazioni: 0 }
  const completo = { lead_in_target: 'pochi', qualita_conversazioni: 'medie', cosa_frenava: 'Ci devono pensare' }

  it('da quel giorno in poi, per il giorno del report e non per quando è salvato', () => {
    expect(COMMENTO_OBBLIGATORIO_DAL).toBe('2026-10-08')
    expect(commentoObbligatorio('2026-10-07')).toBe(false)
    expect(commentoObbligatorio('2026-10-08')).toBe(true)
    expect(commentoObbligatorio('2027-01-01')).toBe(true)
  })

  it('le tre risposte: lead in target, qualità delle conversazioni e cosa frenava i lead', () => {
    expect(CAMPI_OBBLIGATORI).toEqual(['lead_in_target', 'qualita_conversazioni', 'cosa_frenava'])
    expect(risposteMancanti({})).toEqual(['lead_in_target', 'qualita_conversazioni', 'cosa_frenava'])
    expect(risposteMancanti({ ...completo, cosa_frenava: '  \n ' })).toEqual(['cosa_frenava'])
    expect(risposteMancanti(completo)).toEqual([])
    expect(paroleMancanti(['lead_in_target', 'qualita_conversazioni', 'cosa_frenava'])).toEqual([
      'lead in target',
      'qualità delle conversazioni',
      'cosa frenava i lead',
    ])
    expect(testoScritto(' x ')).toBe(true)
    expect(testoScritto('   ')).toBe(false)
    expect(testoScritto(null)).toBe(false)
    // control characters that trim() keeps: an answer, as for testo_scritto in the database
    expect(testoScritto('\u0085')).toBe(true)
    expect(testoScritto('\u001f')).toBe(true)
    expect(testoScritto(' 　﻿')).toBe(false)
  })

  it("gli spazi di trim() sono quelli di testo_scritto nel database (65_commento_obbligatorio.sql)", () => {
    const vuoti: number[] = []
    for (let i = 1; i <= 0xffff; i++) {
      if (i >= 0xd800 && i <= 0xdfff) continue
      if (!testoScritto(String.fromCharCode(i))) vuoti.push(i)
    }
    expect(vuoti).toEqual([
      9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233,
      8239, 8287, 12288, 65279,
    ])
  })

  it('manca solo nei giorni con DM o conversazioni, senza una delle tre risposte', () => {
    expect(commentoMancante({ ...vuota, dm_outbound: 5 }, '2026-10-08')).toBe(true)
    expect(commentoMancante({ ...vuota, conversazioni: 2, lead_in_target: 'pochi', qualita_conversazioni: 'buone' }, '2026-10-08')).toBe(true)
    expect(commentoMancante({ ...vuota, follow_up: 1, ...completo }, '2026-10-08')).toBe(false)
    // no activity: nothing required
    expect(commentoMancante(vuota, '2026-10-08')).toBe(false)
    // a day before: never required
    expect(commentoMancante({ ...vuota, dm_outbound: 5 }, '2026-10-07')).toBe(false)
  })

  it('lo stato del giorno: «manca» dall’08/10, «da completare» prima, con la regola di prima', () => {
    expect(statoCommento({ ...vuota, dm_inbound: 3 }, '2026-10-08')).toBe('manca')
    // the two scales alone are not enough any more
    expect(statoCommento({ ...vuota, dm_inbound: 3, lead_in_target: 'pochi', qualita_conversazioni: 'buone' }, '2026-10-08')).toBe('manca')
    expect(statoCommento({ ...vuota, dm_inbound: 3, ...completo }, '2026-10-09')).toBeNull()
    // before: the two scales, asked only on a report created from 30/09
    expect(statoCommento({ ...vuota, dm_inbound: 3 }, '2026-10-07')).toBe('da_completare')
    expect(statoCommento({ ...vuota, dm_inbound: 3, lead_in_target: 'pochi', qualita_conversazioni: 'buone' }, '2026-10-07')).toBeNull()
    expect(statoCommento({ ...vuota, dm_inbound: 3 }, '2026-09-20', '2026-09-20T10:00:00Z')).toBeNull()
    // from 08/10 the created_at does not matter: the day does
    expect(statoCommento({ ...vuota, dm_inbound: 3 }, '2026-10-08', '2026-09-20T10:00:00Z')).toBe('manca')
  })

  it('i filtri del conteggio sono la stessa regola: attività, poi una delle tre risposte che manca', () => {
    expect(FILTRO_ATTIVITA.split(',')).toEqual(['dm_outbound.gt.0', 'dm_inbound.gt.0', 'follow_up.gt.0', 'conversazioni.gt.0'])
    expect(FILTRO_COMMENTO_MANCANTE.split(',').map((f) => f.split('.')[0])).toEqual([...CAMPI_OBBLIGATORI])
  })

  it('la decisione sulla proposta di Instagram chiede il commento con i numeri dopo la decisione', () => {
    const instagram = { dm_outbound: 53, dm_inbound: 4, follow_up: 16, conversazioni: 21, call_proposte: 4, discovery_prenotate: 2 }
    const zero = { dm_outbound: 0, dm_inbound: 0, follow_up: 0, conversazioni: 0, call_proposte: 3, discovery_prenotate: 1 }
    const nessuna = { lead_in_target: null, qualita_conversazioni: null, cosa_frenava: null }
    expect(decisioneChiedeCommento('2026-10-08', instagram, nessuna)).toBe(true)
    expect(decisioneChiedeCommento('2026-10-08', instagram, completo)).toBe(false)
    // only calls: no DM activity, nothing required
    expect(decisioneChiedeCommento('2026-10-08', zero, nessuna)).toBe(false)
    expect(decisioneChiedeCommento('2026-10-07', instagram, nessuna)).toBe(false)
  })

  it('lo schema del passo: le tre risposte date, il testo non vuoto, solo per il setter', () => {
    expect(commentoPropostaSchema.safeParse(completo).success).toBe(true)
    expect(commentoPropostaSchema.safeParse({ ...completo, cosa_frenava: '   ' }).success).toBe(false)
    expect(commentoPropostaSchema.safeParse({ ...completo, lead_in_target: null }).success).toBe(false)
    expect(commentoPropostaSchema.safeParse({ ...completo, cosa_frenava: 'x'.repeat(1001) }).success).toBe(false)
    // the other answers never go with a decision
    expect(commentoPropostaSchema.safeParse({ ...completo, note: 'Altro' }).success).toBe(false)
    const id = '22222222-2222-4222-8222-222222222222'
    expect(confermaPropostaSetterSchema.safeParse({ id, calcolato_il: '2026-10-08T00:30:00Z', commento: completo }).success).toBe(true)
    expect(scartaPropostaSetterSchema.safeParse({ id, commento: completo }).success).toBe(true)
    expect(scartaPropostaSetterSchema.safeParse({ id }).success).toBe(true)
    // the admin's schemas know nothing of it: the comment is the setter's
    expect(confermaPropostaAdminSchema.shape).not.toHaveProperty('commento')
    expect(scartaPropostaSchema.shape).not.toHaveProperty('commento')
  })

  it('il rifiuto del database per il commento si riconosce', () => {
    expect(
      chiedeCommento({
        code: '22023',
        message: "Prima di confermare scrivi com'è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.",
      }),
    ).toBe(true)
    expect(
      chiedeCommento({
        code: '22023',
        message: "Prima di tenere i tuoi numeri scrivi com'è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.",
      }),
    ).toBe(true)
    expect(chiedeCommento({ code: '22023', message: 'Questa proposta è già stata confermata' })).toBe(false)
  })

  it('le parole: solo per il setter, nessun nome interno', () => {
    expect(COMMENTO_OBBLIGATORIO.manca).toBe('Manca il commento della giornata')
    expect(COMMENTO_OBBLIGATORIO.altri(1)).toBe('e 1 altro giorno')
    expect(COMMENTO_OBBLIGATORIO.altri(3)).toBe('e altri 3 giorni')
    for (const t of [COMMENTO_OBBLIGATORIO.descrizione, COMMENTO_OBBLIGATORIO.mancaSpiegazione, ...Object.values(COMMENTO_OBBLIGATORIO.errore)]) {
      expect(t, t).not.toMatch(/\bscal[ae]\b|lead_in_target|cosa_frenava/i)
    }
  })
})
