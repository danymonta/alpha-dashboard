import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

import { messaggioErrore } from '@/lib/auth/azioni'
import { livelloPmEffettivo, type AppRole, type LivelloPm } from '@/lib/auth/roles'
import { spostaInOrdine } from '@/lib/progetti'
import type { Database } from '@/lib/supabase/database.types'
import { eliminaNotaSchema, modificaNotaSchema, notaSchema } from '@/lib/validation/note'
import {
  completaTaskSchema,
  idSchema,
  listaSchema,
  membroSchema,
  modificaProgettoSchema,
  modificaTaskSchema,
  nuovoProgettoSchema,
  nuovoTaskSchema,
  spostaSchema,
} from '@/lib/validation/progetti'
import {
  avviaTimerSchema,
  eliminaTempoSchema,
  fermaTimerSchema,
  modificaTempoSchema,
  tempoManualeSchema,
} from '@/lib/validation/tempo'

/**
 * The only way projects, lists, tasks, notes and time are written (Claude a
 * 360 gradi, phase 1, 22/10/2026): from the app (the server actions of
 * /progetti and /tempo, with the cookie session of whoever taps, and Alfire,
 * which calls those actions) and from Claude (the MCP tools, with the OAuth
 * token of whoever connected it). Same Zod schemas, same SQL, same messages;
 * the client is always the caller's, never the service role, so RLS and the
 * pm_* helpers in SQL decide what actually happens. Who is asking (`chi`) is
 * read lazily, after the input is parsed, as the actions always did: the
 * actions read the profile of the cookie session, the MCP route passes the
 * person behind the token. Every write revalidates the pages it touches, so a
 * change from Claude shows in the app too.
 */

export type Db = SupabaseClient<Database>

/** Who asks: the fields the guards read. */
export type Chi = { id: string; ruolo: AppRole; livello_pm: LivelloPm; attivo: boolean }

export type Contesto = { db: Db; chi: () => Promise<Chi | null> }

export type Esito = { ok: true } | { ok: false; errore: string }
export type EsitoId = { ok: true; id: string } | { ok: false; errore: string }
/** The entry a timer or a save created: Alfire and Claude correct "the one just registered" by it. */
export type EsitoVoce = { ok: true; id: string | null } | { ok: false; errore: string }
export type EsitoFermo = { ok: true; minuti: number | null; id: string | null } | { ok: false; errore: string }

const SESSIONE = 'Sessione scaduta. Rientra e riprova.'
export const NON_GESTISCI = 'Solo chi gestisce il progetto può farlo.'
export const TASK_NON_TUO = 'Puoi modificare solo i task assegnati a te o creati da te.'

/** negaSeNonPm of lib/auth/pm.ts, on the person given. */
async function negaPm(ctx: Contesto, livelli: readonly LivelloPm[] = ['admin', 'manager', 'employee']): Promise<string | null> {
  const chi = await ctx.chi()
  if (!chi || !chi.attivo) return SESSIONE
  const livello = livelloPmEffettivo(chi.ruolo, chi.livello_pm)
  if (!livelli.includes(livello)) {
    return livelli.length === 1 && livelli[0] === 'admin'
      ? 'Operazione riservata all’admin dei progetti.'
      : 'Operazione riservata a chi gestisce i progetti.'
  }
  return null
}

/** negaSeNon(TUTTI_I_RUOLI): every active person. */
async function negaSessione(ctx: Contesto): Promise<string | null> {
  const chi = await ctx.chi()
  return !chi || !chi.attivo ? SESSIONE : null
}

function primoErrore(e: { issues: { message: string }[] }) {
  return e.issues[0]?.message ?? 'Dati non validi.'
}

function errore(error: { code?: string; message: string }, fallback: string, negato = NON_GESTISCI): string {
  // an insert refused by a policy: the raw Postgres text is not for people
  if (error.code === '42501' && error.message.includes('row-level security')) return negato
  if (error.code === '23505') return 'C’è già.'
  return messaggioErrore(error, fallback)
}

function aggiornaProgetto(progettoId: string) {
  revalidatePath(`/progetti/${progettoId}`, 'layout')
  revalidatePath('/progetti')
}

function aggiornaTempo(progettoId?: string | null) {
  revalidatePath('/tempo')
  if (progettoId) revalidatePath(`/progetti/${progettoId}`, 'layout')
}

