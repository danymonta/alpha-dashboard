import { z } from 'zod'

import { isDataISO } from '@/lib/date'

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

/** Same order as the coach's Excel (SETTER columns I-Q): the setter's muscle memory. */
export const GRUPPI_REPORT: { titolo: string; campi: [CampoNumericoReport, string][] }[] = [
  {
    titolo: 'Messaggi',
    campi: [
      ['dm_outbound', 'DM outbound'],
      ['dm_inbound', 'DM inbound'],
      ['conversazioni', 'Conversazioni'],
    ],
  },
  {
    titolo: 'Call',
    campi: [
      ['call_proposte', 'Call proposte'],
      ['discovery_prenotate', 'Discovery prenotate'],
      ['discovery_svolte', 'Discovery svolte'],
      ['call_qualificate', 'Call qualificate'],
      ['strategy_prenotate', 'Strategy prenotate'],
    ],
  },
  {
    titolo: 'Follow-up',
    campi: [['follow_up', 'Follow-up del giorno']],
  },
]

/** Sanity ceiling against typos (3000 instead of 30), not a business rule. */
export const MASSIMO_GIORNALIERO = 9999

const conteggio = z
  .number({ invalid_type_error: 'Deve essere un numero' })
  .int('Solo numeri interi')
  .min(0, 'Non può essere negativo')
  .max(MASSIMO_GIORNALIERO, `Al massimo ${MASSIMO_GIORNALIERO}`)

/**
 * One schema for the client form and the server action.
 * setter_id is deliberately absent: the server takes it from the session.
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
}

/** The admin corrects an existing report: same fields, the day stays the same. */
export const correzioneReportSchema = reportGiornalieroSchema
  .omit({ data: true })
  .extend({ id: z.string().uuid('Report non valido') })

export type CorrezioneReportInput = z.input<typeof correzioneReportSchema>
