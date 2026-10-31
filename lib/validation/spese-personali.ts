import { z } from 'zod'

import { isDataISO, oggiRoma } from '@/lib/date'
import { parseImporto } from '@/lib/importi'

/**
 * Personal expenses (1.68.0, Dany 31/10/2026: «dividi una sezione in amministrazione per le
 * spese personali»): the admin's own expenses, kept apart from the business costs of
 * /expenses. The same schema validates the form and the server action; the categories are the
 * check of public.spese_personali (20261106090000_spese_personali.sql), the words are in
 * lib/i18n/testi/spese-personali.ts.
 */
export const CATEGORIE_SPESA_PERSONALE = [
  'casa',
  'spesa',
  'cibo_fuori',
  'trasporti',
  'salute',
  'cura_persona',
  'abbonamenti',
  'altro',
] as const
export type CategoriaSpesaPersonale = (typeof CATEGORIE_SPESA_PERSONALE)[number]

export function isCategoriaSpesaPersonale(valore: string): valore is CategoriaSpesaPersonale {
  return (CATEGORIE_SPESA_PERSONALE as readonly string[]).includes(valore)
}

export const ERRORI_SPESA_PERSONALE = {
  data: 'Data non valida',
  futuro: 'Una spesa non può essere nel futuro',
  categoria: 'Scegli la categoria',
  descrizione: 'Scrivi a cosa si riferisce',
  importo: 'Scrivi l’importo, ad esempio 45',
  positivo: 'L’importo deve essere positivo',
  troppo: 'Importo troppo alto: controlla gli zeri',
  nonValida: 'Spesa non valida.',
  nonTrovata: 'Spesa non trovata.',
  nonSalvata: 'Spesa non salvata. Riprova.',
  nonAggiornata: 'Spesa non aggiornata. Riprova.',
  nonEliminata: 'Spesa non eliminata. Riprova.',
  soloAdmin: 'Le spese personali le gestisce solo l’admin.',
} as const

export const spesaPersonaleSchema = z.object({
  data: z
    .string()
    .refine(isDataISO, ERRORI_SPESA_PERSONALE.data)
    .refine((d) => d <= oggiRoma(), ERRORI_SPESA_PERSONALE.futuro),
  categoria: z.enum(CATEGORIE_SPESA_PERSONALE, {
    errorMap: () => ({ message: ERRORI_SPESA_PERSONALE.categoria }),
  }),
  descrizione: z.string().trim().min(2, ERRORI_SPESA_PERSONALE.descrizione).max(160, 'Al massimo 160 caratteri'),
  importo: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? v : parseImporto(v)))
    .refine((v) => v !== null, ERRORI_SPESA_PERSONALE.importo)
    .refine((v) => v === null || v > 0, ERRORI_SPESA_PERSONALE.positivo)
    .refine((v) => v === null || v <= 100_000, ERRORI_SPESA_PERSONALE.troppo)
    .transform((v) => v as number),
  ricorrente: z.boolean().default(false),
})

/** Correcting a recorded expense: same rules, plus which row. */
export const modificaSpesaPersonaleSchema = spesaPersonaleSchema.extend({
  id: z.string().uuid(ERRORI_SPESA_PERSONALE.nonValida),
})

export const copiaSpesePersonaliSchema = z.object({ mese: z.string().refine(isDataISO) })

export type SpesaPersonaleInput = z.input<typeof spesaPersonaleSchema>
export type ModificaSpesaPersonaleInput = z.input<typeof modificaSpesaPersonaleSchema>
