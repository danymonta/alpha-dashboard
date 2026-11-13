'use server'

import { revalidatePath } from 'next/cache'

import { getProfilo } from '@/lib/auth/session'
import * as team from '@/lib/percorso/team-campo'
import { createClient } from '@/lib/supabase/server'
import { ERRORI_CHECKUP } from '@/lib/validation/checkup'

/**
 * The check-ups of a client from his project (1.83.0): the core (lib/percorso/team-campo.ts) with the
 * session of whoever writes; the database decides who (the admin and the client's team). They
 * revalidate the tab of the project and the client's area.
 */

export async function salvaCheckup(progettoId: string, input: unknown): Promise<team.EsitoCheckup> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: ERRORI_CHECKUP.nonSalvato }
  const esito = await team.salvaCheckup(await createClient(), input)
  if (esito.ok) {
    revalidatePath(`/progetti/${progettoId}/percorso`)
    revalidatePath('/percorso', 'layout')
  }
  return esito
}

export async function eliminaCheckup(progettoId: string, input: unknown): Promise<{ ok: true } | { ok: false; errore: string }> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: ERRORI_CHECKUP.nonEliminata }
  const esito = await team.eliminaCheckup(await createClient(), input)
  if (esito.ok) {
    revalidatePath(`/progetti/${progettoId}/percorso`)
    revalidatePath('/percorso', 'layout')
  }
  return esito
}