// ---------------------------------------------------------------------------
// The project
// ---------------------------------------------------------------------------
/**
 * pm_crea_progetto does it all in one transaction: the project, its members
 * (the creator included) and, from a template, its dated lists and tasks.
 * It also refuses a client link from anybody but the app admin in the app.
 */
export async function creaProgetto(ctx: Contesto, input: unknown): Promise<EsitoId> {
  const parsed = nuovoProgettoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaPm(ctx, ['admin', 'manager'])
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const { data, error } = await ctx.db.rpc('pm_crea_progetto', {
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

export async function modificaProgetto(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = modificaProgettoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaPm(ctx)
  if (negato) return { ok: false, errore: negato }

  // client_id only when the form had the field (the database guard checks the admin)
  const { id, client_id, ...campi } = parsed.data
  const { data, error } = await ctx.db
    .from('pm_progetti')
    .update(client_id === undefined ? campi : { ...campi, client_id })
    .eq('id', id)
    .select('id')
  // one project per client (02/10/2026)
  if (error?.code === '23505') return { ok: false, errore: 'Questo cliente ha già il suo progetto: lo apri dalla scheda del cliente.' }
  if (error) return { ok: false, errore: errore(error, 'Progetto non salvato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NON_GESTISCI }

  aggiornaProgetto(id)
  return { ok: true }
}

/** Only the PM admin; lists, tasks, members, time and notes go with it. The app only: never from Claude. */
export async function eliminaProgetto(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Progetto non valido.' }
  const negato = await negaPm(ctx, ['admin'])
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.from('pm_progetti').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: errore(error, 'Progetto non eliminato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: 'Solo l’admin dei progetti elimina un progetto.' }

  revalidatePath('/progetti')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
export async function aggiungiMembro(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = membroSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaPm(ctx)
  if (negato) return { ok: false, errore: negato }

  const chi = await ctx.chi()
  const { error } = await ctx.db.from('pm_membri').insert({ ...parsed.data, aggiunto_da: chi!.id })
  if (error) {
    if (error.code === '23505') return { ok: false, errore: 'Fa già parte del progetto.' }
    return { ok: false, errore: errore(error, 'Persona non aggiunta. Riprova.') }
  }

  aggiornaProgetto(parsed.data.progetto_id)
  return { ok: true }
}

/**
 * "Coach del cliente" (02/10/2026): one call, pm_scegli_coach does the rest in
 * the database. The coach joins and takes the client's tasks; a task of a
 * role (the meal plan) goes to an active person with that role, if any.
 */
export async function scegliCoach(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = membroSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaPm(ctx, ['admin', 'manager'])
  if (negato) return { ok: false, errore: negato }

  const { error } = await ctx.db.rpc('pm_scegli_coach', {
    p_progetto: parsed.data.progetto_id,
    p_coach: parsed.data.profile_id,
  })
  if (error) return { ok: false, errore: errore(error, 'Coach non salvato. Riprova.') }

  aggiornaProgetto(parsed.data.progetto_id)
  revalidatePath('/task')
  return { ok: true }
}

/** The database takes them off the tasks they were assigned to and clears them as person in charge. The app only. */
export async function togliMembro(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = membroSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaPm(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db
    .from('pm_membri')
    .delete()
    .eq('progetto_id', parsed.data.progetto_id)
    .eq('profile_id', parsed.data.profile_id)
    .select('id')
  if (error) return { ok: false, errore: errore(error, 'Persona non tolta. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NON_GESTISCI }

  aggiornaProgetto(parsed.data.progetto_id)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Lists (milestones): who manages the project
// ---------------------------------------------------------------------------
/** A new list, or a list changed: the id of the list either way. */
export async function salvaLista(ctx: Contesto, input: unknown): Promise<EsitoId> {
  const parsed = listaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaPm(ctx)
  if (negato) return { ok: false, errore: negato }

  const { id, progetto_id, ...campi } = parsed.data
  let listaId: string

  if (id) {
    const { data, error } = await ctx.db.from('pm_tasklist').update(campi).eq('id', id).select('id')
    if (error) return { ok: false, errore: errore(error, 'Lista non salvata. Riprova.') }
    if (data.length === 0) return { ok: false, errore: NON_GESTISCI }
    listaId = id
  } else {
    const chi = await ctx.chi()
    const { data: ultima } = await ctx.db
      .from('pm_tasklist')
      .select('ordine')
      .eq('progetto_id', progetto_id)
      .order('ordine', { ascending: false })
      .limit(1)
    const { data, error } = await ctx.db
      .from('pm_tasklist')
      .insert({
        ...campi,
        progetto_id,
        ordine: (ultima?.[0]?.ordine ?? 0) + 1,
        created_by: chi!.id,
      })
      .select('id')
      .single()
    if (error) return { ok: false, errore: errore(error, 'Lista non creata. Riprova.') }
    listaId = data.id
  }

  aggiornaProgetto(progetto_id)
  return { ok: true, id: listaId }
}

/** The tasks of the list go with it (on delete cascade): the sheet says so first. The app only. */
export async function eliminaLista(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Lista non valida.' }
  const negato = await negaPm(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.from('pm_tasklist').delete().eq('id', parsed.data.id).select('progetto_id')
  if (error) return { ok: false, errore: errore(error, 'Lista non eliminata. Riprova.') }
  if (data.length === 0) return { ok: false, errore: NON_GESTISCI }

  aggiornaProgetto(data[0].progetto_id)
  return { ok: true }
}

export async function spostaLista(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = spostaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaPm(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data: lista } = await ctx.db.from('pm_tasklist').select('progetto_id').eq('id', parsed.data.id).maybeSingle()
  if (!lista) return { ok: false, errore: 'Lista non trovata.' }
  const { data: liste, error: e1 } = await ctx.db
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

  const { data: spostate, error } = await ctx.db.rpc('pm_riordina_liste', {
    p_progetto_id: lista.progetto_id,
    p_ids: ordine,
  })
  if (error) return { ok: false, errore: errore(error, 'Ordine non salvato. Riprova.') }
  if (!spostate) return { ok: false, errore: NON_GESTISCI }

  aggiornaProgetto(lista.progetto_id)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function aggiungiTask(ctx: Contesto, input: unknown): Promise<EsitoId> {
  const parsed = nuovoTaskSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaPm(ctx)
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const chi = await ctx.chi()

  // at the bottom of its list (or of its parent)
  let ultimo = ctx.db.from('pm_task').select('ordine').eq('progetto_id', v.progetto_id)
  ultimo = v.parent_id
    ? ultimo.eq('parent_id', v.parent_id)
    : v.tasklist_id
      ? ultimo.eq('tasklist_id', v.tasklist_id).is('parent_id', null)
      : ultimo.is('tasklist_id', null).is('parent_id', null)
  const { data: righe } = await ultimo.order('ordine', { ascending: false }).limit(1)

  const { data: task, error } = await ctx.db
    .from('pm_task')
    .insert({
      progetto_id: v.progetto_id,
      tasklist_id: v.tasklist_id,
      parent_id: v.parent_id,
      titolo: v.titolo,
      ordine: (righe?.[0]?.ordine ?? 0) + 1,
      created_by: chi!.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, errore: errore(error, 'Task non aggiunto. Riprova.', 'Non fai parte di questo progetto.') }

  if (v.assegnatari.length > 0) {
    const { error: e2 } = await ctx.db.rpc('pm_imposta_assegnatari', { p_task: task.id, p_persone: v.assegnatari })
    if (e2) {
      // all or nothing: without its people the task would look done by nobody. From Claude nothing is
      // deleted (the database refuses it): the task stays, and the answer says so
      const { data: tolto } = await ctx.db.from('pm_task').delete().eq('id', task.id).select('id')
      const messaggio = errore(e2, 'Task non aggiunto. Riprova.')
      if (tolto && tolto.length > 0) return { ok: false, errore: messaggio }
      aggiornaProgetto(v.progetto_id)
      return { ok: false, errore: `${messaggio} Il task è stato creato senza persone assegnate: assegnale modificandolo.` }
    }
  }

  aggiornaProgetto(v.progetto_id)
  return { ok: true, id: task.id }
}

export async function completaTask(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = completaTaskSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaPm(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db
    .from('pm_task')
    .update({ stato: parsed.data.completato ? 'completato' : 'da_fare' })
    .eq('id', parsed.data.id)
    .select('progetto_id')
  if (error) return { ok: false, errore: errore(error, 'Task non aggiornato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: TASK_NON_TUO }

  aggiornaProgetto(data[0].progetto_id)
  return { ok: true }
}

/**
 * Fields and people of a task. The people are checked against the project's
 * members first: someone taken out of the project while the sheet was open is
 * dropped with a word (avviso), instead of the database refusing every save.
 */
export async function modificaTask(ctx: Contesto, input: unknown): Promise<Esito & { avviso?: string }> {
  const parsed = modificaTaskSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaPm(ctx)
  if (negato) return { ok: false, errore: negato }

  const { id, assegnatari, ...campi } = parsed.data
  const db = ctx.db

  const { data: task, error: e0 } = await db.from('pm_task').select('progetto_id').eq('id', id).maybeSingle()
  if (e0) return { ok: false, errore: errore(e0, 'Task non salvato. Riprova.') }
  if (!task) return { ok: false, errore: 'Task non trovato: forse è stato eliminato.' }
  const { data: membri, error: e1 } = await db.from('pm_membri').select('profile_id').eq('progetto_id', task.progetto_id)
  if (e1) return { ok: false, errore: errore(e1, 'Task non salvato. Riprova.') }
  const nelProgetto = new Set(membri.map((m) => m.profile_id))
  const persone = assegnatari.filter((p) => nelProgetto.has(p))
  const usciti = assegnatari.filter((p) => !nelProgetto.has(p))

  const { data, error } = await db.from('pm_task').update(campi).eq('id', id).select('progetto_id')
  if (error) return { ok: false, errore: errore(error, 'Task non salvato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: TASK_NON_TUO }

  // the people in one call: the list sent is the list kept
  const { error: e2 } = await db.rpc('pm_imposta_assegnatari', { p_task: id, p_persone: persone })
  aggiornaProgetto(data[0].progetto_id)
  if (e2) return { ok: false, errore: errore(e2, 'Persone assegnate non salvate. Riprova.', TASK_NON_TUO) }
  if (usciti.length === 0) return { ok: true }

  // the directory of the team is readable by everyone: the names, when there
  const { data: nomi } = await db.from('profiles').select('nome').in('id', usciti)
  const chi = nomi?.length === usciti.length ? nomi.map((n) => n.nome).join(', ') : null
  return {
    ok: true,
    avviso:
      usciti.length === 1
        ? `${chi ?? 'Una persona scelta'} non fa più parte del progetto: non è tra le persone assegnate.`
        : `${chi ?? `${usciti.length} persone scelte`} non fanno più parte del progetto: non sono tra le persone assegnate.`,
  }
}

/** The app only: never from Claude. */
export async function eliminaTask(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Task non valido.' }
  const negato = await negaPm(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.from('pm_task').delete().eq('id', parsed.data.id).select('progetto_id')
  if (error) return { ok: false, errore: errore(error, 'Task non eliminato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: 'Puoi eliminare solo i task creati da te.' }

  aggiornaProgetto(data[0].progetto_id)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Notes: RLS decides (every member reads and writes, the author or the admin edits and deletes)
// ---------------------------------------------------------------------------
export async function aggiungiNota(ctx: Contesto, input: unknown): Promise<EsitoId> {
  const parsed = notaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSessione(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.from('pm_note').insert(parsed.data).select('id').single()
  if (error) {
    // the insert policy refuses whoever is not in the project
    if (error.code === '42501') return { ok: false, errore: 'Solo chi fa parte del progetto scrive le note.' }
    return { ok: false, errore: messaggioErrore(error, 'Nota non salvata. Riprova.') }
  }

  revalidatePath(`/progetti/${parsed.data.progetto_id}/note`)
  return { ok: true, id: data.id }
}

export async function modificaNota(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = modificaNotaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSessione(ctx)
  if (negato) return { ok: false, errore: negato }

  const { id, data, testo } = parsed.data
  const { data: nota, error } = await ctx.db
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

/** The app only: never from Claude. */
export async function eliminaNota(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = eliminaNotaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSessione(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.from('pm_note').delete().eq('id', parsed.data.id).select('progetto_id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Nota non eliminata. Riprova.') }
  if (!data || data.length === 0) return { ok: false, errore: 'Puoi eliminare solo le tue note.' }

  revalidatePath(`/progetti/${data[0].progetto_id}/note`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Time: self-declared (CLAUDE.md section 17), always one's own. Minutes of a
// timer or of a range are computed by the database.
// ---------------------------------------------------------------------------
export async function avviaTimer(ctx: Contesto, input: unknown): Promise<EsitoVoce> {
  const parsed = avviaTimerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSessione(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data: id, error } = await ctx.db.rpc('pm_avvia_timer', {
    p_progetto_id: parsed.data.progetto_id,
    p_task_id: parsed.data.task_id ?? undefined,
    p_nota: parsed.data.nota ?? undefined,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Timer non avviato. Riprova.') }

  aggiornaTempo(parsed.data.progetto_id)
  return { ok: true, id: id ?? null }
}

export async function fermaTimer(ctx: Contesto, input: unknown): Promise<EsitoFermo> {
  const parsed = fermaTimerSchema.safeParse(input ?? {})
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSessione(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data: id, error } = await ctx.db.rpc('pm_ferma_timer', { p_nota: parsed.data.nota ?? undefined })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Timer non fermato. Riprova.') }
  // already stopped elsewhere (another device): nothing to do, the screens catch up
  if (!id) {
    aggiornaTempo()
    return { ok: true, minuti: null, id: null }
  }

  const { data: voce } = await ctx.db.from('pm_tempo').select('minuti, progetto_id').eq('id', id).maybeSingle()
  aggiornaTempo(voce?.progetto_id)
  return { ok: true, minuti: voce?.minuti ?? null, id }
}

/**
 * Time typed afterwards: minutes, or "Dalle"–"Alle" on its day. With a range
 * the database builds start and end in Europe/Rome and computes the minutes
 * (pm_registra_tempo).
 */
export async function registraTempo(ctx: Contesto, input: unknown): Promise<EsitoVoce> {
  const parsed = tempoManualeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSessione(ctx)
  if (negato) return { ok: false, errore: negato }

  const { progetto_id, task_id, data, durata, dalle, alle, nota } = parsed.data
  const { data: id, error } = await ctx.db.rpc('pm_registra_tempo', {
    p_progetto_id: progetto_id,
    p_data: data,
    ...(dalle && alle ? { p_dalle: dalle, p_alle: alle } : { p_minuti: durata }),
    p_task_id: task_id ?? undefined,
    p_nota: nota ?? undefined,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Tempo non salvato. Riprova.') }

  aggiornaTempo(progetto_id)
  return { ok: true, id: id ?? null }
}

/**
 * Correcting an entry (pm_modifica_tempo): its range can be added, changed or
 * removed, and removing it keeps the minutes typed. The same range as before
 * keeps a timer's seconds; a timer across midnight keeps its start and end
 * while its day and minutes stay.
 */
export async function modificaTempo(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = modificaTempoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSessione(ctx)
  if (negato) return { ok: false, errore: negato }

  const { id, progetto_id, task_id, data, durata, dalle, alle, nota } = parsed.data
  const { data: prima, error: errorePrima } = await ctx.db.from('pm_tempo').select('progetto_id').eq('id', id).maybeSingle()
  if (errorePrima) return { ok: false, errore: 'Voce non aggiornata. Riprova.' }
  if (!prima) return { ok: false, errore: 'Voce non trovata.' }

  const { data: aggiornata, error } = await ctx.db.rpc('pm_modifica_tempo', {
    p_id: id,
    p_progetto_id: progetto_id,
    p_data: data,
    ...(dalle && alle ? { p_dalle: dalle, p_alle: alle } : { p_minuti: durata }),
    p_task_id: task_id ?? undefined,
    p_nota: nota ?? undefined,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Voce non aggiornata. Riprova.') }
  if (!aggiornata) return { ok: false, errore: 'Puoi correggere solo il tuo tempo.' }

  aggiornaTempo(progetto_id)
  if (prima.progetto_id !== progetto_id) aggiornaTempo(prima.progetto_id)
  return { ok: true }
}

/** The app only: never from Claude. */
export async function eliminaTempo(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = eliminaTempoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error) }
  const negato = await negaSessione(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.from('pm_tempo').delete().eq('id', parsed.data.id).select('progetto_id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Voce non eliminata. Riprova.') }
  if (!data || data.length === 0) return { ok: false, errore: 'Puoi eliminare solo il tuo tempo.' }

  aggiornaTempo(data[0].progetto_id)
  return { ok: true }
}
