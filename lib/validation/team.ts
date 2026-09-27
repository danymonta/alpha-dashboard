import { z } from 'zod'

import { isDataISO } from '@/lib/date'
import { Constants } from '@/lib/supabase/database.types'
import { TIPI_VENDITA } from '@/lib/validation/vendita'

export const RUOLI = Constants.public.Enums.app_role
export const LIVELLI_PM = Constants.public.Enums.pm_livello

const ruolo = z.enum(RUOLI, { errorMap: () => ({ message: 'Scegli il ruolo' }) })

export const invitoSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Scrivi un indirizzo email valido')
    .max(160),
  ruolo,
})

export const cambioRuoloSchema = z.object({ profile_id: z.string().uuid(), ruolo })
export const attivoSchema = z.object({ profile_id: z.string().uuid(), attivo: z.boolean() })
export const cambioLivelloPmSchema = z.object({
  profile_id: z.string().uuid(),
  livello_pm: z.enum(LIVELLI_PM, { errorMap: () => ({ message: 'Scegli il livello' }) }),
})
export const revocaInvitoSchema = z.object({ email: z.string().email() })

/**
 * Percent in points, as people type it: "5", "5,5", "7%" -> 5, 5.5, 7.
 * It stays in points so the server can parse the client's output again without
 * changing it; the conversion to a fraction happens once, in the action.
 */
export const regolaSchema = z.object({
  profile_id: z.string().uuid('Scegli il collaboratore'),
  percentuale: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? v : Number(String(v).replace('%', '').trim().replace(',', '.'))))
    .refine((v) => Number.isFinite(v) && v > 0 && v <= 50, 'Scrivi una percentuale tra 0 e 50, ad esempio 5')
    .transform((v) => Math.round(v * 100) / 100),
  applica_a: z
    .array(z.enum(TIPI_VENDITA))
    .min(1, 'Scegli almeno un tipo di vendita'),
  valida_dal: z.string().refine(isDataISO, 'Scegli da quando vale'),
})

/**
 * Correcting a rule already recorded (same person). Changing it changes the
 * commissions it produced: the database refuses overlapping dates.
 */
export const modificaRegolaSchema = regolaSchema
  .omit({ profile_id: true })
  .extend({
    id: z.string().uuid('Regola non valida'),
    valida_al: z
      .union([z.string().refine(isDataISO, 'Data non valida'), z.literal('')])
      .nullish()
      .transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.valida_al && isDataISO(v.valida_dal) && v.valida_al < v.valida_dal) {
      ctx.addIssue({ code: 'custom', path: ['valida_al'], message: 'La fine viene dopo l’inizio' })
    }
  })

export const chiudiRegolaSchema = z.object({
  rule_id: z.string().uuid(),
  valida_al: z.string().refine(isDataISO, 'Data non valida'),
})

export type InvitoInput = z.input<typeof invitoSchema>
export type RegolaInput = z.input<typeof regolaSchema>
export type ModificaRegolaInput = z.input<typeof modificaRegolaSchema>
