import { z } from 'zod'

import { isDataISO } from '@/lib/date'
import { parseStima } from '@/lib/progetti'
import { Constants } from '@/lib/supabase/database.types'

/**
 * Projects area. Every schema reads its own output again without changing it:
 * the client validates, the server action parses the same values once more.
 */
export const STATI_PROGETTO = Constants.public.Enums.pm_stato_progetto
export const STATI_TASK = Constants.public.Enums.pm_stato_task
export const PRIORITA = Constants.public.Enums.pm_priorita

const testoFacoltativo = (max: number) =>
  z
    .string()
    .max(max, `Al massimo ${max} caratteri`)
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null))

const idFacoltativo = z
  .union([z.string().uuid(), z.literal('')])
  .nullish()
  .transform((v) => v || null)

const dataFacoltativa = z
  .union([z.string().refine(isDataISO, 'Data non valida'), z.literal('')])
  .nullish()
  .transform((v) => v || null)

/** End after start, when both are there. */
function dateInOrdine(inizio: string, fine: string, messaggio: string) {
  return (v: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const a = v[inizio]
    const b = v[fine]
    if (typeof a === 'string' && typeof b === 'string' && b < a) {
      ctx.addIssue({ code: 'custom', path: [fine], message: messaggio })
    }
  }
}

/** Checkbox groups: one checkbox gives a string (or false), several give an array. */
const elencoId = z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []),
  z.array(z.string().uuid()).max(50, 'Al massimo 50 persone'),
)

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------
export const nuovoProgettoSchema = z
  .object({
    reparto_id: z.string().uuid('Scegli il reparto'),
    nome: z.string().trim().min(2, 'Scrivi il nome del progetto').max(120, 'Al massimo 120 caratteri'),
    descrizione: testoFacoltativo(2000),
    modello_id: idFacoltativo,
    client_id: idFacoltativo,
    data_inizio: dataFacoltativa,
    data_fine: dataFacoltativa,
    membri: elencoId,
  })
  .superRefine(dateInOrdine('data_inizio', 'data_fine', 'La fine viene dopo l’inizio'))

/**
 * Editing a project. client_id stays undefined when the form has no client
 * field (only the app admin has it): undefined means "leave it as it is".
 */
export const modificaProgettoSchema = z
  .object({
    id: z.string().uuid('Progetto non valido'),
    nome: z.string().trim().min(2, 'Scrivi il nome del progetto').max(120, 'Al massimo 120 caratteri'),
    // a project can move to another department (QA 28/09/2026: everything stays editable)
    reparto_id: z.string().uuid('Scegli il reparto'),
    descrizione: testoFacoltativo(2000),
    stato: z.enum(STATI_PROGETTO, { errorMap: () => ({ message: 'Scegli lo stato' }) }),
    data_inizio: dataFacoltativa,
    data_fine: dataFacoltativa,
    responsabile_id: idFacoltativo,
    client_id: z
      .union([z.string().uuid(), z.literal(''), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
  })
  .superRefine(dateInOrdine('data_inizio', 'data_fine', 'La fine viene dopo l’inizio'))

export const idSchema = z.object({ id: z.string().uuid() })

export const membroSchema = z.object({
  progetto_id: z.string().uuid(),
  profile_id: z.string().uuid('Scegli la persona'),
})

// ---------------------------------------------------------------------------
// Lists (milestones)
// ---------------------------------------------------------------------------
export const listaSchema = z
  .object({
    id: z.string().uuid().nullish().transform((v) => v ?? null),
    progetto_id: z.string().uuid(),
    nome: z.string().trim().min(1, 'Scrivi il nome della lista').max(120, 'Al massimo 120 caratteri'),
    descrizione: testoFacoltativo(1000),
    data_inizio: dataFacoltativa,
    data_fine: dataFacoltativa,
  })
  .superRefine(dateInOrdine('data_inizio', 'data_fine', 'La fine viene dopo l’inizio'))

export const spostaSchema = z.object({
  id: z.string().uuid(),
  direzione: z.enum(['su', 'giu']),
})

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export const nuovoTaskSchema = z.object({
  progetto_id: z.string().uuid(),
  tasklist_id: idFacoltativo,
  parent_id: idFacoltativo,
  titolo: z.string().trim().min(1, 'Scrivi il titolo del task').max(200, 'Al massimo 200 caratteri'),
  /** Who works on it, members of the project: none, one or more (the database checks membership). */
  assegnatari: elencoId,
})

/**
 * The board of I miei task (1.75.0): a task of mine added from a column, with
 * its due date and priority; it is assigned to whoever adds it.
 */
export const nuovoMioTaskSchema = z.object({
  progetto_id: z.string().uuid('Scegli il progetto'),
  titolo: z.string().trim().min(1, 'Scrivi il titolo del task').max(200, 'Al massimo 200 caratteri'),
  scadenza: dataFacoltativa,
  priorita: z.enum(PRIORITA, { errorMap: () => ({ message: 'Scegli la priorità' }) }).default('media'),
})

/** A card moved or retagged on the board: only the due date, only the priority, or both. */
export const taskRapidoSchema = z
  .object({
    id: z.string().uuid('Task non valido'),
    scadenza: dataFacoltativa.optional(),
    priorita: z.enum(PRIORITA, { errorMap: () => ({ message: 'Scegli la priorità' }) }).optional(),
  })
  .refine((v) => v.scadenza !== undefined || v.priorita !== undefined, 'Niente da cambiare')

export const completaTaskSchema = z.object({ id: z.string().uuid(), completato: z.boolean() })

const stima = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    const minuti = parseStima(v)
    if (minuti === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Scrivi la stima come 45 min, 2 h o 1 h 30 min' })
      return z.NEVER
    }
    return minuti
  })

