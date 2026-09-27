'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore } from '@/lib/auth/azioni'
import { negaSeNonPm } from '@/lib/auth/pm'
import { createClient } from '@/lib/supabase/server'
import { nuovoProgettoSchema } from '@/lib/validation/progetti'

export type EsitoCreazione = { ok: true; id: string } | { ok: false; errore: string }

/**
 * pm_crea_progetto does it all in one transaction: the project, its members
 * (the creator included) and, from a template, its dated lists and tasks.
 * It also refuses a client link from anybody but the app admin.
 */
export async function creaProgetto(input: unknown): Promise<EsitoCreazione> {
  const parsed = nuovoProgettoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNonPm(['admin', 'manager'])
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pm_crea_progetto', {
    p_reparto_id: v.reparto_id,
    p_nome: v.nome,
    p_descrizione: v.descrizione ?? undefined,
    p_client_id: v.client_id ?? undefined,
    p_modello_id: v.modello_id ?? undefined,
    p_data_inizio: v.data_inizio ?? undefined,
    p_data_fine: v.data_fine ?? undefined,
    p_membri: v.membri,
  })
  if (error || !data) return { ok: false, errore: messaggioErrore(error ?? { message: '' }, 'Progetto non creato. Riprova.') }

  revalidatePath('/progetti')
  return { ok: true, id: data }
}
