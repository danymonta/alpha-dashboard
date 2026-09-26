'use server'

import { revalidatePath } from 'next/cache'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { reportGiornalieroSchema } from '@/lib/validation/report'

export type EsitoSalvataggio =
  | { ok: true; salvatoAlle: string; creato: boolean }
  | { ok: false; errore: string }

/**
 * Autosave of the setter's daily report. Creates the row on the first touch
 * (upsert on setter_id + data). The 7-day window is enforced by RLS: this code
 * only turns the refusal into a readable message.
 */
export async function salvaReportGiornaliero(input: unknown): Promise<EsitoSalvataggio> {
  const parsed = reportGiornalieroSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }

  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) {
    return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  }
  if (profilo.ruolo !== 'setter') {
    return { ok: false, errore: 'Il report giornaliero lo compila il setter.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('setter_daily_reports')
    .upsert(
      { ...parsed.data, setter_id: profilo.id, created_by: profilo.id },
      { onConflict: 'setter_id,data' },
    )
    .select('created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '42501') {
      return { ok: false, errore: 'Puoi modificare solo i report degli ultimi 7 giorni.' }
    }
    return { ok: false, errore: 'Salvataggio non riuscito. Riprova.' }
  }

  // Pages that read these numbers. /today itself keeps its local state.
  revalidatePath('/')
  revalidatePath('/setting')
  revalidatePath('/my-numbers')

  return {
    ok: true,
    salvatoAlle: data.updated_at,
    // Same statement timestamp only on insert: the update trigger moves updated_at.
    creato: data.created_at === data.updated_at,
  }
}
