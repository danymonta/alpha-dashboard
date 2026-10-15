/**
 * The filters of /marketing/analisi, in the address so they survive a reload
 * (1.36.0). An unknown value is dropped, never an error. Pure.
 */

export const PERIODI = [30, 90, 180] as const
export type PeriodoAnalisi = (typeof PERIODI)[number]
export const VERDETTI_FILTRO = ['tutti', 'spingere', 'mantenere', 'cambiare', 'da_analizzare'] as const
export type VerdettoFiltro = (typeof VERDETTI_FILTRO)[number]
export const ORDINI = ['recenti', 'views', 'lead'] as const
export type OrdineAnalisi = (typeof ORDINI)[number]

export type FiltriAnalisi = {
  periodo: PeriodoAnalisi
  verdetto: VerdettoFiltro
  senzaContenuto: boolean
  ordine: OrdineAnalisi
}

export const FILTRI_PREDEFINITI: FiltriAnalisi = { periodo: 30, verdetto: 'tutti', senzaContenuto: false, ordine: 'recenti' }

/** The search param the reel panel lives in. */
export const PARAMETRO_REEL = 'reel'

export const ETICHETTA_PERIODO: Record<PeriodoAnalisi, string> = { 30: 'Ultimi 30 giorni', 90: 'Ultimi 90 giorni', 180: 'Ultimi 180 giorni' }
export const ETICHETTA_VERDETTO_FILTRO: Record<VerdettoFiltro, string> = {
  tutti: 'Tutti',
  spingere: 'Spingere',
  mantenere: 'Mantenere',
  cambiare: 'Cambiare',
  da_analizzare: 'Da analizzare',
}
export const ETICHETTA_ORDINE: Record<OrdineAnalisi, string> = { recenti: 'Più recenti', views: 'Views', lead: 'Lead in target' }

type Parametri = Record<string, string | string[] | undefined>

const primo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export function filtriDaParametri(sp: Parametri): FiltriAnalisi {
  const periodo = Number(primo(sp.periodo))
  const verdetto = primo(sp.verdetto)
  const ordine = primo(sp.ordine)
  return {
    periodo: (PERIODI as readonly number[]).includes(periodo) ? (periodo as PeriodoAnalisi) : FILTRI_PREDEFINITI.periodo,
    verdetto: (VERDETTI_FILTRO as readonly string[]).includes(verdetto ?? '') ? (verdetto as VerdettoFiltro) : FILTRI_PREDEFINITI.verdetto,
    senzaContenuto: primo(sp.senza_contenuto) === '1',
    ordine: (ORDINI as readonly string[]).includes(ordine ?? '') ? (ordine as OrdineAnalisi) : FILTRI_PREDEFINITI.ordine,
  }
}

/** The address of the page with these filters (the defaults are left out); `reel` keeps the panel open. */
export function hrefAnalisi(f: FiltriAnalisi, reel?: string | null): string {
  const p = new URLSearchParams()
  if (f.periodo !== FILTRI_PREDEFINITI.periodo) p.set('periodo', String(f.periodo))
  if (f.verdetto !== FILTRI_PREDEFINITI.verdetto) p.set('verdetto', f.verdetto)
  if (f.senzaContenuto) p.set('senza_contenuto', '1')
  if (f.ordine !== FILTRI_PREDEFINITI.ordine) p.set('ordine', f.ordine)
  if (reel) p.set(PARAMETRO_REEL, reel)
  const testo = p.toString()
  return testo ? `/marketing/analisi?${testo}` : '/marketing/analisi'
}

export function sonoFiltriPredefiniti(f: FiltriAnalisi): boolean {
  return (
    f.periodo === FILTRI_PREDEFINITI.periodo &&
    f.verdetto === FILTRI_PREDEFINITI.verdetto &&
    !f.senzaContenuto &&
    f.ordine === FILTRI_PREDEFINITI.ordine
  )
}