export const modificaTaskSchema = z
  .object({
    id: z.string().uuid('Task non valido'),
    titolo: z.string().trim().min(1, 'Scrivi il titolo del task').max(200, 'Al massimo 200 caratteri'),
    descrizione: testoFacoltativo(5000),
    stato: z.enum(STATI_TASK, { errorMap: () => ({ message: 'Scegli lo stato' }) }),
    priorita: z.enum(PRIORITA, { errorMap: () => ({ message: 'Scegli la priorità' }) }),
    /** The whole list: who is not in it is no longer assigned. */
    assegnatari: elencoId,
    data_inizio: dataFacoltativa,
    scadenza: dataFacoltativa,
    stima_minuti: stima,
    tasklist_id: idFacoltativo,
    parent_id: idFacoltativo,
  })
  .superRefine(dateInOrdine('data_inizio', 'scadenza', 'La scadenza viene dopo l’inizio'))
  .superRefine((v, ctx) => {
    if (v.parent_id && v.parent_id === v.id) {
      ctx.addIssue({ code: 'custom', path: ['parent_id'], message: 'Un task non è sotto-task di sé stesso' })
    }
  })

// ---------------------------------------------------------------------------
// Settings: departments and templates (PM admin)
// ---------------------------------------------------------------------------
export const repartoSchema = z.object({
  id: z.string().uuid().nullish().transform((v) => v ?? null),
  nome: z.string().trim().min(2, 'Scrivi il nome del reparto').max(60, 'Al massimo 60 caratteri'),
  descrizione: testoFacoltativo(300),
  /** In this department a project is a client's path (Fitness Coaching). */
  progetti_con_cliente: z.boolean().default(false),
})

export const attivoSchema = z.object({ id: z.string().uuid(), attivo: z.boolean() })

export const modelloSchema = z.object({
  id: z.string().uuid().nullish().transform((v) => v ?? null),
  reparto_id: idFacoltativo,
  nome: z.string().trim().min(2, 'Scrivi il nome del modello').max(120, 'Al massimo 120 caratteri'),
  descrizione: testoFacoltativo(500),
  /** The template every paying client's project starts from (02/10/2026): one in the app. */
  per_nuovi_clienti: z.boolean().default(false),
})

const giorni = (minimo: number, messaggio: string) =>
  z.coerce
    .number({ invalid_type_error: messaggio })
    .int('Solo giorni interi')
    .min(minimo, messaggio)
    .max(3650, 'Al massimo 3650 giorni')

const vuotoANull = (v: unknown) => (v === '' || v === undefined ? null : v)

/** Days of a template item; empty: the item has no dates (02/10/2026). */
const giorniFacoltativi = (minimo: number, messaggio: string) => z.preprocess(vuotoANull, giorni(minimo, messaggio).nullable())

export const RUOLI = Constants.public.Enums.app_role

export const voceModelloSchema = z
  .object({
    id: z.string().uuid().nullish().transform((v) => v ?? null),
    modello_id: z.string().uuid(),
    /** Empty: the task stays outside any list. */
    tasklist: z
      .string()
      .trim()
      .max(120, 'Al massimo 120 caratteri')
      .nullish()
      .transform((v) => (v ? v : null)),
    titolo: z.string().trim().min(1, 'Scrivi il titolo').max(200, 'Al massimo 200 caratteri'),
    descrizione: testoFacoltativo(2000),
    ordine: z.coerce.number({ invalid_type_error: 'Scrivi un numero' }).int('Solo numeri interi').min(0, 'Da 0 in su').max(9999),
    /** Both empty: a task without dates, open for the whole project. */
    inizio_giorni: giorniFacoltativi(0, 'Da 0 in su: 0 è il giorno di inizio del progetto'),
    durata_giorni: giorniFacoltativi(1, 'Almeno un giorno'),
    /** Who does it in a client's project when it is not the coach (the meal plan: nutrition). */
    per_ruolo: z.preprocess(vuotoANull, z.enum(RUOLI).nullable()),
  })
  .superRefine((v, ctx) => {
    if ((v.inizio_giorni === null) !== (v.durata_giorni === null)) {
      ctx.addIssue({
        code: 'custom',
        path: [v.inizio_giorni === null ? 'inizio_giorni' : 'durata_giorni'],
        message: 'Scrivi sia da che giorno sia quanti giorni, o togli le date',
      })
    }
  })

export type NuovoProgettoInput = z.input<typeof nuovoProgettoSchema>
export type ModificaProgettoInput = z.input<typeof modificaProgettoSchema>
export type MembroInput = z.input<typeof membroSchema>
export type ListaInput = z.input<typeof listaSchema>
export type NuovoTaskInput = z.input<typeof nuovoTaskSchema>
export type ModificaTaskInput = z.input<typeof modificaTaskSchema>
export type NuovoMioTaskInput = z.input<typeof nuovoMioTaskSchema>
export type RepartoInput = z.input<typeof repartoSchema>
export type ModelloInput = z.input<typeof modelloSchema>
export type VoceModelloInput = z.input<typeof voceModelloSchema>
