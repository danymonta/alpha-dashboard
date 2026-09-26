import { z } from 'zod'

import { Constants } from '@/lib/supabase/database.types'
import { FONTI, normalizzaHandle } from '@/lib/validation/call'

export const STATI_LEAD = Constants.public.Enums.lead_status
export type StatoLead = (typeof STATI_LEAD)[number]

export const ETICHETTA_STATO_LEAD: Record<StatoLead, string> = {
  call_fissata: 'Call da fare',
  follow_up: 'Follow-up',
  cliente: 'Cliente',
  perso: 'Perso',
}

/** Short labels for the one-tap control on a phone. */
export const ETICHETTA_BREVE_STATO_LEAD: Record<StatoLead, string> = {
  call_fissata: 'Da fare',
  follow_up: 'Follow-up',
  cliente: 'Cliente',
  perso: 'Perso',
}

export const aggiornaStatoLeadSchema = z.object({
  lead_id: z.string().uuid('Lead non valido'),
  stato: z.enum(STATI_LEAD, { errorMap: () => ({ message: 'Stato non valido' }) }),
})

/** Lead details after the call was booked: the setter who owns it, or the admin. */
export const modificaLeadSchema = z.object({
  id: z.string().uuid('Lead non valido'),
  nome: z.string().trim().min(2, 'Scrivi il nome del lead').max(120, 'Al massimo 120 caratteri'),
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
  note: z
    .string()
    .max(1000, 'Al massimo 1000 caratteri')
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null)),
})

export type ModificaLeadInput = z.input<typeof modificaLeadSchema>
