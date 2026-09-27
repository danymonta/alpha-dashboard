'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore } from '@/lib/auth/azioni'
import { negaSeNonPm } from '@/lib/auth/pm'
import { getProfilo } from '@/lib/auth/session'
import { spostaInOrdine } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'
import { attivoSchema, idSchema, modelloSchema, repartoSchema, spostaSchema, voceModelloSchema } from '@/lib/validation/progetti'

export type Esito = { ok: true } | { ok: false; errore: string }
export type EsitoModello = { ok: true; id: string } | { ok: false; errore: string }

/** Departments and templates belong to the PM admin (RLS: pm_livello_corrente() = 'admin'). */
const SOLO_ADMIN = ['admin'] as const
const NEGATO = 'Operazione riservata all’admin dei progetti.'

function errore(error: { code?: string; message: string }, fallback: string) {
  if (error.code === '23505') return 'Esiste già un reparto con questo nome.'
  if (error.code === '23503') return 'Il reparto ha ancora dei progetti: spostali in un altro reparto o eliminali prima.'
  if (error.code === '42501' && error.message.includes('row-level security')) return NEGATO
  return messaggioErrore(error, fallback)
}

function aggiorna(modelloId?: string) {
  revalidatePath('/settings/progetti')
  if (modelloId) revalidatePath(`/settings/progetti/modelli/${modelloId}`)
  revalidatePath('/progetti')
}

function primoErrore(e: { issues: { message: string }[] }) {
  return e.issues[0]?.message ?? 'Dati non validi.'
}

// ---------------------------------------------------------------------------
// Departments: added, renamed, reordered, switched off, deleted once they have no projects.
// ---------------------------------------------------------------------------
export async function salvaReparto(input: unknown): Promise<Esito> {
  const parsed = repartoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSeNonPm(SOLO_ADMIN)
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  if (id) {
    const { data, error } = await supabase.from('pm_reparti').update(campi).eq('id', id).select('id')
    if (error) return { ok: false, errore: errore(error, 'Reparto non salvato. Riprova.') }
    if (data.length === 0) return { ok: false, errore: NEGATO }
  } else {
    const profilo = await getProfilo()
    const { data: ultimo } = await supabase.from('pm_reparti').select('ordine').order('ordine', { ascending: false }).limit(1)
    const { error } = await supabase
      .from('pm_reparti')
      .insert({ ...campi, ordine: (ultimo?.[0]?.ordine ?? 0) + 1, created_by: profilo!.id })
    if (error) return { ok: false, errore: errore(error, 'Reparto non creato. Riprova.') }
  }

  aggiorna()
  return { ok: true }
}

export async function cambiaAttivoReparto(input: unknown): Promise<Esito> {
  const parsed = attivoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaSeNonPm(SOLO_ADMIN)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pm_reparti')
    .update({ attivo: parsed.data.attivo })
    .eq('id', parsed.data.id)
    .select('id')
  if (error) return { ok: false, errore: errore(error, 'Operazione non riuscita. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NEGATO }

  aggiorna()
  return { ok: true }
}

/** Its templates go with it; a department with projects is refused by the foreign key. */
export async function eliminaReparto(input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Reparto non valido.' }
  const negato = await negaSeNonPm(SOLO_ADMIN)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('pm_reparti').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: errore(error, 'Reparto non eliminato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NEGATO }

  aggiorna()
  return { ok: true }
}

export async function spostaReparto(input: unknown): Promise<Esito> {
  const parsed = spostaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaSeNonPm(SOLO_ADMIN)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data: reparti, error: e1 } = await supabase.from('pm_reparti').select('id').order('ordine').order('nome')
  if (e1) return { ok: false, errore: 'Ordine non salvato. Riprova.' }
  const ordine = spostaInOrdine(
    reparti.map((r) => r.id),
    parsed.data.id,
    parsed.data.direzione,
  )
  if (!ordine) return { ok: true }

  const { data: spostati, error } = await supabase.rpc('pm_riordina_reparti', { p_ids: ordine })
  if (error) return { ok: false, errore: errore(error, 'Ordine non salvato. Riprova.') }
  if (!spostati) return { ok: false, errore: NEGATO }

  aggiorna()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Templates and their items
// ---------------------------------------------------------------------------
export async function salvaModello(input: unknown): Promise<EsitoModello> {
  const parsed = modelloSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSeNonPm(SOLO_ADMIN)
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  if (id) {
    const { data, error } = await supabase.from('pm_modelli').update(campi).eq('id', id).select('id')
    if (error) return { ok: false, errore: errore(error, 'Modello non salvato. Riprova.') }
    if (data.length === 0) return { ok: false, errore: NEGATO }
    aggiorna(id)
    return { ok: true, id }
  }

  const profilo = await getProfilo()
  const { data, error } = await supabase
    .from('pm_modelli')
    .insert({ ...campi, created_by: profilo!.id })
    .select('id')
    .single()
  if (error) return { ok: false, errore: errore(error, 'Modello non creato. Riprova.') }

  aggiorna(data.id)
  return { ok: true, id: data.id }
}

/** A template switched off is no longer offered for new projects; old ones are untouched. */
export async function cambiaAttivoModello(input: unknown): Promise<Esito> {
  const parsed = attivoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaSeNonPm(SOLO_ADMIN)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pm_modelli')
    .update({ attivo: parsed.data.attivo })
    .eq('id', parsed.data.id)
    .select('id')
  if (error) return { ok: false, errore: errore(error, 'Operazione non riuscita. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NEGATO }

  aggiorna(parsed.data.id)
  return { ok: true }
}

/** Projects already opened from it keep their lists and tasks. */
export async function eliminaModello(input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Modello non valido.' }
  const negato = await negaSeNonPm(SOLO_ADMIN)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('pm_modelli').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: errore(error, 'Modello non eliminato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NEGATO }

  aggiorna()
  return { ok: true }
}

export async function salvaVoce(input: unknown): Promise<Esito> {
  const parsed = voceModelloSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSeNonPm(SOLO_ADMIN)
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  const { data, error } = id
    ? await supabase.from('pm_modelli_voci').update(campi).eq('id', id).select('id')
    : await supabase.from('pm_modelli_voci').insert(campi).select('id')
  if (error) return { ok: false, errore: errore(error, 'Attività non salvata. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NEGATO }

  aggiorna(campi.modello_id)
  return { ok: true }
}

export async function eliminaVoce(input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Attività non valida.' }
  const negato = await negaSeNonPm(SOLO_ADMIN)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('pm_modelli_voci').delete().eq('id', parsed.data.id).select('modello_id')
  if (error) return { ok: false, errore: errore(error, 'Attività non eliminata. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NEGATO }

  aggiorna(data[0].modello_id)
  return { ok: true }
}
