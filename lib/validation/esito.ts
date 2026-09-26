import { z } from 'zod'

import type { Database } from '@/lib/supabase/database.types'

type AggiornamentoCall = Pick<
  Database['public']['Tables']['calls']['Update'],
  'stato' | 'esito' | 'qualificata' | 'obiezione_principale'
>

const callId = z.string().uuid('Call non valida')

/**
 * What the closer can tap. "programmata" undoes a wrong outcome.
 * follow_up and persa need to know whether the lead was qualified.
 */
export const esitoCallSchema = z.discriminatedUnion('esito', [
  z.object({ call_id: callId, esito: z.literal('chiusa') }),
  z.object({
    call_id: callId,
    esito: z.enum(['follow_up', 'persa']),
    qualificata: z.boolean({ required_error: 'Indica se era qualificata' }),
    obiezione: z
      .string()
      .trim()
      .max(200, 'Al massimo 200 caratteri')
      .nullish()
      .transform((v) => (v ? v : null)),
  }),
  z.object({
    call_id: callId,
    esito: z.enum(['no_show', 'cancellata', 'riprogrammata', 'programmata']),
  }),
])

export type EsitoCallInput = z.input<typeof esitoCallSchema>
export type EsitoCall = z.output<typeof esitoCallSchema>
export type SceltaEsito = EsitoCall['esito']

export const ETICHETTA_ESITO: Record<SceltaEsito, string> = {
  chiusa: 'Chiusa',
  follow_up: 'Follow-up',
  persa: 'Persa',
  no_show: 'No show',
  cancellata: 'Cancellata',
  riprogrammata: 'Riprogrammata',
  programmata: 'Da fare',
}

/**
 * Translates a tap into the columns of `calls`, respecting the table checks
 * (qualificata and esito only when svolta). A closed call is always qualified:
 * otherwise "close rate su qualificate" could exceed 100%.
 */
export function aggiornamentoDaEsito(v: EsitoCall): AggiornamentoCall {
  switch (v.esito) {
    case 'chiusa':
      return { stato: 'svolta', esito: 'chiusa', qualificata: true, obiezione_principale: null }
    case 'follow_up':
    case 'persa':
      return {
        stato: 'svolta',
        esito: v.esito,
        qualificata: v.qualificata,
        obiezione_principale: v.obiezione,
      }
    default:
      return { stato: v.esito, esito: null, qualificata: null, obiezione_principale: null }
  }
}
