/**
 * «Calendario | Tabella» of the sales recap (1.59.0). The view lives in the address
 * (?vista=tabella) and the tap remembers it in a cookie of this browser, as the projects do
 * (lib/progetti-timeline.ts): /recap without ?vista opens the view chosen last.
 */
export type VistaRecap = 'calendario' | 'tabella'

export const COOKIE_VISTA_RECAP = 'alpha_vista_recap'
export const DURATA_COOKIE_VISTA_RECAP = 60 * 60 * 24 * 365

/** ?vista as written in the address: a valid view, or null when it says nothing. */
export function vistaRecapDaUrl(valore: unknown): VistaRecap | null {
  return valore === 'calendario' || valore === 'tabella' ? valore : null
}

/** The address wins, then the remembered view, then the calendar. */
export function vistaRecapIniziale(daUrl: unknown, ricordata: unknown): VistaRecap {
  return vistaRecapDaUrl(daUrl) ?? vistaRecapDaUrl(ricordata) ?? 'calendario'
}

/** The cookie as document.cookie takes it; Secure on https. */
export function cookieVistaRecap(vista: VistaRecap, https: boolean): string {
  return `${COOKIE_VISTA_RECAP}=${vista}; Path=/recap; Max-Age=${DURATA_COOKIE_VISTA_RECAP}; SameSite=Lax${https ? '; Secure' : ''}`
}
