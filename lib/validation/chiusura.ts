import { z } from 'zod'

import { isDataISO, oggiRoma } from '@/lib/date'

/**
 * "Non rinnova" (Dany, 04/10/2026): the admin closes a client who does not
 * renew. The same rules as public.clienti_chiusure: a day not in the future
 * (the database also refuses one before the client's latest path was signed)
 * and an optional reason of at most 500 characters.
 */
export const MOTIVO_CHIUSURA_MAX = 500

export const chiusuraClienteSchema = z.object({
  client_id: z.string().uuid('Cliente non valido'),
  chiuso_il: z
    .string()
    .refine(isDataISO, 'Scegli il giorno')
    .refine((v) => !isDataISO(v) || v <= oggiRoma(), 'Il giorno non può essere nel futuro'),
  motivo: z
    .string()
    .nullish()
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length <= MOTIVO_CHIUSURA_MAX, `Al massimo ${MOTIVO_CHIUSURA_MAX} caratteri`)
    .transform((v) => (v.length > 0 ? v : null)),
})

export type ChiusuraClienteInput = z.input<typeof chiusuraClienteSchema>
export type ChiusuraCliente = z.output<typeof chiusuraClienteSchema>
