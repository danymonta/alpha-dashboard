'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { Priorita, StatoTask } from '@/lib/progetti'

/** One row of v_pm_task: in_ritardo and the sub-task counts come from SQL. */
export type TaskVista = {
  id: string
  progetto_id: string
  tasklist_id: string | null
  parent_id: string | null
  titolo: string
  descrizione: string | null
  stato: StatoTask
  priorita: Priorita
  /** Who works on it, ordered by name: none, one or more members. */
  assegnatari: string[]
  data_inizio: string | null
  scadenza: string | null
  stima_minuti: number | null
  created_by: string | null
  in_ritardo: boolean
  sotto_task_totali: number
  sotto_task_completati: number
}

/** One row of v_pm_tasklist, progress included. */
export type ListaVista = {
  id: string
  nome: string
  descrizione: string | null
  data_inizio: string | null
  data_fine: string | null
  task_totali: number
  task_completati: number
  task_in_ritardo: number
  avanzamento: number | null
}

export type Persona = { id: string; nome: string }

type Attivita = {
  progettoId: string
  /** The signed-in person. */
  io: string
  /** pm_puo_gestire: lists, every task, members. The UI only hides: RLS decides. */
  gestisce: boolean
  membri: Persona[]
  liste: { id: string; nome: string }[]
  tasks: TaskVista[]
  /** The task the link asked for (?task, 05/10/2026): its sheet opens by itself. */
  daAprire: string | null
  /** The task the link brought me to: its row stays marked for the visit. */
  evidenziato: string | null
  /** Its sheet closed: ?task leaves the address, a reload does not open it again. */
  scordaLink: () => void
}

const Contesto = createContext<Attivita | null>(null)

export function ContestoAttivita({ valore, children }: { valore: Attivita; children: ReactNode }) {
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>
}

export function useAttivita(): Attivita {
  const valore = useContext(Contesto)
  if (!valore) throw new Error('useAttivita fuori da ContestoAttivita')
  return valore
}

/** Who may change a task: who manages the project, one of its assignees, its author (same rule as RLS). */
export function puoModificare(a: Pick<Attivita, 'gestisce' | 'io'>, t: Pick<TaskVista, 'assegnatari' | 'created_by'>) {
  return a.gestisce || t.assegnatari.includes(a.io) || t.created_by === a.io
}

/** Who may delete it: who manages the project, or its author. */
export function puoEliminare(a: Pick<Attivita, 'gestisce' | 'io'>, t: Pick<TaskVista, 'created_by'>) {
  return a.gestisce || t.created_by === a.io
}
