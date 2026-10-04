/**
 * Timeline of the projects (Dany, 05/10/2026): one bar per project from its
 * start to its end, department by department, the soonest end first, to see
 * at a glance who is finishing and when. Pure functions: which projects go on
 * the chart and in which order, how many days are left, the window and the
 * ticks of the time axis. No React, no DOM.
 *
 * Dates are business dates 'YYYY-MM-DD'; "today" is Europe/Rome and comes from
 * the caller (oggiRoma). Day counts are calendar days, never hours: a change
 * of daylight saving time in between does not move them.
 */
import { aggiungiGiorni } from '@/lib/date'
import { formatData, formatMeseBreve } from '@/lib/format'
import { formaDi, giorniTra, type Forma } from '@/lib/gantt'
import type { StatoProgetto } from '@/lib/progetti'

// ---------------------------------------------------------------------------
// The view of /progetti
// ---------------------------------------------------------------------------
export type VistaProgetti = 'elenco' | 'timeline'

/** ?vista=timeline opens the timeline; anything else is the list of cards. */
export function parseVistaProgetti(valore: unknown): VistaProgetti {
  return valore === 'timeline' ? 'timeline' : 'elenco'
}

// ---------------------------------------------------------------------------
// End of a project: days left, "in scadenza"
// ---------------------------------------------------------------------------

/** A project still open that ends within this many days is "in scadenza": icon and words. */
export const GIORNI_IN_SCADENZA = 30

export type FineProgetto =
  /** Completed or archived: its end no longer matters. */
  | { tipo: 'chiuso' }
  | { tipo: 'senza_fine' }
  /** The end is past and the project is still active or paused. */
  | { tipo: 'finito'; data: string; giorni: number }
  /** From today to GIORNI_IN_SCADENZA days. */
  | { tipo: 'in_scadenza'; data: string; giorni: number }
  | { tipo: 'futura'; data: string; giorni: number }

/**
 * Where a project stands against its end, today (Europe/Rome). Past its end
 * is what the database says (v_pm_progetti.scaduto: active or paused, end
 * before today), never recomputed here; the days left are only words.
 */
export function fineProgetto(
  { stato, data_fine, scaduto }: { stato: StatoProgetto; data_fine: string | null; scaduto: boolean },
  oggi: string,
): FineProgetto {
  if (stato === 'completato' || stato === 'archiviato') return { tipo: 'chiuso' }
  if (!data_fine) return { tipo: 'senza_fine' }
  const giorni = giorniTra(oggi, data_fine)
  if (scaduto) return { tipo: 'finito', data: data_fine, giorni }
  // a midnight in between the two "today": never a negative count in words
  const restano = Math.max(0, giorni)
  if (restano <= GIORNI_IN_SCADENZA) return { tipo: 'in_scadenza', data: data_fine, giorni: restano }
  return { tipo: 'futura', data: data_fine, giorni: restano }
}

/**
 * A client's path still running without a coach (02/10/2026): a mark beside
 * its end on the timeline, with its words in the legend and in the bar's
 * label. Not once the path is over, completed or archived.
 */
export function senzaCoachDaSegnalare(
  { per_cliente, coach }: { per_cliente: boolean; coach: string | null },
  fine: FineProgetto,
): boolean {
  return per_cliente && coach === null && (fine.tipo === 'in_scadenza' || fine.tipo === 'futura')
}

/**
 * The end in words: "finisce oggi", "finisce domani", "tra 17 giorni";
 * past, a client's path "finito il 04/10/2026" (nothing late about it, as on
 * the card), any other project "doveva finire il 04/10/2026".
 */
export function testoFine(fine: FineProgetto, perCliente: boolean): string {
  switch (fine.tipo) {
    case 'chiuso':
    case 'senza_fine':
      return ''
    case 'finito':
      return perCliente ? `finito il ${formatData(fine.data)}` : `doveva finire il ${formatData(fine.data)}`
    default:
      if (fine.giorni === 0) return 'finisce oggi'
      if (fine.giorni === 1) return 'finisce domani'
      return `tra ${fine.giorni} giorni`
  }
}

// ---------------------------------------------------------------------------
// Which projects go on the chart, in which order
// ---------------------------------------------------------------------------
export type DateProgetto = { nome: string; data_inizio: string | null; data_fine: string | null }

/**
 * A project with an end goes on the chart: a bar from its start to its end,
 * or a diamond on the end when the start is missing. Without an end it is
 * listed apart ("Senza data di fine"): the chart is about when things finish.
 */
