/**
 * Pure geometry of the project Gantt: which rows, in which order, and where
 * each bar or diamond sits on a single time axis. No React, no DOM: the
 * component only draws what these functions return.
 *
 * Dates are business dates 'YYYY-MM-DD'; end dates are inclusive (a task from
 * the 2nd to the 5th covers four day columns).
 */
import { aggiungiGiorni } from '@/lib/date'
import { parseDataISO } from '@/lib/format'
import { lunediDi } from '@/lib/tempo'

export type ScalaGantt = 'settimane' | 'mesi'

/** Width of one day, in px, per scale. */
export const PX_GIORNO: Record<ScalaGantt, number> = { settimane: 20, mesi: 5 }

/** The shortest window each scale shows, so a short project does not look cramped. */
// six weeks; three whole months (any three consecutive months have at least 89 days)
const GIORNI_MINIMI: Record<ScalaGantt, number> = { settimane: 42, mesi: 89 }

function giornoUTC(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
}

/** Signed number of days from `da` to `a` (0 when equal). */
export function giorniTra(da: string, a: string): number {
  return Math.round((giornoUTC(a) - giornoUTC(da)) / 86_400_000)
}

function primoDelMese(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

function fineDelMese(iso: string): string {
  const anno = Number(iso.slice(0, 4))
  const mese = Number(iso.slice(5, 7))
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate()
  return `${iso.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`
}

function meseSuccessivo(primo: string): string {
  const anno = Number(primo.slice(0, 4))
  const mese = Number(primo.slice(5, 7))
  return mese === 12 ? `${anno + 1}-01-01` : `${anno}-${String(mese + 1).padStart(2, '0')}-01`
}

export type DateElemento = { inizio: string | null; fine: string | null }

export type Forma =
  | { forma: 'barra'; inizio: string; fine: string }
  | { forma: 'rombo'; data: string; quale: 'scadenza' | 'inizio' }
  | { forma: 'nessuna' }

/**
 * Start and end: a bar. Only the end (a due date): a diamond on it. Only the
 * start: a diamond on the start. Neither: no mark (the "Senza date" list).
 */
export function formaDi({ inizio, fine }: DateElemento): Forma {
  if (inizio && fine) {
    return inizio <= fine ? { forma: 'barra', inizio, fine } : { forma: 'barra', inizio: fine, fine: inizio }
  }
  if (fine) return { forma: 'rombo', data: fine, quale: 'scadenza' }
  if (inizio) return { forma: 'rombo', data: inizio, quale: 'inizio' }
  return { forma: 'nessuna' }
}

export type Intervallo = { da: string; a: string }

/**
 * The window of the axis: every date of every mark plus today, aligned to
 * whole weeks (Monday to Sunday, one week of air on each side) or whole
 * months, and never shorter than the scale's minimum.
 */
export function intervalloGantt(forme: readonly Forma[], oggi: string, scala: ScalaGantt): Intervallo {
  const date = [oggi]
  for (const f of forme) {
    if (f.forma === 'barra') date.push(f.inizio, f.fine)
    else if (f.forma === 'rombo') date.push(f.data)
  }
  date.sort()
  const min = date[0]
  const max = date[date.length - 1]

  let da: string
  let a: string
  if (scala === 'settimane') {
    da = aggiungiGiorni(lunediDi(min), -7)
    a = aggiungiGiorni(lunediDi(max), 13)
  } else {
    da = primoDelMese(min)
    a = fineDelMese(max)
  }

  while (giorniTra(da, a) + 1 < GIORNI_MINIMI[scala]) {
    a = scala === 'settimane' ? aggiungiGiorni(a, 7) : fineDelMese(meseSuccessivo(primoDelMese(a)))
  }
  return { da, a }
}

/** Left edge of a day's column. */
export function xDi(data: string, da: string, scala: ScalaGantt): number {
  return giorniTra(da, data) * PX_GIORNO[scala]
}

/** Width of the whole axis. */
export function larghezzaAsse({ da, a }: Intervallo, scala: ScalaGantt): number {
  return (giorniTra(da, a) + 1) * PX_GIORNO[scala]
}

/** Centre of today's column: where the "Oggi" line goes. */
export function xOggi(oggi: string, { da }: Intervallo, scala: ScalaGantt): number {
  return xDi(oggi, da, scala) + PX_GIORNO[scala] / 2
}

export type Geometria =
  | { forma: 'barra'; x: number; larghezza: number }
  | { forma: 'rombo'; x: number }
  | { forma: 'nessuna' }

/** Where a mark sits: a bar covers its days end to end, a diamond sits mid-day. */
export function geometria(forma: Forma, { da }: Intervallo, scala: ScalaGantt): Geometria {
  const px = PX_GIORNO[scala]
  if (forma.forma === 'barra') {
    return {
      forma: 'barra',
      x: xDi(forma.inizio, da, scala),
      larghezza: (giorniTra(forma.inizio, forma.fine) + 1) * px,
    }
  }
  if (forma.forma === 'rombo') return { forma: 'rombo', x: xDi(forma.data, da, scala) + px / 2 }
  return { forma: 'nessuna' }
}

const meseBreve = new Intl.DateTimeFormat('it-IT', { month: 'short' })

function nomeMese(iso: string): string {
  return meseBreve.format(parseDataISO(iso)).replace('.', '')
}

export type Tacca = { data: string; x: number; etichetta: string }

/**
 * Axis ticks: every Monday ("22 set") on the week scale, every 1st of the
 * month ("ott", January with the year: "gen 27") on the month scale.
 */
export function tacche(intervallo: Intervallo, scala: ScalaGantt): Tacca[] {
  const { da, a } = intervallo
  const risultato: Tacca[] = []

  if (scala === 'settimane') {
    let giorno = lunediDi(da) < da ? aggiungiGiorni(lunediDi(da), 7) : lunediDi(da)
    while (giorno <= a) {
      risultato.push({ data: giorno, x: xDi(giorno, da, scala), etichetta: `${Number(giorno.slice(8, 10))} ${nomeMese(giorno)}` })
      giorno = aggiungiGiorni(giorno, 7)
    }
    return risultato
  }

  let primo = primoDelMese(da) < da ? meseSuccessivo(primoDelMese(da)) : primoDelMese(da)
  while (primo <= a) {
    const etichetta = primo.slice(5, 7) === '01' ? `${nomeMese(primo)} ${primo.slice(2, 4)}` : nomeMese(primo)
    risultato.push({ data: primo, x: xDi(primo, da, scala), etichetta })
    primo = meseSuccessivo(primo)
  }
  return risultato
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type ListaGantt = {
  id: string
  nome: string
  ordine: number
  data_inizio: string | null
  data_fine: string | null
}

export type TaskGantt = {
  id: string
  titolo: string
  tasklist_id: string | null
  parent_id: string | null
  ordine: number
  data_inizio: string | null
  scadenza: string | null
}

export type RigaGantt<L extends ListaGantt, T extends TaskGantt> =
  | {
      tipo: 'lista'
      lista: L
      forma: Forma
      /** true when the list has no dates of its own and spans its tasks. */
      derivata: boolean
    }
  | { tipo: 'gruppo'; nome: string }
  | { tipo: 'task'; task: T; forma: Forma; livello: 0 | 1 }

function perOrdine<X extends { ordine: number }>(nome: (x: X) => string) {
  return (x: X, y: X) => x.ordine - y.ordine || nome(x).localeCompare(nome(y), 'it')
}

/**
 * Rows of the chart, in reading order: each list (milestone) followed by its
 * tasks, each task by its sub-tasks; then the tasks outside any list. Tasks
 * without dates leave the chart for the "Senza date" list. A list without
 * dates of its own spans its dated tasks; a list with nothing to draw is left
 * out of the chart.
 */
export function organizzaGantt<L extends ListaGantt, T extends TaskGantt>(
  liste: readonly L[],
  task: readonly T[],
): { righe: RigaGantt<L, T>[]; senzaDate: T[] } {
  const idTask = new Set(task.map((t) => t.id))
  const idListe = new Set(liste.map((l) => l.id))
  const formaTask = new Map(task.map((t) => [t.id, formaDi({ inizio: t.data_inizio, fine: t.scadenza })]))
  const datato = (t: T) => formaTask.get(t.id)?.forma !== 'nessuna'
  const ordinaTask = perOrdine<T>((t) => t.titolo)

  // a sub-task whose parent is not visible stands on its own
  const principali = task.filter((t) => !t.parent_id || !idTask.has(t.parent_id))
  const figli = new Map<string, T[]>()
  for (const t of task) {
    if (t.parent_id && idTask.has(t.parent_id)) {
      figli.set(t.parent_id, [...(figli.get(t.parent_id) ?? []), t])
    }
  }

  function righeDi(gruppo: T[]): RigaGantt<L, T>[] {
    const righe: RigaGantt<L, T>[] = []
    for (const t of [...gruppo].sort(ordinaTask)) {
      if (datato(t)) righe.push({ tipo: 'task', task: t, forma: formaTask.get(t.id)!, livello: 0 })
      for (const f of [...(figli.get(t.id) ?? [])].sort(ordinaTask)) {
        // under a dated parent the sub-task is indented; otherwise it takes the parent's place
        if (datato(f)) righe.push({ tipo: 'task', task: f, forma: formaTask.get(f.id)!, livello: datato(t) ? 1 : 0 })
      }
    }
    return righe
  }

  function estensione(righe: RigaGantt<L, T>[]): Forma {
    const date: string[] = []
    for (const r of righe) {
      if (r.tipo !== 'task') continue
      if (r.forma.forma === 'barra') date.push(r.forma.inizio, r.forma.fine)
      else if (r.forma.forma === 'rombo') date.push(r.forma.data)
    }
    if (date.length === 0) return { forma: 'nessuna' }
    date.sort()
    return { forma: 'barra', inizio: date[0], fine: date[date.length - 1] }
  }

  const righe: RigaGantt<L, T>[] = []
  for (const lista of [...liste].sort(perOrdine<L>((l) => l.nome))) {
    const sue = righeDi(principali.filter((t) => t.tasklist_id === lista.id))
    const propria = formaDi({ inizio: lista.data_inizio, fine: lista.data_fine })
    const forma = propria.forma === 'nessuna' ? estensione(sue) : propria
    if (forma.forma === 'nessuna' && sue.length === 0) continue
    righe.push({ tipo: 'lista', lista, forma, derivata: propria.forma === 'nessuna' })
    righe.push(...sue)
  }

  const sciolte = righeDi(principali.filter((t) => !t.tasklist_id || !idListe.has(t.tasklist_id)))
  if (sciolte.length > 0) {
    if (righe.length > 0) righe.push({ tipo: 'gruppo', nome: 'Senza lista' })
    righe.push(...sciolte)
  }

  const ordineListe = new Map([...liste].sort(perOrdine<L>((l) => l.nome)).map((l, i) => [l.id, i]))
  const senzaDate = task
    .filter((t) => !datato(t))
    .sort(
      (x, y) =>
        (ordineListe.get(x.tasklist_id ?? '') ?? Number.MAX_SAFE_INTEGER) -
          (ordineListe.get(y.tasklist_id ?? '') ?? Number.MAX_SAFE_INTEGER) || ordinaTask(x, y),
    )

  return { righe, senzaDate }
}
