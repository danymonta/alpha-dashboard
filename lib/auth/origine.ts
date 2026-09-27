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

/** "da" after sign-in: only a path of this app, never another site. */
export function destinazioneSicura(da: string | null | undefined): string {
  if (!da || !da.startsWith('/') || da.startsWith('//') || da.startsWith('/\\') || da.startsWith('/login')) return '/'
  return da
}
