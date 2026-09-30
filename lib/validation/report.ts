import { z } from 'zod'

import { isDataISO } from '@/lib/date'
import { LEGENDA_SETTING } from '@/lib/metriche/legenda'
import { LIVELLI_IN_TARGET, LIVELLI_QUALITA, MASSIMO_TESTO_COMMENTO } from '@/lib/setting/commento'

/** Numeric fields of setter_daily_reports, in the same order as the schema. */
export const CAMPI_NUMERICI_REPORT = [
  'dm_outbound',
  'dm_inbound',
  'conversazioni',
  'call_proposte',
  'discovery_prenotate',
  'discovery_svolte',
  'call_qualificate',
  'strategy_prenotate',
  'follow_up',
] as const

export type CampoNumericoReport = (typeof CAMPI_NUMERICI_REPORT)[number]

/**
 * The counters the setter fills in, in the order the day goes: messages, then
 * calls. Each one is [field, label, short hint]; label and meaning come from
 * lib/metriche/legenda, the hint is its one-line version for the phone.
 * The first group holds exactly the three parts of DM totali, side by side;
 * conversations do not count there, so they get a group of their own.
 * Not asked any more, but kept in the schema so old values stay (Dany, 29/09/2026):
 * strategy_prenotate (the setter books discovery calls only), discovery_svolte and
 * call_qualificate (held and qualified are the closer's, recorded on each call).
 * The setter's comment on his day (lib/setting/commento.ts) sits with the
 * conversations, before the calls (Dany, 30/09/2026: "insieme ai volumi dove
 * mette il numero di conversazioni"): the group that carries `commento`.
 */
export const GRUPPI_REPORT: {
  titolo: string
  /** A read-only line under the group. */
  nota?: string
  /** The four guided answers come right after this group's counters. */
  commento?: true
  campi: [CampoNumericoReport, string, string][]
}[] = [
  {
    titolo: 'Messaggi',
    campi: [
      ['dm_outbound', LEGENDA_SETTING.dm_outbound.etichetta, 'Persone nuove a cui scrivi tu per primo'],
      ['dm_inbound', LEGENDA_SETTING.dm_inbound.etichetta, 'Persone nuove che ti chiedono informazioni e a cui rispondi'],
      ['follow_up', LEGENDA_SETTING.follow_up.etichetta, 'Solleciti a chi non ti ha ancora risposto'],
    ],
  },
  {
    titolo: 'Conversazioni',
    nota: 'Non entrano nei DM totali.',
    commento: true,
    campi: [
      ['conversazioni', LEGENDA_SETTING.conversazioni.etichetta, 'Chi ti risponde e a cui rispondi, anche il giorno dopo'],
    ],
  },
  {
    titolo: 'Call',
    campi: [
      ['call_proposte', LEGENDA_SETTING.call_proposte.etichetta, 'Persone a cui proponi una call'],
      ['discovery_prenotate', LEGENDA_SETTING.discovery_prenotate.etichetta, 'Discovery call che fissi in questa giornata'],
    ],
  },
]

/** Sanity ceiling against typos (3000 instead of 30), not a business rule. */
export const MASSIMO_GIORNALIERO = 9999

const conteggio = z
  .number({ invalid_type_error: 'Deve essere un numero' })
  .int('Solo numeri interi')
  .min(0, 'Non può essere negativo')
  .max(MASSIMO_GIORNALIERO, `Al massimo ${MASSIMO_GIORNALIERO}`)

/** A free answer of the comment: blank is no answer (null); left out, the saved one stays. */
const testoCommento = z
  .string()
  .max(MASSIMO_TESTO_COMMENTO, `Al massimo ${MASSIMO_TESTO_COMMENTO} caratteri`)
  .nullish()
  .transform((v) => (v === undefined ? undefined : v && v.trim() !== '' ? v : null))

/**
 * One schema for the client form and the server action.
 * setter_id is deliberately absent: the server takes it from the session.
 * The comment's answers are optional: the scales are asked on days with
 * activity ("Da completare" on the setter's screen) but never block a save.
 * A key left out keeps what is saved; null clears it.
 */
export const reportGiornalieroSchema = z.object({
  data: z.string().refine(isDataISO, 'Data non valida'),
  dm_outbound: conteggio,
  dm_inbound: conteggio,
  conversazioni: conteggio,
  call_proposte: conteggio,
  discovery_prenotate: conteggio,
  discovery_svolte: conteggio,
  call_qualificate: conteggio,
  strategy_prenotate: conteggio,
  follow_up: conteggio,
  contenuto_pubblicato: z.boolean(),
  note: z
    .string()
    .max(2000, 'Al massimo 2000 caratteri')
    .nullable()
    .transform((v) => (v && v.trim() !== '' ? v : null)),
  lead_in_target: z.enum(LIVELLI_IN_TARGET, { message: 'Scegli uno dei tre livelli' }).nullish(),
  qualita_conversazioni: z.enum(LIVELLI_QUALITA, { message: 'Scegli uno dei tre livelli' }).nullish(),
  cosa_frenava: testoCommento,
  domande_contenuti: testoCommento,
})

export type ReportGiornalieroInput = z.input<typeof reportGiornalieroSchema>
export type ReportGiornaliero = z.output<typeof reportGiornalieroSchema>

export type ValoriReport = Omit<ReportGiornalieroInput, 'data'>

export const REPORT_VUOTO: ValoriReport = {
  dm_outbound: 0,
  dm_inbound: 0,
  conversazioni: 0,
  call_proposte: 0,
  discovery_prenotate: 0,
  discovery_svolte: 0,
  call_qualificate: 0,
  strategy_prenotate: 0,
  follow_up: 0,
  contenuto_pubblicato: false,
  note: null,
  lead_in_target: null,
  qualita_conversazioni: null,
  cosa_frenava: null,
  domande_contenuti: null,
}

/** The admin corrects an existing report: same fields, the day stays the same. */
export const correzioneReportSchema = reportGiornalieroSchema
  .omit({ data: true })
  .extend({ id: z.string().uuid('Report non valido') })

export type CorrezioneReportInput = z.input<typeof correzioneReportSchema>

/** The admin records a whole day for someone: a setter, or the admin who does setting too. */
export const nuovoReportSchema = reportGiornalieroSchema.extend({
  setter_id: z.string().uuid('Scegli la persona'),
})

export type NuovoReportInput = z.input<typeof nuovoReportSchema>
