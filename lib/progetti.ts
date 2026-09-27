/**
 * Projects area: labels, filters and the task tree. Pure presentation logic:
 * progress, late tasks and counts come from the SQL views (v_pm_*).
 */
import type { Database } from '@/lib/supabase/database.types'
import type { LivelloPm } from '@/lib/auth/roles'

export type StatoProgetto = Database['public']['Enums']['pm_stato_progetto']
export type StatoTask = Database['public']['Enums']['pm_stato_task']
export type Priorita = Database['public']['Enums']['pm_priorita']

export const ETICHETTA_STATO_PROGETTO: Record<StatoProgetto, string> = {
  attivo: 'Attivo',
  in_pausa: 'In pausa',
  completato: 'Completato',
  archiviato: 'Archiviato',
}

export const ETICHETTA_STATO_TASK: Record<StatoTask, string> = {
  da_fare: 'Da fare',
  in_corso: 'In corso',
  in_revisione: 'In revisione',
  completato: 'Completato',
}

export const ETICHETTA_PRIORITA: Record<Priorita, string> = {
  bassa: 'Bassa',
  media: 'Media',
  alta: 'Alta',
}

/** Admin and manager open new projects; employees work inside them. */
export function puoCreareProgetti(livello: LivelloPm): boolean {
  return livello === 'admin' || livello === 'manager'
}

/** "Marco Coach" -> "MC", "Dany" -> "D". */
export function iniziali(nome: string | null | undefined): string {
  const parole = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  return parole
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase('it-IT'))
    .join('')
}

// ---------------------------------------------------------------------------
// Estimates: people type "45m", "2h", "1h 30m", "1:30" or plain minutes
// ---------------------------------------------------------------------------
const MAX_STIMA = 100_000

/**
 * Minutes from what people type. null for an empty field, undefined when the
 * text cannot be read. A plain number is minutes; hours need "h" or "h:mm".
 */
export function parseStima(valore: string | number | null | undefined): number | null | undefined {
  if (valore === null || valore === undefined) return null
  if (typeof valore === 'number') {
    return Number.isInteger(valore) && valore > 0 && valore <= MAX_STIMA ? valore : undefined
  }
  const testo = valore.trim().toLowerCase().replace(/\s+/g, ' ')
  if (testo === '') return null

  let minuti: number | null = null
  const orologio = /^(\d{1,3}):([0-5]\d)$/.exec(testo)
  const soloMinuti = /^(\d{1,6}) ?(m|min|minuti)?$/.exec(testo)
  const oreEMinuti = /^(\d{1,3}(?:[.,]\d{1,2})?) ?(h|ora|ore)(?: ?(\d{1,2}) ?(m|min|minuti)?)?$/.exec(testo)

  if (orologio) minuti = Number(orologio[1]) * 60 + Number(orologio[2])
  else if (soloMinuti) minuti = Number(soloMinuti[1])
  else if (oreEMinuti) {
    minuti = Math.round(Number(oreEMinuti[1].replace(',', '.')) * 60) + Number(oreEMinuti[3] ?? 0)
  }

  if (minuti === null || !Number.isInteger(minuti) || minuti <= 0 || minuti > MAX_STIMA) return undefined
  return minuti
}

