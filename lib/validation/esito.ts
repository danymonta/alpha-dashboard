import { z } from 'zod'

import {
  MASSIMO_MOTIVO,
  MASSIMO_NOTE_CLOSER,
  MOTIVO_NON_CHIUSURA,
  NOTE_CLOSER,
} from '@/lib/setting/commento'
import type { Database } from '@/lib/supabase/database.types'
import { SPOSTA } from '@/lib/call/spostamento'
import { campiSpostamento } from '@/lib/validation/call'

type AggiornamentoCall = Pick<
  Database['public']['Tables']['calls']['Update'],
  'stato' | 'esito' | 'qualificata' | 'obiezione_principale' | 'note_closer'
>

const callId = z.string().uuid('Call non valida')

/**
 * "Motivo di non chiusura" (calls.obiezione_principale), Dany 30/09/2026: "il
 * closer deve inserire motivo di non chiusura sempre". Required for a held
 * call that did not close; the same schema binds the outcome sheet, the
 * server action and Alfire. Calls recorded before stay as they are: the
 * database has no constraint on it.
 */
const motivoNonChiusura = z
  .string({ required_error: MOTIVO_NON_CHIUSURA.manca, invalid_type_error: MOTIVO_NON_CHIUSURA.manca })
  .trim()
  .min(1, MOTIVO_NON_CHIUSURA.manca)
  .max(MASSIMO_MOTIVO, MOTIVO_NON_CHIUSURA.troppoLungo)

/**
 * "Note aggiuntive" of the closer (calls.note_closer, Dany 30/09/2026), optional:
 * left out, the saved ones stay; blank clears them. The setter's note
 * (calls.note) is never touched by an outcome.
 */
const noteCloser = z
  .string()
  .max(MASSIMO_NOTE_CLOSER, NOTE_CLOSER.troppoLungo)
  .nullish()
  .transform((v) => (v === undefined ? undefined : v && v.trim() !== '' ? v.trim() : null))

/**
 * What the closer can tap. "programmata" undoes a wrong outcome.
 * follow_up and persa need to know whether the lead was qualified, and why
 * the call did not close. "riprogrammata" is two choices (Dany, 04/10/2026):
 * with a new day and time the call moves there, still to be held
 * (public.sposta_call, the window per role checked with schemaSpostamento);
 * without them it is "In attesa di conferma": it stays on its day with stato
 * riprogrammata until the lead confirms a date, then «Sposta». Day and time go
 * together: one without the other is refused.
 */
const scelte = z.discriminatedUnion('esito', [
  z.object({ call_id: callId, esito: z.literal('chiusa') }),
  z.object({
    call_id: callId,
    esito: z.enum(['follow_up', 'persa']),
    qualificata: z.boolean({ required_error: 'Indica se era qualificata' }),
    motivo: motivoNonChiusura,
    note_closer: noteCloser,
  }),
  z.object({
    call_id: callId,
    esito: z.literal('riprogrammata'),
    data: campiSpostamento.data.optional(),
    ora: campiSpostamento.ora.optional(),
    note_closer: noteCloser,
  }),
  z.object({
    call_id: callId,
    esito: z.enum(['no_show', 'cancellata', 'programmata']),
  }),
])

export const esitoCallSchema = scelte.superRefine((v, ctx) => {
  if (v.esito !== 'riprogrammata' || (v.data === undefined) === (v.ora === undefined)) return
  // a day without the time (or the reverse): the same words as the move
  const campo = v.data === undefined ? 'data' : 'ora'
  const messaggio = campiSpostamento[campo].safeParse(undefined).error?.issues[0]?.message ?? 'Scegli il nuovo giorno e l’ora'
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message: messaggio })
})

export type EsitoCallInput = z.input<typeof esitoCallSchema>
export type EsitoCall = z.output<typeof esitoCallSchema>
export type SceltaEsito = EsitoCall['esito']
/** An outcome written on the call where it is: every one but "riprogrammata" with a new day. */
export type EsitoSulPosto = EsitoCall

/** The new day and time of a "riprogrammata" that moves the call; null for every other outcome. */
export function nuovaDataEsito(v: EsitoCall): { data: string; ora: string } | null {
  return v.esito === 'riprogrammata' && v.data !== undefined && v.ora !== undefined ? { data: v.data, ora: v.ora } : null
}

/** The outcomes that ask for the reason: a held call that did not close. */
export const ESITI_NON_CHIUSI = ['follow_up', 'persa'] as const

export function chiedeMotivo(esito: string | null | undefined): esito is (typeof ESITI_NON_CHIUSI)[number] {
  return esito === 'follow_up' || esito === 'persa'
}

export const ETICHETTA_ESITO: Record<SceltaEsito, string> = {
  chiusa: 'Chiusa',
  follow_up: 'Follow-up',
  persa: 'Persa',
  no_show: 'No show',
  cancellata: 'Cancellata',
  riprogrammata: SPOSTA.attesa.etichetta,
  programmata: 'Da fare',
}

/**
 * Translates a tap into the columns of `calls`, respecting the table checks
 * (qualificata and esito only when svolta). A closed call is always qualified:
 * otherwise "close rate su qualificate" could exceed 100%. The reason for not
 * closing only belongs to a held call that did not close; the closer's notes
 * are touched only when the sheet sends them.
 */
export function aggiornamentoDaEsito(v: EsitoSulPosto): AggiornamentoCall {
  switch (v.esito) {
    case 'chiusa':
      return { stato: 'svolta', esito: 'chiusa', qualificata: true, obiezione_principale: null }
    case 'follow_up':
    case 'persa':
      return {
        stato: 'svolta',
        esito: v.esito,
        qualificata: v.qualificata,
        obiezione_principale: v.motivo,
        ...(v.note_closer !== undefined ? { note_closer: v.note_closer } : {}),
      }
    case 'riprogrammata':
      // "In attesa di conferma": the call stays on its day, without an outcome
      return {
        stato: 'riprogrammata',
        esito: null,
        qualificata: null,
        obiezione_principale: null,
        ...(v.note_closer !== undefined ? { note_closer: v.note_closer } : {}),
      }
    default:
      return { stato: v.esito, esito: null, qualificata: null, obiezione_principale: null }
  }
}