export function formaProgetto({ data_inizio, data_fine }: Pick<DateProgetto, 'data_inizio' | 'data_fine'>): Forma {
  if (!data_fine) return { forma: 'nessuna' }
  return formaDi({ inizio: data_inizio, fine: data_fine })
}

/** The soonest end first; same end, the earlier start; then by name. */
export function perFine(a: DateProgetto, b: DateProgetto): number {
  const fineA = a.data_fine ?? '9999-12-31'
  const fineB = b.data_fine ?? '9999-12-31'
  if (fineA !== fineB) return fineA < fineB ? -1 : 1
  const inizioA = a.data_inizio ?? '0000-01-01'
  const inizioB = b.data_inizio ?? '0000-01-01'
  if (inizioA !== inizioB) return inizioA < inizioB ? -1 : 1
  return a.nome.localeCompare(b.nome, 'it')
}

/** The projects of one department: those on the chart by end, and those without an end. */
export function dividiPerFine<P extends DateProgetto>(progetti: readonly P[]): { sulGrafico: P[]; senzaFine: P[] } {
  const sulGrafico = progetti.filter((p) => formaProgetto(p).forma !== 'nessuna').sort(perFine)
  const senzaFine = progetti
    .filter((p) => formaProgetto(p).forma === 'nessuna')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  return { sulGrafico, senzaFine }
}

// ---------------------------------------------------------------------------
// Time axis
// ---------------------------------------------------------------------------
export type ScalaTimeline = 'mesi' | 'trimestri'

/**
 * The narrowest day, in px: a month is at least 150px; a quarter at least
 * 90px, room for its name ("ott–dic 26", about 70px). By quarter, a year and
 * a half fits the axis of a computer (about 700px).
 */
export const PX_GIORNO_MINIMO: Record<ScalaTimeline, number> = { mesi: 5, trimestri: 1 }

/**
 * Width of one day as a CSS length, for an axis that is a size container:
 * the whole window fits the visible width (minus `ariaPx`, the room after the
 * furthest end), never narrower than the scale's minimum. Quarters show
 * everything on a computer and scroll on a phone; months zoom in. Pure CSS:
 * no measuring, nothing re-rendered on resize or scroll.
 */
export function giornoCss(scala: ScalaTimeline, giorni: number, ariaPx: number): string {
  return `max(${PX_GIORNO_MINIMO[scala]}px, (100cqw - ${ariaPx + 1}px) / ${Math.max(1, giorni)})`
}

/** The window never reaches further than this from today: a typo in a year does not stretch the axis. */
const MESI_PRIMA_MAX = 24
const MESI_DOPO_MAX = 36
/** The shortest window per scale, so a few short projects do not look cramped. */
const MESI_MINIMI: Record<ScalaTimeline, number> = { mesi: 6, trimestri: 12 }

export type Intervallo = { da: string; a: string }

