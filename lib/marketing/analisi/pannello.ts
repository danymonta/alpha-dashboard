import { PARAMETRO_REEL } from '@/lib/marketing/analisi/filtri'

/**
 * The reel panel's address (1.36.0): ?reel=<media id> next to the filters, as
 * the content panel's ?contenuto. Pure, tested in Vitest.
 */

const RE_MEDIA_ID = /^[0-9]{1,30}$/

export function eMediaId(valore: string | null | undefined): valore is string {
  return typeof valore === 'string' && RE_MEDIA_ID.test(valore)
}

function conParametri(pathname: string, parametri: URLSearchParams): string {
  const testo = parametri.toString()
  return testo ? `${pathname}?${testo}` : pathname
}

/** The address with ?reel=<id>; filters stay, a reel already there is replaced. */
export function urlConReel(pathname: string, search: string, id: string): string {
  const parametri = new URLSearchParams(search)
  parametri.set(PARAMETRO_REEL, id)
  return conParametri(pathname, parametri)
}

/** The same address without ?reel (and without the tab of the panel, which goes with it). */
export function urlSenzaReel(pathname: string, search: string): string {
  const parametri = new URLSearchParams(search)
  parametri.delete(PARAMETRO_REEL)
  parametri.delete(PARAMETRO_SCHEDA)
  return conParametri(pathname, parametri)
}

/** The tab open in the reel panel (1.39.1): «Come rifarlo», «Perché», «Numeri». */
export const PARAMETRO_SCHEDA = 'scheda'
export const SCHEDE_REEL = ['rifare', 'perche', 'numeri'] as const
export type SchedaReel = (typeof SCHEDE_REEL)[number]

export function eSchedaReel(valore: string | null | undefined): valore is SchedaReel {
  return typeof valore === 'string' && (SCHEDE_REEL as readonly string[]).includes(valore)
}

/** The address with ?scheda=<tab>, the reel and the filters left as they are. */
export function urlConScheda(pathname: string, search: string, scheda: SchedaReel): string {
  const parametri = new URLSearchParams(search)
  parametri.set(PARAMETRO_SCHEDA, scheda)
  return conParametri(pathname, parametri)
}

/** The page of the analysis open on a reel: from the content's panel, Post di Instagram. */
export function hrefAnalisiReel(mediaId: string): string {
  return `/marketing/analisi?${PARAMETRO_REEL}=${mediaId}`
}
