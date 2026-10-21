import { z } from 'zod'

import { isDataISO, oggiRoma } from '@/lib/date'

/**
 * "Sospendi" (Dany, 21/10/2026): the admin puts a client on hold. The same
 * rules as public.clienti_sospensioni: a day not in the future and an optional
 * reason of at most 500 characters. Same shape as "Non rinnova" (chiusura.ts).
 */
export const MOTIVO_SOSPENSIONE_MAX = 500

export const sospensioneClienteSchema = z.object({
  client_id: z.string().uuid('Cliente non valido'),
  sospeso_il: z
    .string()
    .refine(isDataISO, 'Scegli il giorno')
    .refine((v) => !isDataISO(v) || v <= oggiRoma(), 'Il giorno non può essere nel futuro'),
  motivo: z
    .string()
    .nullish()
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length <= MOTIVO_SOSPENSIONE_MAX, `Al massimo ${MOTIVO_SOSPENSIONE_MAX} caratteri`)
    .transform((v) => (v.length > 0 ? v : null)),
})

export type SospensioneClienteInput = z.input<typeof sospensioneClienteSchema>
export type SospensioneCliente = z.output<typeof sospensioneClienteSchema>

/** The words when "Sospendi" has nothing to act on (checked by the action; the sheet does not offer it either). */
export const ERRORE_SOSPENDI_CHIUSO = 'Il cliente è chiuso: prima «Riapri», poi lo puoi sospendere.'
export const ERRORE_SOSPENDI_SENZA_PERCORSO = 'Il cliente non ha ancora un percorso: non c’è niente da sospendere.'

/** "Riattiva": only the client. */
export const riattivaClienteSchema = z.object({
  client_id: z.string().uuid('Cliente non valido'),
})
