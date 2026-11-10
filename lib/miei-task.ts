/**
 * "I miei task" (/task): the groups by due date, the tasks just ticked that
 * stay where they were, and the words of the "Completati" section. Pure
 * presentation: which tasks are mine, their state, when they were closed and
 * how many are closed come from the database (v_pm_task, RLS).
 */
import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import type { Priorita, StatoTask } from '@/lib/progetti'

/** An open task assigned to me (also to others: `con` says who). */
export type MioTask = {
  id: string
  titolo: string
  stato: StatoTask
  /** Alta, media, bassa: the colour and the order of a card on the board (1.75.0). */
  priorita: Priorita
  scadenza: string | null
  in_ritardo: boolean
  progetto_id: string
  progetto: string
  /** The other people it is assigned to, by name; empty when it is mine alone. */
  con: string[]
  /** created_at: after the due date, the order of the page (as the query sorts it). */
  creato_il: string
}

/** A completed task assigned to me, for the "Completati" section. */
export type MioTaskCompletato = {
  id: string
  titolo: string
  scadenza: string | null
  progetto_id: string
  progetto: string
  /** When it was closed (timestamptz), set by the database. */
  completato_il: string | null
}

export type ChiaveGruppo = 'ritardo' | 'oggi' | 'settimana' | 'dopo' | 'senza'

export const GRUPPI: readonly { chiave: ChiaveGruppo; titolo: string }[] = [
  { chiave: 'ritardo', titolo: 'In ritardo' },
  { chiave: 'oggi', titolo: 'Oggi' },
  { chiave: 'settimana', titolo: 'Prossimi 7 giorni' },
  { chiave: 'dopo', titolo: 'Più avanti' },
  { chiave: 'senza', titolo: 'Senza scadenza' },
]

/** The group of a due date ('YYYY-MM-DD'), today being `oggi` in Europe/Rome. */
export function gruppoDi(scadenza: string | null, oggi: string): ChiaveGruppo {
  if (!scadenza) return 'senza'
  if (scadenza < oggi) return 'ritardo'
  if (scadenza === oggi) return 'oggi'
  return scadenza <= aggiungiGiorni(oggi, 7) ? 'settimana' : 'dopo'
}

export function titoloGruppo(chiave: ChiaveGruppo): string {
  return GRUPPI.find((g) => g.chiave === chiave)!.titolo
}

/** "Completati" opens on the most recent ones; "Mostra tutti" asks for the rest. */
export const COMPLETATI_RECENTI = 30
/** Even "all" stops here: the most rows the API gives in one read (supabase/config.toml). */
export const COMPLETATI_MAX = 1000

/** `?completati=tutti`: every completed task, not only the most recent. */
export function mostraTuttiICompletati(valore: unknown): boolean {
  return valore === 'tutti'
}

/**
 * What I did to a task while the page is open. A task I tick stays in its
 * place, ticked and struck through, until I leave the page (the server already
 * counts it among the completed ones); Annulla reopens it where it is.
 * - completato: ticked here (the server may not have answered yet);
 * - riapertura: being reopened (Annulla, or unticked);
 * - riaperto: reopened: it bridges the moment before the server's list has
 *   it, the server's row wins as soon as it is there, and the server's next
 *   list ends it (scordaRiaperti): closed again elsewhere, it is not kept open.
 */
export type Tocco = { task: MioTask; stato: 'completato' | 'riapertura' | 'riaperto' }

export type RigaAperta = {
  task: MioTask
  /** Ticked in this visit: checked, struck through, "Completato adesso". */
  completatoAdesso: boolean
}

