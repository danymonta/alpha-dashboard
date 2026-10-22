/**
 * The colour theme, chosen per device: «chiaro», «scuro» or «sistema» (follows
 * the device). Kept in a cookie so the server writes the class on <html> in the
 * first byte, with no flash. The default is «scuro», as the app always was:
 * nobody sees a change they did not ask for.
 */
export const COOKIE_TEMA = 'alpha_tema'

export const TEMI = ['chiaro', 'scuro', 'sistema'] as const
export type Tema = (typeof TEMI)[number]

export const TEMA_PREDEFINITO: Tema = 'scuro'

export const ETICHETTA_TEMA: Record<Tema, string> = {
  chiaro: 'Chiaro',
  scuro: 'Scuro',
  sistema: 'Sistema',
}

export function eTema(valore: unknown): valore is Tema {
  return typeof valore === 'string' && (TEMI as readonly string[]).includes(valore)
}

/** The stored value, or the default when it is missing or not one of the three. */
export function temaDaCookie(valore: string | null | undefined): Tema {
  return eTema(valore) ? valore : TEMA_PREDEFINITO
}

/**
 * The class on <html>. Dark is the base of globals.css (:root), so «scuro» has
 * none: the dark theme stays exactly as it was. «sistema» follows the device
 * through a media query in the CSS (no script, no flash).
 */
export function classeTema(tema: Tema): string {
  return tema === 'chiaro' ? 'light' : tema === 'sistema' ? 'sistema' : ''
}

const UN_ANNO = 60 * 60 * 24 * 365

/** What to assign to document.cookie to remember the choice. */
export function cookieTema(tema: Tema): string {
  return `${COOKIE_TEMA}=${tema}; path=/; max-age=${UN_ANNO}; samesite=lax`
}

/** Whether the page is light right now (for the sun/moon icon and the next toggle). */
export function ePaginaChiara(tema: Tema, sistemaChiaro: boolean): boolean {
  return tema === 'chiaro' || (tema === 'sistema' && sistemaChiaro)
}
