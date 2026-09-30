import { z } from 'zod'

import { aggiungiGiorni, isDataISO, oggiRoma } from '@/lib/date'
import { parseImporto } from '@/lib/importi'
import { MASSIMO_NOTE_CLOSER, MASSIMO_NOTE_SETTER, NOTE_CLOSER, NOTE_SETTER } from '@/lib/setting/commento'
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
/**
 * The admin also adds calls that happened but never reached the app (Dany,
 * 29/09/2026): a year back is still a typo guard, not a rule.
 */
export const GIORNI_INDIETRO_CALL_ADMIN = 366

const campiNuovaCall = z.object({
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
  /**
   * Admin only: who set the call, himself or an active setter. The setter never
   * sends it, and public.fissa_call ignores it for him anyway.
   */
  setter_id: z
    .string()
    .uuid('Scegli il setter')
    .nullish()
    .transform((v) => v ?? null),
})

function conFinestra(giorniIndietro: number, messaggio: string) {
  return campiNuovaCall.superRefine((valori, ctx) => {
    if (!isDataISO(valori.data)) return
    const oggi = oggiRoma()
    if (valori.data < aggiungiGiorni(oggi, -giorniIndietro) || valori.data > aggiungiGiorni(oggi, GIORNI_AVANTI_CALL)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['data'], message: messaggio })
    }
  })
}

/** The setter's booking: from a week ago (a call recorded late) to six months ahead. */
export const nuovaCallSchema = conFinestra(GIORNI_INDIETRO_CALL, 'La data deve stare tra 7 giorni fa e 6 mesi da oggi')

/** The admin's booking: same fields, plus the setter, and up to a year back. */
export const nuovaCallAdminSchema = conFinestra(
  GIORNI_INDIETRO_CALL_ADMIN,
  'La data deve stare tra un anno fa e 6 mesi da oggi',
)

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

/**
 * The closer's record of the call (public.dettagli_call): all optional, an
 * empty field clears it. His notes ("Note aggiuntive", calls.note_closer) are
 * here: the setter never sends this part, and the database refuses them from him.
 */
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
  note_closer: z.string().max(MASSIMO_NOTE_CLOSER, NOTE_CLOSER.troppoLungo).nullish().transform(vuotoANull),
})

export const modificaCallSchema = z
  .object({
    call_id: z.string().uuid('Call non valida'),
    tipo: z.enum(TIPI_CALL, { errorMap: () => ({ message: 'Scegli il tipo di call' }) }),
    data: z.string().refine(isDataISO, 'Scegli la data'),
    ora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Scegli l’ora'),
    closer_id: z.string().uuid('Scegli il closer'),
    /** "Note del setter" (calls.note): the setter's and the admin's; the closer's sheet never sends them. */
    note: z.string().max(MASSIMO_NOTE_SETTER, NOTE_SETTER.troppoLungo).nullish().transform(vuotoANull),
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
