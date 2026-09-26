import { z } from 'zod'

import { isDataISO, oggiRoma } from '@/lib/date'
import { parseImporto } from '@/lib/importi'
import { METODI } from '@/lib/validation/incasso'

export const pagamentoProvvigioneSchema = z.object({
  profile_id: z.string().uuid('Collaboratore non valido'),
  periodo: z
    .string()
    .refine((v) => isDataISO(v) && v.endsWith('-01'), 'Scegli il mese a cui si riferisce'),
  importo: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? v : parseImporto(v)))
    .refine((v) => v !== null && v > 0, 'Scrivi l’importo pagato')
    .transform((v) => v as number),
  pagato_il: z
    .string()
    .refine(isDataISO, 'Data non valida')
    .refine((d) => d <= oggiRoma(), 'Un pagamento non può essere nel futuro'),
  metodo: z.enum(METODI).nullish(),
  note: z
    .string()
    .max(300)
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null)),
})

export type PagamentoProvvigioneInput = z.input<typeof pagamentoProvvigioneSchema>

/** Correcting a payout already recorded: the collaborator stays the same. */
export const modificaPagamentoProvvigioneSchema = pagamentoProvvigioneSchema
  .omit({ profile_id: true })
  .extend({ id: z.string().uuid('Pagamento non valido') })

export type ModificaPagamentoProvvigioneInput = z.input<typeof modificaPagamentoProvvigioneSchema>
