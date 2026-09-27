import { z } from 'zod'

import { isDataISO, oggiRoma } from '@/lib/date'
import { parseImporto } from '@/lib/importi'
import { Constants } from '@/lib/supabase/database.types'
import { FONTI, normalizzaHandle } from '@/lib/validation/call'

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

const idFacoltativo = z
  .union([z.string().uuid(), z.literal('')])
  .nullish()
  .transform((v) => v || null)

// ---------------------------------------------------------------------------
// Cliente: contacts, source and owners. Status and value are derived.
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
  fonte: z.enum(FONTI).nullish().transform((v) => v ?? null),
  // who brought and who closed the client; a sale keeps its own setter and closer
  setter_id: idFacoltativo,
  closer_id: idFacoltativo,
  note: testoFacoltativo(1000),
})

// ---------------------------------------------------------------------------
// Prodotto
// ---------------------------------------------------------------------------
/** A product's usual plan: months after the sale date and amount of each instalment. */
export const pianoPredefinitoSchema = z
  .array(
    z.object({
      mese: z.coerce.number({ invalid_type_error: 'Mese non valido' }).int('Mesi interi').min(0, 'Da 0 in su').max(60, 'Al massimo 60'),
      importo: importo('Scrivi l’importo della rata').refine((v) => v > 0, 'L’importo deve essere positivo'),
    }),
  )
  .max(60, 'Al massimo 60 rate')

export type PianoPredefinito = { mese: number; importo: number }[]

/** The stored JSON, read safely: anything malformed means "no usual plan". */
export function leggiPianoPredefinito(json: unknown): PianoPredefinito | null {
  const esito = pianoPredefinitoSchema.safeParse(json)
  return esito.success && esito.data.length > 0 ? esito.data : null
}

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
  // none: equal monthly instalments in the new-sale form
  piano_predefinito: pianoPredefinitoSchema.nullish().transform((v) => (v && v.length > 0 ? v : null)),
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

/** Correcting a recorded cost: same rules, plus which row. */
export const modificaCostoSchema = costoSchema.extend({ id: z.string().uuid('Costo non valido') })

export type ClienteInput = z.input<typeof clienteSchema>
export type ModificaCostoInput = z.input<typeof modificaCostoSchema>
export type ProdottoInput = z.input<typeof prodottoSchema>
export type CostoInput = z.input<typeof costoSchema>
