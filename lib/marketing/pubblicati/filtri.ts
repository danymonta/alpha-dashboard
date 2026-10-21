import { RICERCA_MAX } from '@/lib/marketing/filtri'

/**
 * The filters of /marketing/pubblicati (25/10/2026), in the address so they survive a
 * reload and can be shared: the period (30, 90 or 180 days), the kind of post, whether it
 * is in the Piano editoriale, the search in the caption, and «Da cambiare» (the tile of
 * the reels that say «Cambiare»). An unknown value is dropped, never an error. Pure,
 * tested in Vitest. It replaces the filters of the two pages it replaces (Post di
 * Instagram and Analisi): their old addresses are turned into these by
 * `indirizzoDaVecchiaPagina` (vecchi-indirizzi.ts).
 */

export const PERIODI = [30, 90, 180] as const
export type PeriodoPubblicati = (typeof PERIODI)[number]
export const TIPI_FILTRO = ['tutti', 'reel', 'carosello', 'foto'] as const
export type TipoFiltro = (typeof TIPI_FILTRO)[number]
export const PIANI_FILTRO = ['tutti', 'nel_piano', 'fuori'] as const
export type PianoFiltro = (typeof PIANI_FILTRO)[number]

export type FiltriPubblicati = {
  periodo: PeriodoPubblicati
  tipo: TipoFiltro
  piano: PianoFiltro
  /** the search in the caption */
  q?: string
  /** only the reels whose verdict is «Cambiare» */
  cambiare: boolean
}

export const FILTRI_PREDEFINITI: FiltriPubblicati = { periodo: 30, tipo: 'tutti', piano: 'tutti', cambiare: false }

/** The search params the two panels live in: the reel's (media id) and the calendar content's (uuid). */
export const PARAMETRO_REEL = 'reel'

export const ETICHETTA_PERIODO: Record<PeriodoPubblicati, string> = { 30: 'Ultimi 30 giorni', 90: 'Ultimi 90 giorni', 180: 'Ultimi 180 giorni' }
export const ETICHETTA_TIPO_FILTRO: Record<TipoFiltro, string> = {
  tutti: 'Tutti i tipi',
  reel: 'Reel',
  carosello: 'Caroselli',
  foto: 'Foto',
}
export const ETICHETTA_PIANO_FILTRO: Record<PianoFiltro, string> = {
  tutti: 'Tutti',
  nel_piano: 'Nel piano',
  fuori: 'Non nel piano',
}

type Parametri = Record<string, string | string[] | undefined>

const primo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export function filtriDaParametri(sp: Parametri): FiltriPubblicati {
  const periodo = Number(primo(sp.periodo))
  const tipo = primo(sp.tipo)
  const piano = primo(sp.piano)
  const q = primo(sp.q)?.trim().slice(0, RICERCA_MAX)
  return {
    periodo: (PERIODI as readonly number[]).includes(periodo) ? (periodo as PeriodoPubblicati) : FILTRI_PREDEFINITI.periodo,
    tipo: (TIPI_FILTRO as readonly string[]).includes(tipo ?? '') ? (tipo as TipoFiltro) : FILTRI_PREDEFINITI.tipo,
    piano: (PIANI_FILTRO as readonly string[]).includes(piano ?? '') ? (piano as PianoFiltro) : FILTRI_PREDEFINITI.piano,
    ...(q ? { q } : {}),
    cambiare: primo(sp.cambiare) === '1',
  }
}

/** The filters as search params, the defaults left out. */
export function parametriDaFiltri(f: FiltriPubblicati): Record<string, string> {
  const p: Record<string, string> = {}
  if (f.periodo !== FILTRI_PREDEFINITI.periodo) p.periodo = String(f.periodo)
  if (f.tipo !== FILTRI_PREDEFINITI.tipo) p.tipo = f.tipo
  if (f.piano !== FILTRI_PREDEFINITI.piano) p.piano = f.piano
  if (f.q) p.q = f.q
  if (f.cambiare) p.cambiare = '1'
  return p
}

/** The address of the page with these filters; `reel` keeps a reel's panel open, `contenuto` a content's. */
export function hrefPubblicati(f: FiltriPubblicati, aperti: { reel?: string | null; contenuto?: string | null } = {}): string {
  const p = new URLSearchParams(parametriDaFiltri(f))
  if (aperti.reel) p.set(PARAMETRO_REEL, aperti.reel)
  if (aperti.contenuto) p.set('contenuto', aperti.contenuto)
  const testo = p.toString()
  return testo ? `/marketing/pubblicati?${testo}` : '/marketing/pubblicati'
}

export function sonoFiltriPredefiniti(f: FiltriPubblicati): boolean {
  return Object.keys(parametriDaFiltri(f)).length === 0
}

/** How many filters differ from the ones the page opens with: the number on «Filtri» at 390 px. */
export function filtriAttivi(f: FiltriPubblicati): number {
  return Object.keys(parametriDaFiltri(f)).length
}