/** 45 -> "45 min", 120 -> "2 h", 90 -> "1 h 30 min". Reads back through parseStima. */
export function formatStima(minuti: number | null | undefined): string {
  if (!minuti || minuti <= 0) return ''
  const ore = Math.floor(minuti / 60)
  const resto = minuti % 60
  if (ore === 0) return `${resto} min`
  return resto === 0 ? `${ore} h` : `${ore} h ${resto} min`
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
export const FILTRI_STATO_PROGETTO = {
  attivi: 'Attivi',
  in_pausa: 'In pausa',
  completati: 'Completati',
  archiviati: 'Archiviati',
  tutti: 'Tutti',
} as const
export type FiltroStatoProgetto = keyof typeof FILTRI_STATO_PROGETTO

/** The project states each filter shows (null = every state). */
export const STATI_DEL_FILTRO: Record<FiltroStatoProgetto, StatoProgetto[] | null> = {
  attivi: ['attivo'],
  in_pausa: ['in_pausa'],
  completati: ['completato'],
  archiviati: ['archiviato'],
  tutti: null,
}

export function parseFiltroStatoProgetto(valore: unknown): FiltroStatoProgetto {
  return typeof valore === 'string' && Object.hasOwn(FILTRI_STATO_PROGETTO, valore) ? (valore as FiltroStatoProgetto) : 'attivi'
}

export const FILTRI_STATO_TASK = {
  tutti: 'Tutti gli stati',
  aperti: 'Aperti',
  in_ritardo: 'In ritardo',
  da_fare: 'Da fare',
  in_corso: 'In corso',
  in_revisione: 'In revisione',
  completato: 'Completati',
} as const
export type FiltroStatoTask = keyof typeof FILTRI_STATO_TASK

export function parseFiltroStatoTask(valore: unknown): FiltroStatoTask {
  return typeof valore === 'string' && Object.hasOwn(FILTRI_STATO_TASK, valore) ? (valore as FiltroStatoTask) : 'tutti'
}

// ---------------------------------------------------------------------------
// Task tree: lists -> tasks -> sub-tasks (one level)
// ---------------------------------------------------------------------------
export type TaskMinimo = {
  id: string
  parent_id: string | null
  tasklist_id: string | null
  stato: StatoTask
  assegnatario_id: string | null
  in_ritardo: boolean
}

export type FiltroTask = { stato: FiltroStatoTask; soloMiei: boolean; io: string }

export function filtroAttivo(f: Pick<FiltroTask, 'stato' | 'soloMiei'>): boolean {
  return f.stato !== 'tutti' || f.soloMiei
}

export function corrisponde(task: TaskMinimo, f: FiltroTask): boolean {
  if (f.soloMiei && task.assegnatario_id !== f.io) return false
  switch (f.stato) {
    case 'tutti':
      return true
    case 'aperti':
      return task.stato !== 'completato'
    case 'in_ritardo':
      return task.in_ritardo
    default:
      return task.stato === f.stato
  }
}

export type NodoTask<T> = { task: T; figli: T[] }

/**
 * Groups the tasks by list, sub-tasks under their parent, keeping the order
 * they come in. With a filter, a parent stays when it matches or one of its
 * sub-tasks does; a sub-task stays only when it matches.
 * The key of a task without a list is ''.
 */
export function alberoTask<T extends TaskMinimo>(tasks: readonly T[], f: FiltroTask): Map<string, NodoTask<T>[]> {
  const conFiltro = filtroAttivo(f)
  const ids = new Set(tasks.map((t) => t.id))
  const figli = new Map<string, T[]>()
  for (const t of tasks) {
    if (t.parent_id && ids.has(t.parent_id)) {
      const elenco = figli.get(t.parent_id) ?? []
      elenco.push(t)
      figli.set(t.parent_id, elenco)
    }
  }

  const perLista = new Map<string, NodoTask<T>[]>()
  for (const t of tasks) {
    if (t.parent_id && ids.has(t.parent_id)) continue
    const tutti = figli.get(t.id) ?? []
    const visibili = conFiltro ? tutti.filter((c) => corrisponde(c, f)) : tutti
    if (conFiltro && !corrisponde(t, f) && visibili.length === 0) continue
    const chiave = t.tasklist_id ?? ''
    const elenco = perLista.get(chiave) ?? []
    elenco.push({ task: t, figli: visibili })
    perLista.set(chiave, elenco)
  }
  return perLista
}

/** New order of ids after moving one up or down; null when it cannot move. */
export function spostaInOrdine(ids: readonly string[], id: string, direzione: 'su' | 'giu'): string[] | null {
  const da = ids.indexOf(id)
  if (da < 0) return null
  const a = direzione === 'su' ? da - 1 : da + 1
  if (a < 0 || a >= ids.length) return null
  const nuovo = [...ids]
  ;[nuovo[da], nuovo[a]] = [nuovo[a]!, nuovo[da]!]
  return nuovo
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Route and search params arrive as free text: only a uuid reaches a query. */
export function isUuid(valore: unknown): valore is string {
  return typeof valore === 'string' && UUID.test(valore)
}
