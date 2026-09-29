/**
 * The address the app is being used at, for links that must come back to it
 * (the Google sign-in return, invite links). The request's own origin when it
 * is one of ours, otherwise APP_URL: a forged Host header never picks the
 * target. Supabase checks the return address against its allowlist as well.
 */
export function origineAmmessa(candidata: string | null | undefined, appUrl: string): string {
  const base = appUrl.replace(/\/$/, '')
  if (!candidata) return base
  let url: URL
  try {
    url = new URL(candidata)
  } catch {
    return base
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return base
  const host = url.hostname
  let hostApp = ''
  try {
    hostApp = new URL(base).hostname
  } catch {
    // APP_URL malformed: only our own domains below
  }
  const nostro =
    host === hostApp ||
    host === 'percorsoalpha.com' ||
    host.endsWith('.percorsoalpha.com') ||
    host.endsWith('.vercel.app') ||
    ((host === 'localhost' || host === '127.0.0.1') && url.protocol === 'http:')
  return nostro ? url.origin : base
}

/**
 * Where to go after Google, kept in a short-lived cookie instead of the return
 * address: Supabase matches that address against its allow list query
 * included, so a plain "/auth/callback" entry must be enough.
 */
export const COOKIE_DOPO_LOGIN = 'alpha-dopo-login'

// Resolving against a base that is never served: a path of this app keeps it
const BASE_INTERNA = 'http://interno.invalid'

/**
 * "da" after sign-in: only a path of this app, never another site. The browser
 * drops tabs and newlines anywhere in a URL and reads "\" as "/", so "/\t/x"
 * would become "//x", another site: any control character or backslash is
 * refused, and what is left must resolve to this very origin.
 */
export function destinazioneSicura(da: string | null | undefined): string {
  if (!da || !da.startsWith('/') || da.startsWith('//') || da.startsWith('/login')) return '/'
  for (const carattere of da) {
    const codice = carattere.charCodeAt(0)
    if (codice < 0x20 || codice === 0x7f || carattere === '\\') return '/'
  }
  try {
    if (new URL(da, BASE_INTERNA).origin !== BASE_INTERNA) return '/'
  } catch {
    return '/'
  }
  return da
}

/** "?da=" on a page: the way back to where the user came from, only a path of this app; otherwise null. */
export function percorsoDiRitorno(da: string | null | undefined): string | null {
  return da && destinazioneSicura(da) === da ? da : null
}
