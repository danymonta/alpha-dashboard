import { etichettaFiltroFascia } from '@/lib/marketing/analisi/cosa-fare'
import { FASCE, intervalloFascia, type CodiceFascia } from '@/lib/marketing/punteggio/tabelle'

/**
 * The filters of /marketing/analisi, in the address so they survive a reload
 * (1.36.0). An unknown value is dropped, never an error. Pure. Since 1.39.0 the
 * score has its own filter (the band, or «Non valutati») and its own order.
 */

export const PERIODI = [30, 90, 180] as const
export type PeriodoAnalisi = (typeof PERIODI)[number]
export const VERDETTI_FILTRO = ['tutti', 'spingere', 'mantenere', 'cambiare'] as const
export type VerdettoFiltro = (typeof VERDETTI_FILTRO)[number]
export const FASCE_FILTRO = ['tutte', 'non_valutato', ...FASCE.map((f) => f.codice)] as readonly ('tutte' | 'non_valutato' | CodiceFascia)[]
export type FasciaFiltro = 'tutte' | 'non_valutato' | CodiceFascia
export const ORDINI = ['recenti', 'views', 'lead', 'punteggio'] as const
export type OrdineAnalisi = (typeof ORDINI)[number]

export type FiltriAnalisi = {
  periodo: PeriodoAnalisi
  verdetto: VerdettoFiltro
  punteggio: FasciaFiltro
  senzaContenuto: boolean
  ordine: OrdineAnalisi
}

export const FILTRI_PREDEFINITI: FiltriAnalisi = { periodo: 30, verdetto: 'tutti', punteggio: 'tutte', senzaContenuto: false, ordine: 'recenti' }

/** The search param the reel panel lives in. */
export const PARAMETRO_REEL = 'reel'

export const ETICHETTA_PERIODO: Record<PeriodoAnalisi, string> = { 30: 'Ultimi 30 giorni', 90: 'Ultimi 90 giorni', 180: 'Ultimi 180 giorni' }
export const ETICHETTA_VERDETTO_FILTRO: Record<VerdettoFiltro, string> = {
  tutti: 'Tutti',
  spingere: 'Spingere',
  mantenere: 'Mantenere',
  cambiare: 'Cambiare',
}
/** The band filter, in words: what to do with the reel and the range of the score (the same words as the lists, 1.39.1), and «Non valutati». */
export const ETICHETTA_FASCIA_FILTRO: Record<FasciaFiltro, string> = {
  tutte: 'Tutti',
  non_valutato: 'Non valutati',
  ...(Object.fromEntries(
    FASCE.map((f) => {
      const { da, a } = intervalloFascia(f.codice)
      return [f.codice, etichettaFiltroFascia(f.codice, da, a)]
    }),
  ) as Record<CodiceFascia, string>),
}
export const ETICHETTA_ORDINE: Record<OrdineAnalisi, string> = {
  recenti: 'Più recenti',
  views: 'Views',
  lead: 'Lead in target',
  punteggio: 'Punteggio',
}

type Parametri = Record<string, string | string[] | undefined>

const primo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export function filtriDaParametri(sp: Parametri): FiltriAnalisi {
  const periodo = Number(primo(sp.periodo))
  const verdetto = primo(sp.verdetto)
  const punteggio = primo(sp.punteggio)
  const ordine = primo(sp.ordine)
  return {
    periodo: (PERIODI as readonly number[]).includes(periodo) ? (periodo as PeriodoAnalisi) : FILTRI_PREDEFINITI.periodo,
    verdetto: (VERDETTI_FILTRO as readonly string[]).includes(verdetto ?? '') ? (verdetto as VerdettoFiltro) : FILTRI_PREDEFINITI.verdetto,
    punteggio: (FASCE_FILTRO as readonly string[]).includes(punteggio ?? '') ? (punteggio as FasciaFiltro) : FILTRI_PREDEFINITI.punteggio,
    senzaContenuto: primo(sp.senza_contenuto) === '1',
    ordine: (ORDINI as readonly string[]).includes(ordine ?? '') ? (ordine as OrdineAnalisi) : FILTRI_PREDEFINITI.ordine,
  }
}

/** The address of the page with these filters (the defaults are left out); `reel` keeps the panel open. */
export function hrefAnalisi(f: FiltriAnalisi, reel?: string | null): string {
  const p = new URLSearchParams()
  if (f.periodo !== FILTRI_PREDEFINITI.periodo) p.set('periodo', String(f.periodo))
  if (f.verdetto !== FILTRI_PREDEFINITI.verdetto) p.set('verdetto', f.verdetto)
  if (f.punteggio !== FILTRI_PREDEFINITI.punteggio) p.set('punteggio', f.punteggio)
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
    f.punteggio === FILTRI_PREDEFINITI.punteggio &&
    !f.senzaContenuto &&
    f.ordine === FILTRI_PREDEFINITI.ordine
  )
}
