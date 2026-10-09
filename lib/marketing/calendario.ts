/**
 * The month of the calendar view: weeks from Monday to Sunday covering the
 * month (Italian weeks), the contents grouped by Post Date. Pure functions on
 * business dates 'YYYY-MM-DD'; "today" (Europe/Rome) comes from the caller.
 */
import { aggiungiGiorni, fineMese, lunediDellaSettimana, primoDelMeseISO } from '@/lib/date'

export type GiornoGriglia = { data: string; delMese: boolean; oggi: boolean }

/** A day shows at most this many contents; the others are "+N". */
export const VISIBILI_PER_GIORNO = 3

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

/** The contents by day, in the order they come; the ones without Post Date apart. */
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
