import { z } from 'zod'

import { aggiungiGiorni, isDataISO, oggiRoma } from '@/lib/date'
import { parseImporto } from '@/lib/importi'
import { Constants } from '@/lib/supabase/database.types'
import { normalizzaHandle } from '@/lib/validation/call'

export const TIPI_VENDITA = Constants.public.Enums.sale_type
export type TipoVendita = (typeof TIPI_VENDITA)[number]

export const ETICHETTA_TIPO_VENDITA: Record<TipoVendita, string> = {
  nuovo: 'Nuovo',
  rinnovo: 'Rinnovo',
  upsell: 'Upsell',
}

export const OPZIONI_RATE = [1, 2, 3, 4, 6, 12] as const
export const MASSIMO_RATE = 24
/** Typo guard, not a price rule. */
export const MASSIMO_CONTRATTO = 100_000

const vuotoANull = (v: string | null | undefined) => {
  const t = v?.trim() ?? ''
  return t === '' ? null : t
}

export const nuovaVenditaSchema = z
  .object({
    call_id: z.string().uuid().nullish(),
    client_id: z.string().uuid().nullish(),
    // new client only (ignored when client_id is set)
    nome: z.string().max(80, 'Al massimo 80 caratteri').nullish().transform(vuotoANull),
    cognome: z.string().max(80, 'Al massimo 80 caratteri').nullish().transform(vuotoANull),
    email: z
      .string()
      .trim()
      .max(160)
      .nullish()
      .transform(vuotoANull)
      .refine((v) => v === null || z.string().email().safeParse(v).success, 'Email non valida'),
    telefono: z
      .string()
      .max(30, 'Numero troppo lungo')
      .nullish()
      .transform(vuotoANull)
      .refine((v) => v === null || /^[+\d\s().-]{6,}$/.test(v), 'Telefono non valido'),
    instagram_handle: z
      .string()
      .max(40)
      .nullish()
      .transform((h) => normalizzaHandle(h ?? ''))
      .refine((h) => h === null || /^@[a-z0-9._]{1,30}$/.test(h), 'Handle non valido'),
    tipo: z.enum(TIPI_VENDITA, { errorMap: () => ({ message: 'Scegli il tipo di vendita' }) }),
    // an unselected radio group reaches Zod as null, not undefined
    product_id: z
      .string({ required_error: 'Scegli il prodotto', invalid_type_error: 'Scegli il prodotto' })
      .uuid('Scegli il prodotto'),
    // typed the Italian way ("1.500,00"), numeric from here on
    valore_contratto: z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === 'number' ? v : parseImporto(v)))
      .refine((v) => v !== null && v > 0, 'Scrivi il valore del contratto, ad esempio 1.500')
      .refine((v) => v === null || v <= MASSIMO_CONTRATTO, 'Importo troppo alto: controlla gli zeri')
      .transform((v) => v as number),
    numero_rate: z.coerce
      .number({ invalid_type_error: 'Scegli il numero di rate' })
      .int()
      .min(1, 'Almeno una rata')
      .max(MASSIMO_RATE, `Al massimo ${MASSIMO_RATE} rate`),
    data_vendita: z.string().refine(isDataISO, 'Data non valida'),
    data_inizio: z.string().refine(isDataISO, 'Data non valida'),
    note: z.string().max(1000, 'Al massimo 1000 caratteri').nullish().transform(vuotoANull),
  })
  .superRefine((v, ctx) => {
    if (!v.client_id) {
      if (!v.nome) {
        ctx.addIssue({ code: 'custom', path: ['nome'], message: 'Scrivi il nome del cliente' })
      }
      if (v.tipo !== 'nuovo') {
        ctx.addIssue({
          code: 'custom',
          path: ['tipo'],
          message: 'Rinnovo e upsell richiedono un cliente esistente',
        })
      }
    }

    if (isDataISO(v.data_vendita) && v.data_vendita > oggiRoma()) {
      ctx.addIssue({
        code: 'custom',
        path: ['data_vendita'],
        message: 'La data della vendita non può essere nel futuro',
      })
    }

    if (isDataISO(v.data_vendita) && isDataISO(v.data_inizio)) {
      if (
        v.data_inizio < aggiungiGiorni(v.data_vendita, -31) ||
        v.data_inizio > aggiungiGiorni(v.data_vendita, 92)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['data_inizio'],
          message: 'L’inizio deve cadere entro tre mesi dalla vendita',
        })
      }
    }
  })

export type NuovaVenditaInput = z.input<typeof nuovaVenditaSchema>
export type NuovaVendita = z.output<typeof nuovaVenditaSchema>

/** Only what the preview needs; same bounds as the full schema. */
export const anteprimaPianoSchema = z.object({
  valore: z.number().positive().max(MASSIMO_CONTRATTO),
  numero_rate: z.number().int().min(1).max(MASSIMO_RATE),
  data_vendita: z.string().refine(isDataISO),
})