/** The order of the query: due date (none last), then created_at, then id. */
function confronta(a: MioTask, b: MioTask): number {
  if (a.scadenza !== b.scadenza) {
    if (a.scadenza === null) return 1
    if (b.scadenza === null) return -1
    return a.scadenza < b.scadenza ? -1 : 1
  }
  const tempo = Date.parse(a.creato_il) - Date.parse(b.creato_il)
  if (tempo) return tempo
  if (a.creato_il !== b.creato_il) return a.creato_il < b.creato_il ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The rows of the open part: the server's open tasks plus the ones ticked in
 * this visit, each in its place. A tick wins over the server (it may not have
 * answered yet); a finished reopening gives way to the server's row.
 */
export function righeAperte(aperti: readonly MioTask[], tocchi: ReadonlyMap<string, Tocco>): RigaAperta[] {
  const dalServer = new Set(aperti.map((t) => t.id))
  const righe: RigaAperta[] = aperti.map((task) => {
    const tocco = tocchi.get(task.id)
    if (!tocco || tocco.stato === 'riaperto') return { task, completatoAdesso: false }
    return { task: tocco.task, completatoAdesso: tocco.stato === 'completato' }
  })
  for (const [id, tocco] of tocchi) {
    if (dalServer.has(id)) continue
    righe.push({ task: tocco.task, completatoAdesso: tocco.stato === 'completato' })
  }
  return righe.sort((a, b) => confronta(a.task, b.task))
}

export type GruppoMieiTask = {
  chiave: ChiaveGruppo
  titolo: string
  righe: RigaAperta[]
  /** The rows still to do: the ones ticked in this visit are not counted. */
  daFare: number
}

/** The non-empty groups, in the page's order. */
export function raggruppa(righe: readonly RigaAperta[], oggi: string): GruppoMieiTask[] {
  return GRUPPI.map(({ chiave, titolo }) => {
    const delGruppo = righe.filter((r) => gruppoDi(r.task.scadenza, oggi) === chiave)
    return { chiave, titolo, righe: delGruppo, daFare: delGruppo.filter((r) => !r.completatoAdesso).length }
  }).filter((g) => g.righe.length > 0)
}

/**
 * A new list from the server (after any action, or a visit) has the
 * reopenings in it: the "riaperto" bridges end there. The same map when there
 * is none, so nothing renders again.
 */
export function scordaRiaperti(tocchi: ReadonlyMap<string, Tocco>): ReadonlyMap<string, Tocco> {
  const dopo = new Map([...tocchi].filter(([, t]) => t.stato !== 'riaperto'))
  return dopo.size === tocchi.size ? tocchi : dopo
}

/**
 * The completed tasks to list: never twice, never lost. A task shown above
 * (ticked in this visit, or being reopened) stays there; any other closed task
 * is listed here.
 */
export function completatiDaMostrare(
  completati: readonly MioTaskCompletato[],
  sopra: readonly RigaAperta[],
): MioTaskCompletato[] {
  const mostrati = new Set(sopra.map((r) => r.task.id))
  return completati.filter((t) => !mostrati.has(t.id))
}

/** The words of etichettaCompletato; lib/i18n/testi/task.ts has them in English too (1.53.0). */
export const PAROLE_COMPLETATO = {
  completato: 'Completato',
  oggi: (ora: string) => `Completato oggi alle ${ora}`,
  ieri: (ora: string) => `Completato ieri alle ${ora}`,
  il: (data: string) => `Completato il ${data}`,
}
export type ParoleCompletato = typeof PAROLE_COMPLETATO

/**
 * "Completato oggi alle 18:42", "Completato ieri alle 09:05",
 * "Completato il 28/09/2026": the day in Europe/Rome. Another language passes
 * its words and its date format ("Completed on 28 Sep 2026").
 */
export function etichettaCompletato(
  completatoIl: string | null,
  oggi: string = oggiRoma(),
  parole: ParoleCompletato = PAROLE_COMPLETATO,
  data: (iso: string) => string = formatData,
): string {
  if (!completatoIl) return parole.completato
  const istante = new Date(completatoIl)
  if (Number.isNaN(istante.getTime())) return parole.completato
  const giorno = oggiRoma(istante)
  if (giorno === oggi) return parole.oggi(formatOra(istante))
  if (giorno === aggiungiGiorni(oggi, -1)) return parole.ieri(formatOra(istante))
  return parole.il(data(giorno))
}

// ---------------------------------------------------------------------------
// The board (1.75.0, Dany, 10/11/2026: «stile Trello dove aggiungo i task, ci
// sono le scadenze e visualmente so subito in base alla priorità e la data
// cosa fare»): the same groups as columns, every column even when empty.
// ---------------------------------------------------------------------------

export type VistaTask = 'bacheca' | 'elenco'

/** The view each person chose last: a cookie of this browser, one year, /task only. */
export const COOKIE_VISTA_TASK = 'alpha_vista_task'
const DURATA_COOKIE_VISTA_TASK = 60 * 60 * 24 * 365

export function vistaTaskDaUrl(valore: unknown): VistaTask | null {
  return valore === 'bacheca' || valore === 'elenco' ? valore : null
}

/** The address wins, then the remembered one, then the board. */
export function vistaTaskIniziale(daUrl: unknown, ricordata: unknown): VistaTask {
  return vistaTaskDaUrl(daUrl) ?? vistaTaskDaUrl(ricordata) ?? 'bacheca'
}

export function cookieVistaTask(vista: VistaTask, https: boolean): string {
  return `${COOKIE_VISTA_TASK}=${vista}; Path=/task; Max-Age=${DURATA_COOKIE_VISTA_TASK}; SameSite=Lax${https ? '; Secure' : ''}`
}

const PESO_PRIORITA: Record<Priorita, number> = { alta: 0, media: 1, bassa: 2 }

/** Inside a column: high priority first, then the nearest due date, then the page's order. */
export function confrontaBacheca(a: MioTask, b: MioTask): number {
  return PESO_PRIORITA[a.priorita] - PESO_PRIORITA[b.priorita] || confronta(a, b)
}

/** The five columns, in the page's order, each with its cards sorted for the board. */
export function colonneBacheca(righe: readonly RigaAperta[], oggi: string): GruppoMieiTask[] {
  return GRUPPI.map(({ chiave, titolo }) => {
    const delGruppo = righe
      .filter((r) => gruppoDi(r.task.scadenza, oggi) === chiave)
      .sort((a, b) => confrontaBacheca(a.task, b.task))
    return { chiave, titolo, righe: delGruppo, daFare: delGruppo.filter((r) => !r.completatoAdesso).length }
  })
}

/**
 * The due date a card gets when dropped on a column, or added there: today,
 * tomorrow, in two weeks, none. "In ritardo" takes nothing: a date in the past
 * is never chosen by moving a card. undefined = not a place to drop.
 */
export function scadenzaDellaColonna(chiave: ChiaveGruppo, oggi: string): string | null | undefined {
  switch (chiave) {
    case 'oggi':
      return oggi
    case 'settimana':
      return aggiungiGiorni(oggi, 1)
    case 'dopo':
      return aggiungiGiorni(oggi, 14)
    case 'senza':
      return null
    default:
      return undefined
  }
}
