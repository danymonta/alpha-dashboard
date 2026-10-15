/**
 * The three tabs of the Insight (1.35.0, CLAUDE.md section 29), as the
 * artifact "Recap DM Alpha" has them: Instagram, Messenger and Agenda. The
 * agenda reads the Instagram recap (the artifact's `src('ag') = 'ig'`).
 *
 * The tab lives in the address (?canale=messenger) and in a cookie of this
 * browser (the artifact's localStorage key `recap-ch`): the server needs it to
 * load the right recap without a flash. The address wins, then the cookie,
 * then Instagram. The day is never remembered: without ?giorno the page opens
 * on the newest recap, as the artifact does.
 */

export const CANALI = ['instagram', 'messenger', 'agenda'] as const
export type Canale = (typeof CANALI)[number]

/** The recap a tab reads: the agenda is inside the Instagram one. */
export type Fonte = 'instagram' | 'messenger'

export const fonteDi = (canale: Canale): Fonte => (canale === 'messenger' ? 'messenger' : 'instagram')

export const COOKIE_CANALE_INSIGHT = 'alpha_insight_canale'
const DURATA_COOKIE = 60 * 60 * 24 * 365

/** ?canale as written in the address: a tab, or null when it says nothing. */
export function canaleDaUrl(valore: unknown): Canale | null {
  return typeof valore === 'string' && (CANALI as readonly string[]).includes(valore) ? (valore as Canale) : null
}

export function canaleIniziale(daUrl: unknown, ricordato: unknown): Canale {
  return canaleDaUrl(daUrl) ?? canaleDaUrl(ricordato) ?? 'instagram'
}

/** The cookie as document.cookie takes it: one year, the Insight's path, Secure on https. */
export function cookieCanale(canale: Canale, https: boolean): string {
  return `${COOKIE_CANALE_INSIGHT}=${canale}; Path=/insight; Max-Age=${DURATA_COOKIE}; SameSite=Lax${https ? '; Secure' : ''}`
}

/**
 * The address of a tab, and of a day of it. The tab is always written, even
 * Instagram: a cookie that remembers Messenger would otherwise win.
 */
export function hrefInsight(canale: Canale, giorno?: string | null): string {
  const cerca = new URLSearchParams({ canale })
  if (giorno) cerca.set('giorno', giorno)
  return `/insight?${cerca.toString()}`
}

/** The panel the tabs control (the page wraps the recap in it), and each tab's id. */
export const ID_PANNELLO_INSIGHT = 'pannello-insight'
export const idScheda = (canale: Canale) => `scheda-${canale}`
