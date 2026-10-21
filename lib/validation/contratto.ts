import { z } from 'zod'

/**
 * The link to the signed contract of a sale on Google Drive (Dany, 21/10/2026).
 * The same rule as the check of public.vendite_contratti: https, drive.google.com
 * or docs.google.com, no spaces, at most 500 characters. Pasted without
 * "https://", it gets it. One contract per sale: every path and every renewal
 * has its own. Admin only: the contract is never where the closer, the setter
 * or a coach read.
 */
export const URL_CONTRATTO_MAX = 500
const URL_CONTRATTO = /^https:\/\/(drive|docs)\.google\.com\/\S+$/

export const ERRORE_URL_CONTRATTO = 'Incolla il link del contratto su Google Drive (https://drive.google.com/…)'

export function normalizzaUrlContratto(valore: string): string {
  const url = valore.trim()
  return /^(drive|docs)\.google\.com\//.test(url) ? `https://${url}` : url
}

export function urlContrattoValido(valore: string): boolean {
  return valore.length <= URL_CONTRATTO_MAX && URL_CONTRATTO.test(valore)
}

/** The sale whose contract it is: all the actions take. */
export const contrattoVenditaSchema = z.object({
  sale_id: z.string().uuid('Vendita non valida'),
})

export const salvaContrattoSchema = contrattoVenditaSchema.extend({
  url: z
    .string()
    .transform(normalizzaUrlContratto)
    .refine((v) => v.length > 0, 'Incolla il link del contratto')
    .refine((v) => v.length <= URL_CONTRATTO_MAX, `Al massimo ${URL_CONTRATTO_MAX} caratteri`)
    .refine((v) => v.length > URL_CONTRATTO_MAX || v.length === 0 || URL_CONTRATTO.test(v), ERRORE_URL_CONTRATTO),
})

export type SalvaContrattoInput = z.input<typeof salvaContrattoSchema>

/** A write RLS refused: the words, never Postgres's. */
export const CONTRATTO_NON_TUO = 'Il link del contratto lo cambia solo l’admin.'
/** A delete that touched nothing: gone already. */
export const CONTRATTO_NON_TOLTO = 'Il link non c’è più: ricarica la pagina.'
