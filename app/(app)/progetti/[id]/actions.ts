'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore } from '@/lib/auth/azioni'
import { negaSeNonPm } from '@/lib/auth/pm'
import { getProfilo } from '@/lib/auth/session'
import { spostaInOrdine } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'
import {
  completaTaskSchema,
  idSchema,
  listaSchema,
  membroSchema,
  modificaProgettoSchema,
  modificaTaskSchema,
  nuovoTaskSchema,
  spostaSchema,
} from '@/lib/validation/progetti'

export type Esito = { ok: true } | { ok: false; errore: string }

/**
 * Every action here goes through RLS: pm_puo_vedere / pm_puo_gestire decide.
 * An update or delete that RLS filters out touches no row and raises nothing,
 * so each one reads back what it changed and turns "nothing" into a message.
 */

const NON_GESTISCI = 'Solo chi gestisce il progetto può farlo.'
const TASK_NON_TUO = 'Puoi modificare solo i task assegnati a te o creati da te.'

function errore(error: { code?: string; message: string }, fallback: string, negato = NON_GESTISCI): string {
  // an insert refused by a policy: the raw Postgres text is not for people
  if (error.code === '42501' && error.message.includes('row-level security')) return negato
  if (error.code === '23505') return 'C’è già.'
  return messaggioErrore(error, fallback)
}

function aggiorna(progettoId: string) {
  revalidatePath(`/progetti/${progettoId}`, 'layout')
  revalidatePath('/progetti')
}

