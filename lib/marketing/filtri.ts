/**
 * The filters of the Piano editoriale (/marketing/contenuti), in the address so
 * they survive a reload. No filter by default, as in Notion. An unknown value is
 * dropped, never an error. Reel Type and Format are the slug of an option of
 * marketing_opzioni: here only the shape is checked (the options are in the
 * database), and the page drops a slug that is not an option any more
 * (`senzaOpzioniSparite`).
 */
import { RE_VALORE_OPZIONE, type Opzioni } from '@/lib/marketing/opzioni'
import { Constants } from '@/lib/supabase/database.types'

import {
  GRUPPI_STATUS,
  ORDINE_GRUPPI,
  gruppoDiStatus,
  type GruppoStatus,
  type StatusContenuto,
  type TipoContenuto,
} from './etichette'

export type FiltriContenuti = {
  gruppo?: GruppoStatus
  stato?: StatusContenuto
  /** the slug of a Reel Type option */
  reel_type?: string
  /** the slug of a Format option */
  formato?: string
  tipo?: TipoContenuto
  q?: string
}

/** The search on Name: at most this many characters. */
export const RICERCA_MAX = 100

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

function tra<T extends string>(valori: readonly T[], valore: string | undefined): T | undefined {
  return valore !== undefined && (valori as readonly string[]).includes(valore) ? (valore as T) : undefined
}

function slug(valore: string | undefined): string | undefined {
  return valore !== undefined && RE_VALORE_OPZIONE.test(valore) ? valore : undefined
}

export function filtriDaParametri(sp: Record<string, string | string[] | undefined>): FiltriContenuti {
  const filtri: FiltriContenuti = {
    gruppo: tra(ORDINE_GRUPPI, primo(sp.gruppo)),
    stato: tra(Constants.public.Enums.contenuto_status, primo(sp.stato)),
    reel_type: slug(primo(sp.reel_type)),
    formato: slug(primo(sp.formato)),
    tipo: tra(Constants.public.Enums.contenuto_tipo, primo(sp.tipo)),
    q: primo(sp.q)?.trim().slice(0, RICERCA_MAX) || undefined,
  }
  return senzaVuoti(filtri)
}

/**
 * The filters without a Reel Type or a Format that is not an option any more
 * (an old link, an option deleted meanwhile): the list shows everything for
 * that filter rather than nothing.
 */
export function senzaOpzioniSparite(f: FiltriContenuti, opzioni: Opzioni): FiltriContenuti {
  return senzaVuoti({
    ...f,
    reel_type: f.reel_type && opzioni.reel_type.some((o) => o.valore === f.reel_type) ? f.reel_type : undefined,
    formato: f.formato && opzioni.formato.some((o) => o.valore === f.formato) ? f.formato : undefined,
  })
}

/** The filters without the keys left undefined. */
function senzaVuoti(f: FiltriContenuti): FiltriContenuti {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as FiltriContenuti
}

/** The filters as search params (undefined: left out of the address). */
export function parametriDaFiltri(f: FiltriContenuti): Record<string, string | undefined> {
  return {
    gruppo: f.gruppo,
    stato: f.stato,
    reel_type: f.reel_type,
    formato: f.formato,
    tipo: f.tipo,
    q: f.q || undefined,
  }
}

export function haFiltri(f: FiltriContenuti): boolean {
  return Object.values(parametriDaFiltri(f)).some((v) => v !== undefined)
}

/**
 * The statuses a list reads with these filters: the group's, the one Status
 * chosen, or both together (a Status outside the group chosen: none). Null
 * when neither filter is set.
 */
export function statiFiltrati(f: FiltriContenuti): readonly StatusContenuto[] | null {
  if (!f.gruppo && !f.stato) return null
  const delGruppo = f.gruppo ? GRUPPI_STATUS[f.gruppo] : null
  if (!f.stato) return delGruppo
  return !delGruppo || delGruppo.includes(f.stato) ? [f.stato] : []
}

/**
 * The filters of a group chip ("Tutti" is null): that group, and the Status
 * chosen only if it belongs to it (a Status of another group would leave an
 * empty list, so the chip drops it). The chip's link and its count both use
 * this, so the number on a chip is what a tap on it opens.
 */
export function filtriDelGruppo(f: FiltriContenuti, gruppo: GruppoStatus | null): FiltriContenuti {
  const stato = f.stato && gruppo && gruppoDiStatus(f.stato) !== gruppo ? undefined : f.stato
  return senzaVuoti({ ...f, gruppo: gruppo ?? undefined, stato })
}

/**
 * The search on Name, for PostgREST's `imatch` (Postgres `~*`): case-insensitive,
 * and every character taken literally (`***=` makes the rest of the regex a
 * literal string). Never `ilike`: PostgREST reads `*` there as `%`, with no way
 * to escape it, so a search for "*" found every content.
 */
export function patternRicerca(q: string): string {
  return `***=${q}`
}
