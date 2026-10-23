'use server'

import { revalidatePath } from 'next/cache'

import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import * as operazioni from '@/lib/call/operazioni'
import { createClient } from '@/lib/supabase/server'

export type EsitoStatoLead = { ok: true } | { ok: false; errore: string }

const idSchema = z.object({ id: z.string().uuid() })

/** Manual pipeline move. Who may do it is decided by public.aggiorna_stato_lead (lib/call/operazioni.ts). */
export async function aggiornaStatoLead(input: unknown): Promise<EsitoStatoLead> {
  return operazioni.aggiornaStatoLead({ db: await createClient(), chi: getProfilo }, input)
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
  return operazioni.modificaLead({ db: await createClient(), chi: getProfilo }, input)
}
