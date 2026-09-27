import { z } from 'zod'

import { parseImporto } from '@/lib/importi'

/** Targets of a month: either may be left empty (no target on that number). */
export const obiettiviSchema = z.object({
  mese: z.string().regex(/^\d{4}-\d{2}-01$/, 'Mese non valido'),
  cash: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (typeof v === 'number' ? v : v ? parseImporto(v) : null))
    .refine((v) => v === null || v > 0, 'Scrivi l’obiettivo di cash, ad esempio 10.000')
    .refine((v) => v === null || v <= 1_000_000, 'Importo troppo alto: controlla gli zeri'),
  nuovi_clienti: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v <= 1000), 'Un numero intero, ad esempio 5'),
})

export type ObiettiviInput = z.input<typeof obiettiviSchema>
