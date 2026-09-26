import { z } from 'zod'

import { isDataISO, oggiRoma } from '@/lib/date'
import { parseImporto } from '@/lib/importi'
import { Constants } from '@/lib/supabase/database.types'

export const METODI = Constants.public.Enums.payment_method
export type Metodo = (typeof METODI)[number]

export const ETICHETTA_METODO: Record<Metodo, string> = {
  bonifico: 'Bonifico',
  stripe: 'Stripe',
  paypal: 'PayPal',
  carta: 'Carta',
  contanti: 'Contanti',
  altro: 'Altro',
}

const idRata = z.string().uuid('Rata non valida')

const dataPassata = (messaggio: string) =>
  z
    .string()
    .refine(isDataISO, 'Data non valida')
    .refine((d) => d <= oggiRoma(), messaggio)

const importoPositivo = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : parseImporto(v)))
  .refine((v) => v !== null && v > 0, 'Scrivi un importo, ad esempio 800 o 800,50')
  .transform((v) => v as number)

/** One tap sends only payment_id: today and the planned amount are the defaults. */
export const segnaIncassataSchema = z.object({
  payment_id: idRata,
  incassato_il: dataPassata('Un incasso non può essere nel futuro').nullish(),
  importo: importoPositivo.nullish(),
  metodo: z.enum(METODI).nullish(),
})

export const modificaRataSchema = z.object({
  payment_id: idRata,
  scadenza: z.string().refine(isDataISO, 'Data non valida'),
  importo_previsto: importoPositivo,
})

export const rimborsoSchema = z.object({
  payment_id: idRata,
  data: dataPassata('Un rimborso non può essere nel futuro'),
  importo: importoPositivo,
  note: z
    .string()
    .max(300, 'Al massimo 300 caratteri')
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null)),
})

export const soloRataSchema = z.object({ payment_id: idRata })

export type SegnaIncassataInput = z.input<typeof segnaIncassataSchema>
export type ModificaRataInput = z.input<typeof modificaRataSchema>
export type RimborsoInput = z.input<typeof rimborsoSchema>
