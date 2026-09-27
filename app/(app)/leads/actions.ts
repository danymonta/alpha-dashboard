'use server'

import { revalidatePath } from 'next/cache'

import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { aggiornaStatoLeadSchema, modificaLeadSchema } from '@/lib/validation/lead'

export type EsitoStatoLead = { ok: true } | { ok: false; errore: string }

const idSchema = z.object({ id: z.string().uuid() })

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

/** With its calls; a client born from it stays (public.elimina_lead). */
export async function eliminaLead(input: unknown): Promise<EsitoStatoLead> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Lead non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('elimina_lead', { p_lead_id: parsed.data.id })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Lead non eliminato. Riprova.') }

  for (const pagina of ['/leads', '/calls', '/setting', '/']) revalidatePath(pagina)
  return { ok: true }
}

/** Name, handle, source, notes. RLS decides: the admin, or the setter on their own leads. */
export async function modificaLead(input: unknown): Promise<EsitoStatoLead> {
  const parsed = modificaLeadSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  if (profilo.ruolo !== 'admin' && profilo.ruolo !== 'setter') {
    return { ok: false, errore: 'I dati del lead li corregge il setter o l’admin.' }
  }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('leads').update(campi).eq('id', id).select('id').maybeSingle()

  if (error) return { ok: false, errore: 'Lead non aggiornato. Riprova.' }
  if (!data) return { ok: false, errore: 'Lead non trovato o non tuo.' }

  revalidatePath('/leads')
  revalidatePath('/calls')
  return { ok: true }
}
