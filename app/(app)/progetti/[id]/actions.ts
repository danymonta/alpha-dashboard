'use server'

import { contestoApp } from '@/lib/progetti/app'
import * as operazioni from '@/lib/progetti/operazioni'

export type Esito = { ok: true } | { ok: false; errore: string }

/**
 * Every action here goes through RLS: pm_puo_vedere / pm_puo_gestire decide.
 * The bodies are in lib/progetti/operazioni.ts, the one way projects, lists
 * and tasks are written from the app (and Alfire, through these actions) and
 * from Claude (MCP). The answers are the same as before: an id the core
 * returns stays here.
 */

function senzaId(esito: { ok: true; id: string } | { ok: false; errore: string }): Esito {
  return esito.ok ? { ok: true } : esito
}

// Tasks
export async function aggiungiTask(input: unknown): Promise<Esito> {
  return senzaId(await operazioni.aggiungiTask(await contestoApp(), input))
}

export async function completaTask(input: unknown): Promise<Esito> {
  return operazioni.completaTask(await contestoApp(), input)
}

export async function modificaTask(input: unknown): Promise<Esito & { avviso?: string }> {
  return operazioni.modificaTask(await contestoApp(), input)
}

export async function eliminaTask(input: unknown): Promise<Esito> {
  return operazioni.eliminaTask(await contestoApp(), input)
}

// Lists (milestones): who manages the project
export async function salvaLista(input: unknown): Promise<Esito> {
  return senzaId(await operazioni.salvaLista(await contestoApp(), input))
}

/** The tasks of the list go with it (on delete cascade): the sheet says so first. */
export async function eliminaLista(input: unknown): Promise<Esito> {
  return operazioni.eliminaLista(await contestoApp(), input)
}

export async function spostaLista(input: unknown): Promise<Esito> {
  return operazioni.spostaLista(await contestoApp(), input)
}

// The project itself
export async function modificaProgetto(input: unknown): Promise<Esito> {
  return operazioni.modificaProgetto(await contestoApp(), input)
}

/** Only the PM admin; lists, tasks, members, time and notes go with it. */
export async function eliminaProgetto(input: unknown): Promise<Esito> {
  return operazioni.eliminaProgetto(await contestoApp(), input)
}

// Members
export async function aggiungiMembro(input: unknown): Promise<Esito> {
  return operazioni.aggiungiMembro(await contestoApp(), input)
}

/** "Coach del cliente" (02/10/2026): pm_scegli_coach does the rest in the database. */
export async function scegliCoach(input: unknown): Promise<Esito> {
  return operazioni.scegliCoach(await contestoApp(), input)
}

/** The database takes them off the tasks they were assigned to and clears them as person in charge. */
export async function togliMembro(input: unknown): Promise<Esito> {
  return operazioni.togliMembro(await contestoApp(), input)
}
