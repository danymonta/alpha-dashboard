import { z } from 'zod'

import { Constants } from '@/lib/supabase/database.types'

export const STATI_LEAD = Constants.public.Enums.lead_status
export type StatoLead = (typeof STATI_LEAD)[number]

export const ETICHETTA_STATO_LEAD: Record<StatoLead, string> = {
  call_fissata: 'Call fissata',
  follow_up: 'Follow-up',
  cliente: 'Cliente',
  perso: 'Perso',
}

/** Short labels for the one-tap control on a phone. */
export const ETICHETTA_BREVE_STATO_LEAD: Record<StatoLead, string> = {
  call_fissata: 'Fissata',
  follow_up: 'Follow-up',
  cliente: 'Cliente',
  perso: 'Perso',
}

export const aggiornaStatoLeadSchema = z.object({
  lead_id: z.string().uuid('Lead non valido'),
  stato: z.enum(STATI_LEAD, { errorMap: () => ({ message: 'Stato non valido' }) }),
})