function primoErrore(e: { issues: { message: string }[] }) {
  return e.issues[0]?.message ?? 'Dati non validi.'
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function aggiungiTask(input: unknown): Promise<Esito> {
  const parsed = nuovoTaskSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSeNonPm()
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const profilo = await getProfilo()
  const supabase = await createClient()

  // at the bottom of its list (or of its parent)
  let ultimo = supabase.from('pm_task').select('ordine').eq('progetto_id', v.progetto_id)
  ultimo = v.parent_id
    ? ultimo.eq('parent_id', v.parent_id)
    : v.tasklist_id
      ? ultimo.eq('tasklist_id', v.tasklist_id).is('parent_id', null)
      : ultimo.is('tasklist_id', null).is('parent_id', null)
  const { data: righe } = await ultimo.order('ordine', { ascending: false }).limit(1)

  const { data: task, error } = await supabase
    .from('pm_task')
    .insert({
      progetto_id: v.progetto_id,
      tasklist_id: v.tasklist_id,
      parent_id: v.parent_id,
      titolo: v.titolo,
      ordine: (righe?.[0]?.ordine ?? 0) + 1,
      created_by: profilo!.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, errore: errore(error, 'Task non aggiunto. Riprova.', 'Non fai parte di questo progetto.') }

  if (v.assegnatari.length > 0) {
    const { error: e2 } = await supabase.rpc('pm_imposta_assegnatari', { p_task: task.id, p_persone: v.assegnatari })
    if (e2) {
      // all or nothing: without its people the task would look done by nobody
      await supabase.from('pm_task').delete().eq('id', task.id)
      return { ok: false, errore: errore(e2, 'Task non aggiunto. Riprova.') }
    }
  }

  aggiorna(v.progetto_id)
  return { ok: true }
}

export async function completaTask(input: unknown): Promise<Esito> {
  const parsed = completaTaskSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaSeNonPm()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pm_task')
    .update({ stato: parsed.data.completato ? 'completato' : 'da_fare' })
    .eq('id', parsed.data.id)
    .select('progetto_id')
  if (error) return { ok: false, errore: errore(error, 'Task non aggiornato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: TASK_NON_TUO }

  aggiorna(data[0].progetto_id)
  return { ok: true }
}

/**
 * Fields and people of a task. The people are checked against the project's
 * members first: someone taken out of the project while the sheet was open is
 * dropped with a word (avviso), instead of the database refusing every save.
 */
export async function modificaTask(input: unknown): Promise<Esito & { avviso?: string }> {
  const parsed = modificaTaskSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSeNonPm()
  if (negato) return { ok: false, errore: negato }

  const { id, assegnatari, ...campi } = parsed.data
  const supabase = await createClient()

  const { data: task, error: e0 } = await supabase.from('pm_task').select('progetto_id').eq('id', id).maybeSingle()
  if (e0) return { ok: false, errore: errore(e0, 'Task non salvato. Riprova.') }
  if (!task) return { ok: false, errore: 'Task non trovato: forse è stato eliminato.' }
  const { data: membri, error: e1 } = await supabase
    .from('pm_membri')
    .select('profile_id')
    .eq('progetto_id', task.progetto_id)
  if (e1) return { ok: false, errore: errore(e1, 'Task non salvato. Riprova.') }
  const nelProgetto = new Set(membri.map((m) => m.profile_id))
  const persone = assegnatari.filter((p) => nelProgetto.has(p))
  const usciti = assegnatari.filter((p) => !nelProgetto.has(p))

  const { data, error } = await supabase.from('pm_task').update(campi).eq('id', id).select('progetto_id')
  if (error) return { ok: false, errore: errore(error, 'Task non salvato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: TASK_NON_TUO }

  // the people in one call: the list sent is the list kept
  const { error: e2 } = await supabase.rpc('pm_imposta_assegnatari', { p_task: id, p_persone: persone })
  aggiorna(data[0].progetto_id)
  if (e2) return { ok: false, errore: errore(e2, 'Persone assegnate non salvate. Riprova.', TASK_NON_TUO) }
  if (usciti.length === 0) return { ok: true }

  // the directory of the team is readable by everyone: the names, when there
  const { data: nomi } = await supabase.from('profiles').select('nome').in('id', usciti)
  const chi = nomi?.length === usciti.length ? nomi.map((n) => n.nome).join(', ') : null
  return {
    ok: true,
    avviso:
      usciti.length === 1
        ? `${chi ?? 'Una persona scelta'} non fa più parte del progetto: non è tra le persone assegnate.`
        : `${chi ?? `${usciti.length} persone scelte`} non fanno più parte del progetto: non sono tra le persone assegnate.`,
  }
}

export async function eliminaTask(input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Task non valido.' }
  const negato = await negaSeNonPm()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('pm_task').delete().eq('id', parsed.data.id).select('progetto_id')
  if (error) return { ok: false, errore: errore(error, 'Task non eliminato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: 'Puoi eliminare solo i task creati da te.' }

  aggiorna(data[0].progetto_id)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Lists (milestones): who manages the project
// ---------------------------------------------------------------------------
export async function salvaLista(input: unknown): Promise<Esito> {
  const parsed = listaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSeNonPm()
  if (negato) return { ok: false, errore: negato }

  const { id, progetto_id, ...campi } = parsed.data
  const supabase = await createClient()

  if (id) {
    const { data, error } = await supabase.from('pm_tasklist').update(campi).eq('id', id).select('id')
    if (error) return { ok: false, errore: errore(error, 'Lista non salvata. Riprova.') }
    if (data.length === 0) return { ok: false, errore: NON_GESTISCI }
  } else {
    const profilo = await getProfilo()
    const { data: ultima } = await supabase
      .from('pm_tasklist')
      .select('ordine')
      .eq('progetto_id', progetto_id)
      .order('ordine', { ascending: false })
      .limit(1)
    const { error } = await supabase.from('pm_tasklist').insert({
      ...campi,
      progetto_id,
      ordine: (ultima?.[0]?.ordine ?? 0) + 1,
      created_by: profilo!.id,
    })
    if (error) return { ok: false, errore: errore(error, 'Lista non creata. Riprova.') }
  }

  aggiorna(progetto_id)
  return { ok: true }
}

/** The tasks of the list go with it (on delete cascade): the sheet says so first. */
export async function eliminaLista(input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Lista non valida.' }
  const negato = await negaSeNonPm()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('pm_tasklist').delete().eq('id', parsed.data.id).select('progetto_id')
  if (error) return { ok: false, errore: errore(error, 'Lista non eliminata. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NON_GESTISCI }

  aggiorna(data[0].progetto_id)
  return { ok: true }
}

export async function spostaLista(input: unknown): Promise<Esito> {
  const parsed = spostaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaSeNonPm()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data: lista } = await supabase.from('pm_tasklist').select('progetto_id').eq('id', parsed.data.id).maybeSingle()
  if (!lista) return { ok: false, errore: 'Lista non trovata.' }
  const { data: liste, error: e1 } = await supabase
    .from('pm_tasklist')
    .select('id')
    .eq('progetto_id', lista.progetto_id)
    .order('ordine')
    .order('created_at')
  if (e1) return { ok: false, errore: 'Ordine non salvato. Riprova.' }

  const ordine = spostaInOrdine(
    liste.map((l) => l.id),
    parsed.data.id,
    parsed.data.direzione,
  )
  if (!ordine) return { ok: true }

  const { data: spostate, error } = await supabase.rpc('pm_riordina_liste', {
    p_progetto_id: lista.progetto_id,
    p_ids: ordine,
  })
  if (error) return { ok: false, errore: errore(error, 'Ordine non salvato. Riprova.') }
  if (!spostate) return { ok: false, errore: NON_GESTISCI }

  aggiorna(lista.progetto_id)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// The project itself
// ---------------------------------------------------------------------------
export async function modificaProgetto(input: unknown): Promise<Esito> {
  const parsed = modificaProgettoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSeNonPm()
  if (negato) return { ok: false, errore: negato }

  // client_id only when the form had the field (the database guard checks the admin)
  const { id, client_id, ...campi } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pm_progetti')
    .update(client_id === undefined ? campi : { ...campi, client_id })
    .eq('id', id)
    .select('id')
  // one project per client (02/10/2026)
  if (error?.code === '23505') return { ok: false, errore: 'Questo cliente ha già il suo progetto: lo apri dalla scheda del cliente.' }
  if (error) return { ok: false, errore: errore(error, 'Progetto non salvato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NON_GESTISCI }

  aggiorna(id)
  return { ok: true }
}

/** Only the PM admin; lists, tasks, members, time and notes go with it. */
export async function eliminaProgetto(input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Progetto non valido.' }
  const negato = await negaSeNonPm(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('pm_progetti').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: errore(error, 'Progetto non eliminato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: 'Solo l’admin dei progetti elimina un progetto.' }

  revalidatePath('/progetti')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
export async function aggiungiMembro(input: unknown): Promise<Esito> {
  const parsed = membroSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSeNonPm()
  if (negato) return { ok: false, errore: negato }

  const profilo = await getProfilo()
  const supabase = await createClient()
  const { error } = await supabase.from('pm_membri').insert({ ...parsed.data, aggiunto_da: profilo!.id })
  if (error) {
    if (error.code === '23505') return { ok: false, errore: 'Fa già parte del progetto.' }
    return { ok: false, errore: errore(error, 'Persona non aggiunta. Riprova.') }
  }

  aggiorna(parsed.data.progetto_id)
  return { ok: true }
}

/**
 * "Coach del cliente" (02/10/2026): one call, pm_scegli_coach does the rest in
 * the database. The coach joins and takes the client's tasks; a task of a
 * role (the meal plan) goes to an active person with that role, if any.
 */
export async function scegliCoach(input: unknown): Promise<Esito> {
  const parsed = membroSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSeNonPm(['admin', 'manager'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('pm_scegli_coach', {
    p_progetto: parsed.data.progetto_id,
    p_coach: parsed.data.profile_id,
  })
  if (error) return { ok: false, errore: errore(error, 'Coach non salvato. Riprova.') }

  aggiorna(parsed.data.progetto_id)
  revalidatePath('/task')
  return { ok: true }
}

/** The database takes them off the tasks they were assigned to and clears them as person in charge. */
export async function togliMembro(input: unknown): Promise<Esito> {
  const parsed = membroSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaSeNonPm()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pm_membri')
    .delete()
    .eq('progetto_id', parsed.data.progetto_id)
    .eq('profile_id', parsed.data.profile_id)
    .select('id')
  if (error) return { ok: false, errore: errore(error, 'Persona non tolta. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NON_GESTISCI }

  aggiorna(parsed.data.progetto_id)
  return { ok: true }
}
