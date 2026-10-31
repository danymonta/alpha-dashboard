/**
 * The month of the calendar view of the Piano editoriale (1.69.0, Dany,
 * 31/10/2026: «la parte di visualizzazione a calendario per i reel… come su
 * notion»): weeks from Monday to Sunday covering the month (Italian weeks), the
 * contents grouped by Post Date. Pure functions on business dates 'YYYY-MM-DD';
 * "today" (Europe/Rome) comes from the caller.
 */
import { aggiungiGiorni, fineMese, lunediDellaSettimana, primoDelMeseISO } from '@/lib/date'
import { Constants } from '@/lib/supabase/database.types'

import type { StatusContenuto } from './etichette'

export type GiornoGriglia = { data: string; delMese: boolean; oggi: boolean }

/** A day of the grid shows at most this many contents; the others are "+N". */
export const VISIBILI_PER_GIORNO = 3

/** The dots of a day of the phone's mini month: at most this many, then "+". */
export const PUNTI_PER_GIORNO = 3

/** The calendar's grid reads at most this many contents (a month is a few dozen). */
export const LIMITE_MESE = 500

/** The contents without a Post Date under the calendar: at most this many, the rest in the Tabella. */
export const LIMITE_SENZA_DATA = 50

/** The Status in the order of the work (the enum's): the legend above the calendar. */
export const ORDINE_STATUS: readonly StatusContenuto[] = Constants.public.Enums.contenuto_status

/** The Monday on or before the 1st, to the Sunday on or after the month's last day. */
export function intervalloGriglia(primo: string): { da: string; a: string } {
  const inizio = primoDelMeseISO(primo)
  return {
    da: lunediDellaSettimana(inizio),
    a: aggiungiGiorni(lunediDellaSettimana(fineMese(inizio)), 6),
  }
}

/** The weeks of the month, Monday to Sunday: 4 to 6 rows of 7 days. */
export function grigliaMese(primo: string, oggi: string): GiornoGriglia[][] {
  const mese = primoDelMeseISO(primo).slice(0, 7)
  const { da, a } = intervalloGriglia(primo)
  const settimane: GiornoGriglia[][] = []
  for (let lunedi = da; lunedi <= a; lunedi = aggiungiGiorni(lunedi, 7)) {
    settimane.push(
      Array.from({ length: 7 }, (_, i) => {
        const data = aggiungiGiorni(lunedi, i)
        return { data, delMese: data.slice(0, 7) === mese, oggi: data === oggi }
      }),
    )
  }
  return settimane
}

/** The contents by day, in the order they come; the ones without a Post Date apart. */
export function perGiorno<T extends { post_date: string | null }>(
  righe: readonly T[],
): { perData: Map<string, T[]>; senzaData: T[] } {
  const perData = new Map<string, T[]>()
  const senzaData: T[] = []
  for (const riga of righe) {
    if (!riga.post_date) {
      senzaData.push(riga)
      continue
    }
    const giorno = perData.get(riga.post_date)
    if (giorno) giorno.push(riga)
    else perData.set(riga.post_date, [riga])
  }
  return { perData, senzaData }
}

/** The days of the month (not of the grid around it) that have contents, in order: the phone's agenda. */
export function giorniConContenuti(perData: ReadonlyMap<string, readonly unknown[]>, primo: string): string[] {
  const inizio = primoDelMeseISO(primo)
  const fine = fineMese(inizio)
  return [...perData.keys()].filter((d) => d >= inizio && d <= fine && (perData.get(d)?.length ?? 0) > 0).sort()
}

/**
 * A content dragged to another day (the optimistic grid, before the server
 * answers): the same rows, that one with its new Post Date. Nothing else moves.
 */
export function conPostDate<T extends { id: string; post_date: string | null }>(
  righe: readonly T[],
  id: string,
  data: string,
): T[] {
  return righe.map((r) => (r.id === id ? { ...r, post_date: data } : r))
}

/**
 * The order of the contents in the calendar view, for «Contenuto precedente»
 * and «successivo» of the panel: the days of the grid in order (in each day as
 * they come), then the ones without a Post Date.
 */
export function ordineCalendario<T extends { id: string; post_date: string | null }>(
  delMese: readonly T[],
  senzaData: readonly T[],
): string[] {
  const { perData } = perGiorno(delMese)
  const giorni = [...perData.keys()].sort()
  return [...giorni.flatMap((g) => perData.get(g)!.map((r) => r.id)), ...senzaData.map((r) => r.id)]
}

/**
 * The dots of a day of the mini month: the Status of its first contents (at
 * most PUNTI_PER_GIORNO) and how many are left over for the "+".
 */
export function puntiDelGiorno(stati: readonly StatusContenuto[]): { punti: StatusContenuto[]; altri: number } {
  return { punti: stati.slice(0, PUNTI_PER_GIORNO), altri: Math.max(0, stati.length - PUNTI_PER_GIORNO) }
}

/** How many contents of each Status, «Not started 2, Posted 1», in the order of the work, without the zeros. */
export function statiContati(stati: readonly StatusContenuto[]): { stato: StatusContenuto; n: number }[] {
  const conti = new Map<StatusContenuto, number>()
  for (const s of stati) conti.set(s, (conti.get(s) ?? 0) + 1)
  return ORDINE_STATUS.filter((s) => conti.has(s)).map((stato) => ({ stato, n: conti.get(stato)! }))
}
