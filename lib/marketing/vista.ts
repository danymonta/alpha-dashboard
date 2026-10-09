/**
 * "Tabella | Calendario" of /marketing/contenuti, remembered like Elenco |
 * Timeline of the projects (lib/progetti-timeline.ts): the address wins, then
 * the cookie of the last choice, then the table. Per person and per browser,
 * nothing in the database.
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
