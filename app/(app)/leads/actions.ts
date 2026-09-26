'use server'

import { revalidatePath } from 'next/cache'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { aggiornaStatoLeadSchema } from '@/lib/validation/lead'

export type EsitoStatoLead = { ok: true } | { ok: false; errore: string }

/** Manual pipeline move. Who may do it is decided by public.aggiorna_stato_lead. */
export async function aggiornaStatoLead(input: unknown): Promise<EsitoStatoLead> {
  const parsed = aggiornaStatoLeadSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('aggiorna_stato_lead', {
    p_lead_id: parsed.data.lead_id,
    p_stato: parsed.data.stato,
  })

  if (error) {
    return { ok: false, errore: error.code === '42501' ? error.message : 'Stato non aggiornato. Riprova.' }
  }

  revalidatePath('/leads')
  revalidatePath('/')
  return { ok: true }
}
