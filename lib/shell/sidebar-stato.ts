/**
 * The desktop sidebar can shrink to a column of icons. The choice is kept per
 * device in a cookie, so the server renders the right width on the first byte
 * (no flash) and every page agrees. Phones have the bottom bar: nothing here.
 */
export const COOKIE_SIDEBAR = 'alpha_sidebar'

export type StatoSidebar = 'estesa' | 'ridotta'

/** Anything but the one stored value opens the sidebar, as it always was. */
export function statoSidebar(valore: string | null | undefined): StatoSidebar {
  return valore === 'ridotta' ? 'ridotta' : 'estesa'
}

const UN_ANNO = 60 * 60 * 24 * 365

/** What to assign to document.cookie to remember the choice. */
export function cookieSidebar(stato: StatoSidebar): string {
  return `${COOKIE_SIDEBAR}=${stato}; path=/; max-age=${UN_ANNO}; samesite=lax`
}
