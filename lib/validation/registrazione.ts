import { z } from 'zod'

import { LINK_INCOMPLETO, normalizzaLink } from '@/lib/fathom/link'
import { REGISTRAZIONE } from '@/lib/call/registrazione'

/**
 * The recording of a held call (Dany, 16/10/2026, CLAUDE.md section 31): the link of
 * its Fathom recording is required for the outcomes of a held call (closed,
 * follow-up, lost), with one way out, «Call non registrata». The same schema binds
 * the outcome sheet, the server action and Alfire.
 */

/** The day the link became required, on the day of the call (Europe/Rome): calls before are not asked. */
export const REGISTRAZIONE_OBBLIGATORIA_DAL = '2026-10-16'

/** The pasted link, cleaned: https, no query, the form every other copy of it shares. */
export const linkRegistrazione = z
  .string({ required_error: LINK_INCOMPLETO, invalid_type_error: LINK_INCOMPLETO })
  .trim()
  .min(1, LINK_INCOMPLETO)
  .max(500, REGISTRAZIONE.linkTroppoLungo)
  .transform((v, ctx) => {
    const n = normalizzaLink(v)
    if (!n.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: n.errore })
      return z.NEVER
    }
    return n.canonico
  })

export const sceltaRegistrazioneSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('link'), url: linkRegistrazione }),
  z.object({ tipo: z.literal('non_registrata') }),
])

export type SceltaRegistrazione = z.output<typeof sceltaRegistrazioneSchema>
export type SceltaRegistrazioneInput = z.input<typeof sceltaRegistrazioneSchema>

/** The outcomes of a held call, the ones that ask for the recording. */
export const ESITI_CHE_CHIEDONO_LA_REGISTRAZIONE = ['chiusa', 'follow_up', 'persa'] as const

export function chiedeRegistrazione(esito: string | null | undefined): boolean {
  return esito === 'chiusa' || esito === 'follow_up' || esito === 'persa'
}

/**
 * Null when nothing is missing. `giorno` is the day of the call (Europe/Rome,
 * YYYY-MM-DD); `haRegistrazione` is true when the call already has a link or a
 * «not recorded»: «Cambia esito» does not ask again, nor does a call from before
 * the day the link became required.
 */
export function registrazioneMancante(
  esito: string | null | undefined,
  scelta: unknown,
  call: { giorno: string; haRegistrazione: boolean },
): string | null {
  if (!chiedeRegistrazione(esito)) return null
  if (call.haRegistrazione || call.giorno < REGISTRAZIONE_OBBLIGATORIA_DAL) return null
  return sceltaRegistrazioneSchema.safeParse(scelta).success ? null : REGISTRAZIONE.manca
}
