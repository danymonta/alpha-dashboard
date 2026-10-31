/**
 * "Tabella | Calendario" of the Piano editoriale (1.69.0; the calendar was there
 * until 1.47.0), remembered like Elenco | Timeline of the projects
 * (lib/progetti-timeline.ts): the address wins, then the cookie of the last
 * choice, then the table. Per device, nothing in the database.
 */
export type VistaContenuti = 'tabella' | 'calendario'

export const COOKIE_VISTA_CONTENUTI = 'alpha_vista_marketing'
const DURATA_COOKIE = 60 * 60 * 24 * 365

/** ?vista as written in the address: a valid view, or null when it says nothing. */
export function vistaDaUrl(valore: unknown): VistaContenuti | null {
  return valore === 'tabella' || valore === 'calendario' ? valore : null
}

export function vistaIniziale(daUrl: unknown, ricordata: unknown): VistaContenuti {
  return vistaDaUrl(daUrl) ?? vistaDaUrl(ricordata) ?? 'tabella'
}

/** The cookie as document.cookie takes it: one year, the Marketing area, Secure on https. */
export function cookieVista(vista: VistaContenuti, https: boolean): string {
  return `${COOKIE_VISTA_CONTENUTI}=${vista}; Path=/marketing; Max-Age=${DURATA_COOKIE}; SameSite=Lax${https ? '; Secure' : ''}`
}

/**
 * The address of the Piano editoriale in a view, with the filters and the tab:
 * the month belongs to the calendar only; a calendar that came from the memory
 * (no ?vista) leaves for the table with ?vista=tabella, or the same address
 * would show the calendar again.
 */
export function hrefVista(
  valore: VistaContenuti,
  attuale: VistaContenuti,
  parametri: Record<string, string | undefined>,
): string {
  const cerca = new URLSearchParams()
  for (const [chiave, v] of Object.entries(parametri)) {
    if (v !== undefined && v !== '' && chiave !== 'vista' && (chiave !== 'mese' || valore === 'calendario')) {
      cerca.set(chiave, v)
    }
  }
  if (valore === 'calendario') cerca.set('vista', 'calendario')
  else if (attuale === 'calendario' && !parametri.vista) cerca.set('vista', 'tabella')
  const testo = cerca.toString()
  return testo ? `/marketing/contenuti?${testo}` : '/marketing/contenuti'
}
