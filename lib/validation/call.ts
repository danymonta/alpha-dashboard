import { z } from 'zod'

import { aggiungiGiorni, isDataISO, oggiRoma } from '@/lib/date'
import { parseImporto } from '@/lib/importi'
import { Constants } from '@/lib/supabase/database.types'

export const FONTI = Constants.public.Enums.lead_source
export const TIPI_CALL = Constants.public.Enums.call_type

export type Fonte = (typeof FONTI)[number]
export type TipoCall = (typeof TIPI_CALL)[number]

export const ETICHETTA_FONTE: Record<Fonte, string> = {
  dm_inbound: 'DM inbound',
  dm_outbound: 'DM outbound',
  referral: 'Referral',
  organico: 'Organico',
  ads: 'Ads',
  altro: 'Altro',
}

export const ETICHETTA_TIPO_CALL: Record<TipoCall, string> = {
  discovery: 'Discovery',
  strategy: 'Strategy',
}

/** "@Marco.Bianchi " -> "@marco.bianchi"; empty -> null. Same rule as fissa_call. */
export function normalizzaHandle(valore: string): string | null {
  const pulito = valore.trim().replace(/\s+/g, '').replace(/^@+/, '').toLowerCase()
  return pulito === '' ? null : `@${pulito}`
}

/** Typo guard for the booking date, not a business rule. */
export const GIORNI_INDIETRO_CALL = 7
export const GIORNI_AVANTI_CALL = 180

export const nuovaCallSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(2, 'Scrivi il nome del lead')
      .max(120, 'Al massimo 120 caratteri'),
    // nullish in input: the normalized value (null when empty) validates again
    // on the server unchanged, so client and server run the very same schema
    instagram_handle: z
      .string()
      .max(40, 'Handle troppo lungo')
      .nullish()
      .transform((h) => normalizzaHandle(h ?? ''))
      .refine(
        (h) => h === null || /^@[a-z0-9._]{1,30}$/.test(h),
        'Handle non valido: solo lettere, numeri, punto e trattino basso',
      ),
    fonte: z.enum(FONTI, { errorMap: () => ({ message: 'Scegli la fonte' }) }),
    tipo: z.enum(TIPI_CALL, { errorMap: () => ({ message: 'Scegli il tipo di call' }) }),
    data: z.string().refine(isDataISO, 'Scegli la data'),
    ora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Scegli l’ora'),
    closer_id: z.string().uuid('Scegli il closer'),
  })
  .superRefine((valori, ctx) => {
    if (!isDataISO(valori.data)) return
    const oggi = oggiRoma()
    if (
      valori.data < aggiungiGiorni(oggi, -GIORNI_INDIETRO_CALL) ||
      valori.data > aggiungiGiorni(oggi, GIORNI_AVANTI_CALL)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data'],
        message: 'La data deve stare tra 7 giorni fa e 6 mesi da oggi',
      })
    }
  })

export type NuovaCallInput = z.input<typeof nuovaCallSchema>
export type NuovaCall = z.output<typeof nuovaCallSchema>

// ---------------------------------------------------------------------------
// Editing a call after it was booked
// ---------------------------------------------------------------------------
export const PERFORMANCE = Constants.public.Enums.call_performance
export type Performance = (typeof PERFORMANCE)[number]

export const ETICHETTA_PERFORMANCE: Record<Performance, string> = {
  ottima: 'Ottima',
  buona: 'Buona',
  discreta: 'Discreta',
  media: 'Media',
  scarsa: 'Scarsa',
}

const vuotoANull = (v: string | null | undefined) => (v?.trim() ? v.trim() : null)

/** The closer's record of the call: all optional, an empty field clears it. */
export const dettagliCallSchema = z.object({
  link_registrazione: z
    .string()
    .max(500, 'Link troppo lungo')
    .nullish()
    .transform(vuotoANull)
    .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), 'Incolla il link completo, con https://'),
  performance: z.enum(PERFORMANCE).nullish().transform((v) => v ?? null),
  prodotto_proposto_id: z
    .union([z.string().uuid(), z.literal('')])
    .nullish()
    .transform((v) => v || null),
  importo_proposto: z
    .union([z.string(), z.number()])
    .nullish()
    // unreadable text becomes NaN, so it fails instead of silently clearing the amount
    .transform((v) => (typeof v === 'number' ? v : v?.trim() ? (parseImporto(v) ?? Number.NaN) : null))
    .refine((v) => v === null || (!Number.isNaN(v) && v >= 0), 'Scrivi l’importo, ad esempio 1.500')
    .refine((v) => v === null || v <= 100_000, 'Importo troppo alto: controlla gli zeri'),
})

export const modificaCallSchema = z
  .object({
    call_id: z.string().uuid('Call non valida'),
    tipo: z.enum(TIPI_CALL, { errorMap: () => ({ message: 'Scegli il tipo di call' }) }),
    data: z.string().refine(isDataISO, 'Scegli la data'),
    ora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Scegli l’ora'),
    closer_id: z.string().uuid('Scegli il closer'),
    note: z.string().max(1000, 'Al massimo 1000 caratteri').nullish().transform(vuotoANull),
    /** Only for the closer and the admin: the setter never sends it. */
    dettagli: dettagliCallSchema.nullish(),
  })
  .superRefine((valori, ctx) => {
    // a correction may go back in time; far in the future is a typo
    if (isDataISO(valori.data) && valori.data > aggiungiGiorni(oggiRoma(), GIORNI_AVANTI_CALL)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['data'], message: 'Al massimo 6 mesi da oggi' })
    }
  })

export type ModificaCallInput = z.input<typeof modificaCallSchema>