function primoDelMese(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** 'YYYY-MM-01' moved by n months. */
export function aggiungiMesi(primo: string, n: number): string {
  const indice = Number(primo.slice(0, 4)) * 12 + Number(primo.slice(5, 7)) - 1 + n
  const anno = Math.floor(indice / 12)
  const mese = (indice % 12) + 1
  return `${anno}-${String(mese).padStart(2, '0')}-01`
}

function ultimoDelMese(iso: string): string {
  const anno = Number(iso.slice(0, 4))
  const mese = Number(iso.slice(5, 7))
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate()
  return `${iso.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`
}

function primoDelTrimestre(iso: string): string {
  const mese = Number(iso.slice(5, 7))
  const primoMese = Math.floor((mese - 1) / 3) * 3 + 1
  return `${iso.slice(0, 4)}-${String(primoMese).padStart(2, '0')}-01`
}

function mesiTra(primoDa: string, primoA: string): number {
  return (
    (Number(primoA.slice(0, 4)) - Number(primoDa.slice(0, 4))) * 12 + Number(primoA.slice(5, 7)) - Number(primoDa.slice(5, 7))
  )
}

/** First day of the month before today's: where the chart opens ("from a month ago"). */
export function inizioVista(oggi: string): string {
  return aggiungiMesi(primoDelMese(oggi), -1)
}

/**
 * The window of the axis: every start and end of the marks, today and the
 * month before it, aligned to whole months (or whole quarters), never longer
 * than MESI_PRIMA_MAX months back and MESI_DOPO_MAX ahead (a mark beyond is
 * cut at the edge), never shorter than the scale's minimum.
 */
export function intervalloTimeline(forme: readonly Forma[], oggi: string, scala: ScalaTimeline): Intervallo {
  const date = [oggi, inizioVista(oggi)]
  for (const f of forme) {
    if (f.forma === 'barra') date.push(f.inizio, f.fine)
    else if (f.forma === 'rombo') date.push(f.data)
  }
  date.sort()
  const limitePrima = aggiungiMesi(primoDelMese(oggi), -MESI_PRIMA_MAX)
  const limiteDopo = ultimoDelMese(aggiungiMesi(primoDelMese(oggi), MESI_DOPO_MAX))
  const min = date[0] < limitePrima ? limitePrima : date[0]
  const max = date[date.length - 1] > limiteDopo ? limiteDopo : date[date.length - 1]

  const da = scala === 'trimestri' ? primoDelTrimestre(min) : primoDelMese(min)
  let ultimoMese = scala === 'trimestri' ? aggiungiMesi(primoDelTrimestre(max), 2) : primoDelMese(max)
  // whole months (quarters) from `da` to `ultimoMese`, both included
  while (mesiTra(da, ultimoMese) + 1 < MESI_MINIMI[scala]) {
    ultimoMese = aggiungiMesi(ultimoMese, scala === 'trimestri' ? 3 : 1)
  }
  return { da, a: ultimoDelMese(ultimoMese) }
}

/** Left edge of a day's column. */
export function xData(data: string, da: string, px: number): number {
  return giorniTra(da, data) * px
}

/** Width of the whole axis. */
export function larghezzaTimeline({ da, a }: Intervallo, px: number): number {
  return (giorniTra(da, a) + 1) * px
}

/** Centre of today's column: where the "Oggi" line goes. */
export function xOggiTimeline(oggi: string, { da }: Intervallo, px: number): number {
  return xData(oggi, da, px) + px / 2
}

export type GeometriaTimeline =
  | {
      forma: 'barra'
      x: number
      larghezza: number
      /** The bar starts before the window: drawn square at the left edge. */
      tagliataPrima: boolean
      /** The bar ends after the window: drawn square at the right edge. */
      tagliataDopo: boolean
    }
  | { forma: 'rombo'; x: number }
  | { forma: 'nessuna' }

/**
 * Where a mark sits: a bar covers its days end to end (cut at the edges of
 * the window), a diamond sits mid-day. Nothing to draw when it falls entirely
 * outside the window.
 */
export function geometriaTimeline(forma: Forma, { da, a }: Intervallo, px: number): GeometriaTimeline {
  if (forma.forma === 'barra') {
    if (forma.fine < da || forma.inizio > a) return { forma: 'nessuna' }
    const inizio = forma.inizio < da ? da : forma.inizio
    const fine = forma.fine > a ? a : forma.fine
    return {
      forma: 'barra',
      x: xData(inizio, da, px),
      larghezza: (giorniTra(inizio, fine) + 1) * px,
      tagliataPrima: forma.inizio < da,
      tagliataDopo: forma.fine > a,
    }
  }
  if (forma.forma === 'rombo') {
    if (forma.data < da || forma.data > a) return { forma: 'nessuna' }
    return { forma: 'rombo', x: xData(forma.data, da, px) + px / 2 }
  }
  return { forma: 'nessuna' }
}

export type TaccaTimeline = {
  data: string
  /** Days from the start of the window to the tick. */
  giorno: number
  /** Days of its period inside the window: its name stays in sight while the period is. */
  durata: number
  etichetta: string
}

/**
 * Axis ticks: every 1st of the month ("ott", January with the year: "gen 27"),
 * or every quarter ("ott–dic 26"). Positions in days from the start of the
 * window: the caller turns them into lengths.
 */
export function taccheTimeline(intervallo: Intervallo, scala: ScalaTimeline): TaccaTimeline[] {
  const { da, a } = intervallo
  const passo = scala === 'trimestri' ? 3 : 1
  const risultato: TaccaTimeline[] = []
  let primo = scala === 'trimestri' ? primoDelTrimestre(da) : primoDelMese(da)
  if (primo < da) primo = aggiungiMesi(primo, passo)
  while (primo <= a) {
    const etichetta =
      scala === 'trimestri'
        ? `${formatMeseBreve(primo).split(' ')[0]}–${formatMeseBreve(aggiungiMesi(primo, 2)).split(' ')[0]} ${primo.slice(2, 4)}`
        : formatMeseBreve(primo)
    const prossimo = aggiungiMesi(primo, passo)
    const ultimo = prossimo > a ? a : aggiungiGiorni(prossimo, -1)
    risultato.push({ data: primo, giorno: giorniTra(da, primo), durata: giorniTra(primo, ultimo) + 1, etichetta })
    primo = prossimo
  }
  return risultato
}
