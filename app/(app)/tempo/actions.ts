'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { TUTTI_I_RUOLI } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import {
  avviaTimerSchema,
  eliminaTempoSchema,
  fermaTimerSchema,
  modificaTempoSchema,
  tempoManualeSchema,
} from '@/lib/validation/tempo'

/**
 * Self-declared time (CLAUDE.md section 17: a statement of one's own work,
 * never monitoring). RLS decides: everyone writes only their own time, on the
 * projects they can see. Minutes of a timer or of a range are computed by the database.
 */

export type Esito = { ok: true } | { ok: false; errore: string }
export type EsitoFermo = { ok: true; minuti: number | null } | { ok: false; errore: string }

function primoErrore(issues: { message: string }[]) {
  return issues[0]?.message ?? 'Dati non validi.'
}

function aggiorna(progettoId?: string | null) {
  revalidatePath('/tempo')
  if (progettoId) revalidatePath(`/progetti/${progettoId}`, 'layout')
}

export async function avviaTimer(input: unknown): Promise<Esito> {
  const parsed = avviaTimerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(TUTTI_I_RUOLI)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('pm_avvia_timer', {
    p_progetto_id: parsed.data.progetto_id,
    p_task_id: parsed.data.task_id ?? undefined,
    p_nota: parsed.data.nota ?? undefined,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Timer non avviato. Riprova.') }

  aggiorna(parsed.data.progetto_id)
  return { ok: true }
}

export async function fermaTimer(input: unknown): Promise<EsitoFermo> {
  const parsed = fermaTimerSchema.safeParse(input ?? {})
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(TUTTI_I_RUOLI)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('pm_ferma_timer', { p_nota: parsed.data.nota ?? undefined })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Timer non fermato. Riprova.') }
  // already stopped elsewhere (another device): nothing to do, the screens catch up
  if (!id) {
    aggiorna()
    return { ok: true, minuti: null }
  }

  const { data: voce } = await supabase.from('pm_tempo').select('minuti, progetto_id').eq('id', id).maybeSingle()
  aggiorna(voce?.progetto_id)
  return { ok: true, minuti: voce?.minuti ?? null }
}

/**
 * Time typed afterwards: minutes, or "Dalle"–"Alle" on its day. With a range
 * the database builds start and end in Europe/Rome and computes the minutes
 * (pm_registra_tempo).
 */
export async function registraTempo(input: unknown): Promise<Esito> {
  const parsed = tempoManualeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(TUTTI_I_RUOLI)
  if (negato) return { ok: false, errore: negato }

  const { progetto_id, task_id, data, durata, dalle, alle, nota } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('pm_registra_tempo', {
    p_progetto_id: progetto_id,
    p_data: data,
    ...(dalle && alle ? { p_dalle: dalle, p_alle: alle } : { p_minuti: durata }),
    p_task_id: task_id ?? undefined,
    p_nota: nota ?? undefined,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Tempo non salvato. Riprova.') }

  aggiorna(progetto_id)
  return { ok: true }
}

/**
 * Correcting an entry (pm_modifica_tempo): its range can be added, changed or
 * removed, and removing it keeps the minutes typed. The same range as before
 * keeps a timer's seconds; a timer across midnight keeps its start and end
 * while its day and minutes stay.
 */
export async function modificaTempo(input: unknown): Promise<Esito> {
  const parsed = modificaTempoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(TUTTI_I_RUOLI)
  if (negato) return { ok: false, errore: negato }

  const { id, progetto_id, task_id, data, durata, dalle, alle, nota } = parsed.data
  const supabase = await createClient()
  const { data: prima, error: errorePrima } = await supabase.from('pm_tempo').select('progetto_id').eq('id', id).maybeSingle()
  if (errorePrima) return { ok: false, errore: 'Voce non aggiornata. Riprova.' }
  if (!prima) return { ok: false, errore: 'Voce non trovata.' }

  const { data: aggiornata, error } = await supabase.rpc('pm_modifica_tempo', {
    p_id: id,
    p_progetto_id: progetto_id,
    p_data: data,
    ...(dalle && alle ? { p_dalle: dalle, p_alle: alle } : { p_minuti: durata }),
    p_task_id: task_id ?? undefined,
    p_nota: nota ?? undefined,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Voce non aggiornata. Riprova.') }
  if (!aggiornata) return { ok: false, errore: 'Puoi correggere solo il tuo tempo.' }

  aggiorna(progetto_id)
  if (prima.progetto_id !== progetto_id) aggiorna(prima.progetto_id)
  return { ok: true }
}

export async function eliminaTempo(input: unknown): Promise<Esito> {
  const parsed = eliminaTempoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(TUTTI_I_RUOLI)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('pm_tempo').delete().eq('id', parsed.data.id).select('progetto_id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Voce non eliminata. Riprova.') }
  if (!data || data.length === 0) return { ok: false, errore: 'Puoi eliminare solo il tuo tempo.' }

  aggiorna(data[0].progetto_id)
  return { ok: true }
}
