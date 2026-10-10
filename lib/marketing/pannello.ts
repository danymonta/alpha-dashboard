/**
 * The content panel (1.33.0, Dany: "se clicco su un contenuto non mi apre una
 * nuova pagina ma me la apre in sidebar da modificare"): pure helpers, tested
 * in Vitest. The panel keeps its state in the address (?contenuto=<id>), so
 * the link can be shared and Back closes it.
 */
import { formatData, formatNumero } from '@/lib/format'
import {
  CAMPI,
  CAMPO_MODELLO,
  ETICHETTA_FORMAT,
  ETICHETTA_MODELLO,
  ETICHETTA_REEL_TYPE,
  type FormatContenuto,
  type ReelType,
  type TipoContenuto,
} from '@/lib/marketing/etichette'
import type { CampoInCella } from '@/lib/validation/contenuto'

/** The search param the panel lives in. */
export const PARAMETRO_CONTENUTO = 'contenuto'

/** A content's own page: direct links, Cmd/Ctrl-click, «Apri a tutta pagina». */
export function hrefContenuto(id: string): string {
  return `/marketing/contenuti/${id}`
}

/** The link «Copia il link» gives: the list with the panel open, without filters. */
export function linkCondivisibile(origine: string, id: string): string {
  return `${origine}/marketing/contenuti?${PARAMETRO_CONTENUTO}=${id}`
}

function conParametri(pathname: string, parametri: URLSearchParams): string {
  const testo = parametri.toString()
  return testo ? `${pathname}?${testo}` : pathname
}

/** The address with ?contenuto=<id>: filters, view and month stay; a contenuto already there is replaced. */
export function urlCon(pathname: string, search: string, id: string): string {
  const parametri = new URLSearchParams(search)
  parametri.set(PARAMETRO_CONTENUTO, id)
  return conParametri(pathname, parametri)
}

/** The same address without ?contenuto, and nothing else touched. */
export function urlSenza(pathname: string, search: string): string {
  const parametri = new URLSearchParams(search)
  parametri.delete(PARAMETRO_CONTENUTO)
  return conParametri(pathname, parametri)
}

export type Vicini = {
  precedente: string | null
  successivo: string | null
  /** 1-based; null when the id is not (or no longer) in the list. */
  posizione: number | null
  totale: number
}

/** "Contenuto precedente" and "successivo" in the list's order; an id gone from it has neither. */
export function vicini(ordine: readonly string[], id: string): Vicini {
  const i = ordine.indexOf(id)
  if (i < 0) return { precedente: null, successivo: null, posizione: null, totale: ordine.length }
  return {
    precedente: i > 0 ? ordine[i - 1] : null,
    successivo: i < ordine.length - 1 ? ordine[i + 1] : null,
    posizione: i + 1,
    totale: ordine.length,
  }
}

/**
 * The later of two updated_at values (Postgres timestamptz as ISO text); a
 * tie keeps the second. Postgres keeps microseconds that Date.parse drops:
 * the same millisecond compares on the text, which sorts as time does for
 * the same offset.
 */
export function piuRecente(a: string, b: string): string {
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return b
  if (ta !== tb) return ta > tb ? a : b
  return a > b ? a : b
}

/** The short toast after a field is saved: "Reel Type: Education", "Post Date tolta", "Name salvato". */
export function messaggioCampo(campo: CampoInCella, valore: unknown): string {
  const vuoto = valore === null || valore === undefined || valore === ''
  switch (campo) {
    case 'tipo':
      return `${CAMPO_MODELLO}: ${ETICHETTA_MODELLO[valore as TipoContenuto] ?? String(valore)}`
    case 'nome':
      return `${CAMPI.nome} salvato`
    case 'reel_type':
      return vuoto ? `${CAMPI.reel_type} tolto` : `${CAMPI.reel_type}: ${ETICHETTA_REEL_TYPE[valore as ReelType]}`
    case 'formato':
      return vuoto ? `${CAMPI.formato} tolto` : `${CAMPI.formato}: ${ETICHETTA_FORMAT[valore as FormatContenuto]}`
    case 'post_date':
      return vuoto ? `${CAMPI.post_date} tolta` : `${CAMPI.post_date}: ${formatData(String(valore))}`
    case 'inspiration':
      return vuoto ? `${CAMPI.inspiration} tolta` : `${CAMPI.inspiration} salvata`
    case 'url':
      return vuoto ? `${CAMPI.url} tolto` : `${CAMPI.url} salvato`
    case 'audio':
      return vuoto ? `${CAMPI.audio} tolto` : `${CAMPI.audio} salvato`
    case 'view_count':
      return vuoto ? `${CAMPI.view_count} tolto` : `${CAMPI.view_count}: ${formatNumero(Number(valore))}`
  }
}
