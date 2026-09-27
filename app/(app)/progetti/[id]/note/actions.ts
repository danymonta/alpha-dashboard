'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { TUTTI_I_RUOLI } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { eliminaNotaSchema, modificaNotaSchema, notaSchema } from '@/lib/validation/note'

/**
 * Notes of a project. RLS decides: every member reads and writes, the author
 * (or the admin) edits and deletes.
 */

export type Esito = { ok: true } | { ok: false; errore: string }

function primoErrore(issues: { message: string }[]) {
  return issues[0]?.message ?? 'Dati non validi.'
}

export async function aggiungiNota(input: unknown): Promise<Esito> {
  const parsed = notaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(TUTTI_I_RUOLI)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.from('pm_note').insert(parsed.data)
  if (error) {
    // the insert policy refuses whoever is not in the project
    if (error.code === '42501') return { ok: false, errore: 'Solo chi fa parte del progetto scrive le note.' }
    return { ok: false, errore: messaggioErrore(error, 'Nota non salvata. Riprova.') }
  }

  revalidatePath(`/progetti/${parsed.data.progetto_id}/note`)
  return { ok: true }
}

export async function modificaNota(input: unknown): Promise<Esito> {
  const parsed = modificaNotaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(TUTTI_I_RUOLI)
  if (negato) return { ok: false, errore: negato }

  const { id, data, testo } = parsed.data
  const supabase = await createClient()
  const { data: nota, error } = await supabase
    .from('pm_note')
    .update({ data, testo })
    .eq('id', id)
    .select('progetto_id')
    .maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Nota non aggiornata. Riprova.') }
  if (!nota) return { ok: false, errore: 'Puoi modificare solo le tue note.' }

  revalidatePath(`/progetti/${nota.progetto_id}/note`)
  return { ok: true }
}

export async function eliminaNota(input: unknown): Promise<Esito> {
  const parsed = eliminaNotaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(TUTTI_I_RUOLI)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('pm_note').delete().eq('id', parsed.data.id).select('progetto_id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Nota non eliminata. Riprova.') }
  if (!data || data.length === 0) return { ok: false, errore: 'Puoi eliminare solo le tue note.' }

  revalidatePath(`/progetti/${data[0].progetto_id}/note`)
  return { ok: true }
}
