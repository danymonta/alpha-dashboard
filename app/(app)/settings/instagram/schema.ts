import { z } from 'zod'

import { cancellaMessaggiSchema } from '@/lib/validation/insight'

/**
 * Impostazioni › Instagram e Messenger (Dany, 08/10/2026; Messenger and the
 * Insight from 1.35.0): the forms of the admin, the same schemas on the client
 * and in the server actions. The username rule is the check of
 * public.instagram_esclusi (lowercase, without @, as Instagram writes it).
 * The Messenger forms use lib/validation/insight.ts.
 */
const USERNAME = /^[a-z0-9._]{1,30}$/
export const MOTIVO_ESCLUSIONE_MAX = 120

/** "@Mario.Rossi " -> "mario.rossi": what Instagram shows, as the database keeps it. */
export function normalizzaUsernameEscluso(valore: string): string {
  return valore.trim().replace(/^@/, '').toLowerCase()
}

export const esclusioneSchema = z.object({
  username: z
    .string()
    .transform(normalizzaUsernameEscluso)
    .refine((v) => v.length > 0, 'Scrivi lo username, senza @')
    .refine(
      (v) => v.length === 0 || USERNAME.test(v),
      'Uno username di Instagram: lettere, numeri, punto e trattino basso, al massimo 30 caratteri',
    ),
  motivo: z
    .string()
    .trim()
    .max(MOTIVO_ESCLUSIONE_MAX, `Il motivo: al massimo ${MOTIVO_ESCLUSIONE_MAX} caratteri`)
    .nullish()
    .transform((v) => (v ? v : null)),
  // «Cancella anche i suoi messaggi già salvati nell’Insight», checked by default (1.35.0, D16)
  ...cancellaMessaggiSchema.shape,
})

export type EsclusioneInput = z.input<typeof esclusioneSchema>
export type Esclusione = z.output<typeof esclusioneSchema>

/** Who works the DMs: a setter, or nobody (the nightly proposal stops). */
export const setterInstagramSchema = z.object({
  setter_id: z.string().uuid('Scegli una persona dell’elenco').nullable(),
})
