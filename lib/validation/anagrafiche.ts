import { z } from 'zod'

import { isDataISO, oggiRoma } from '@/lib/date'
import { parseImporto } from '@/lib/importi'
import { Constants } from '@/lib/supabase/database.types'
import { normalizzaHandle } from '@/lib/validation/call'

const testoFacoltativo = (max: number) =>
  z
    .string()
    .max(max, `Al massimo ${max} caratteri`)
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null))

const importo = (messaggio: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? v : parseImporto(v)))
    .refine((v) => v !== null && v >= 0, messaggio)
    .refine((v) => v === null || v <= 100_000, 'Importo troppo alto: controlla gli zeri')
    .transform((v) => v as number)

// ---------------------------------------------------------------------------
// Cliente (contacts only: status and value are derived)
// ---------------------------------------------------------------------------
export const clienteSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(1, 'Scrivi il nome').max(80),
  cognome: testoFacoltativo(80),
  email: testoFacoltativo(160).refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    'Email non valida',
  ),
  telefono: testoFacoltativo(30).refine(
    (v) => v === null || /^[+\d\s().-]{6,}$/.test(v),
    'Telefono non valido',
  ),
  instagram_handle: z
    .string()
    .max(40)
    .nullish()
    .transform((h) => normalizzaHandle(h ?? ''))
    .refine((h) => h === null || /^@[a-z0-9._]{1,30}$/.test(h), 'Handle non valido'),
  note: testoFacoltativo(1000),
})

// ---------------------------------------------------------------------------
// Prodotto
// ---------------------------------------------------------------------------
export const prodottoSchema = z.object({
  id: z.string().uuid().nullish(),
  nome: z.string().trim().min(2, 'Scrivi il nome del prodotto').max(80),
  durata_mesi: z.coerce
    .number({ invalid_type_error: 'Durata in mesi' })
    .int('Solo mesi interi')
    .min(1, 'Almeno un mese')
    .max(36, 'Al massimo 36 mesi'),
  prezzo_listino: importo('Scrivi il prezzo, ad esempio 1.500'),
  attivo: z.boolean().default(true),
})

// ---------------------------------------------------------------------------
// Costo
// ---------------------------------------------------------------------------
export const CATEGORIE_COSTO = Constants.public.Enums.expense_category
export type CategoriaCosto = (typeof CATEGORIE_COSTO)[number]

export const ETICHETTA_CATEGORIA: Record<CategoriaCosto, string> = {
  team: 'Team',
  software: 'Software',
  ads: 'Ads',
  formazione: 'Formazione',
  altro: 'Altro',
}

export const costoSchema = z.object({
  data: z
    .string()
    .refine(isDataISO, 'Data non valida')
    .refine((d) => d <= oggiRoma(), 'Un costo non può essere nel futuro'),
  categoria: z.enum(CATEGORIE_COSTO, {
    errorMap: () => ({ message: 'Scegli la categoria' }),
  }),
  descrizione: z.string().trim().min(2, 'Scrivi a cosa si riferisce').max(160),
  importo: importo('Scrivi l’importo, ad esempio 89').refine((v) => v > 0, 'L’importo deve essere positivo'),
  ricorrente: z.boolean().default(false),
})

export type ClienteInput = z.input<typeof clienteSchema>
export type ProdottoInput = z.input<typeof prodottoSchema>
export type CostoInput = z.input<typeof costoSchema>
