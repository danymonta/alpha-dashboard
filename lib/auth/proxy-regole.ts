import { destinazioneCliente } from '@/lib/auth/destinazione'
import { destinazioneSicura } from '@/lib/auth/origine'

/**
 * The rules of the proxy (lib/supabase/middleware.ts), pure, so they are tested without a
 * server (tests/proxy-cliente.test.ts). The proxy never reads the database: it decides from
 * the session's `app_metadata.tipo`, which only the server writes when the client's user is
 * created (the user cannot change it), and every page checks again with the database
 * (requireProfilo, requireCliente). Release B1a, docs/onboarding/rilascio-b.md.
 */

/**
 * Routes reachable without a session. The web app manifest is fetched by the
 * browser without cookies: behind the login it would never install. The
 * privacy policy is the Meta app's Privacy Policy and Data deletion URL: Meta's
 * crawler and anyone on Instagram must read it without an account.
 * The MCP endpoint and its OAuth metadata: Claude calls them without cookies
 * and must get 401, not a redirect to /login (the route checks the bearer
 * token itself). /oauth/consent stays behind the session.
 * The client's way in (1.78.0): the personal link, /entra and the page that says why a
 * session has no way in.
 */
export const PERCORSI_PUBBLICI = [
  '/login',
  '/auth',
  '/api/cron',
  '/manifest.webmanifest',
  '/privacy',
  '/mcp',
  '/.well-known',
  '/join',
  '/entra',
  '/accesso-negato',
] as const

function sotto(pathname: string, radice: string) {
  return pathname === radice || pathname.startsWith(`${radice}/`)
}

export function isPubblico(pathname: string) {
  return PERCORSI_PUBBLICI.some((p) => sotto(pathname, p))
}

/** The public pages that look at the session when opened: who is already in goes where she was going. */
export function leggeLaSessione(pathname: string, metodo: string) {
  return metodo === 'GET' && (pathname === '/login' || pathname === '/entra')
}

/**
 * HEAD on a personal link is refused (405): a preview that only asks for the headers must
 * not even read the link. Next would answer HEAD with the page's GET.
 */
export function headRifiutato(pathname: string, metodo: string) {
  return metodo === 'HEAD' && pathname.startsWith('/join/')
}

/** The pages with the Content-Security-Policy with a nonce: no script of others where the client's session lives. */
export function conCsp(pathname: string) {
  return sotto(pathname, '/percorso') || sotto(pathname, '/join') || sotto(pathname, '/entra')
}

/** Where a client may go with her session: her area, the sign-in and sign-out, the policy. */
const PERCORSI_CLIENTE = ['/percorso', '/auth', '/privacy', '/entra', '/join', '/accesso-negato', '/manifest.webmanifest']

export function ammessoAlCliente(pathname: string) {
  return PERCORSI_CLIENTE.some((p) => sotto(pathname, p))
}

export type Utente = { cliente: boolean } | null

export type Decisione =
  | { tipo: 'avanti' }
  | { tipo: 'redirect'; verso: string }
  | { tipo: 'json'; stato: 401 | 403; corpo: { errore: string } }

export const JSON_SENZA_SESSIONE = { errore: 'Accesso non valido: entra di nuovo.' }
export const JSON_NON_TUO = { errore: 'Questa parte non è del tuo percorso.' }

/**
 * The decision for one request, once the session is known (null: no session).
 * `ricerca`: the query of the request, with its «?».
 */
export function decidi(r: { pathname: string; ricerca: string; metodo: string; da: string | null; utente: Utente }): Decisione {
  const { pathname, ricerca, utente } = r

  if (utente) {
    // already signed in: no sign-in page again, straight to where she was going
    if (leggeLaSessione(pathname, r.metodo)) {
      if (utente.cliente) return { tipo: 'redirect', verso: destinazioneCliente(r.da) }
      return { tipo: 'redirect', verso: destinazioneSicura(r.da) }
    }
    if (utente.cliente && !isPubblico(pathname) && !ammessoAlCliente(pathname)) {
      if (sotto(pathname, '/api')) {
        return sotto(pathname, '/api/percorso') ? { tipo: 'avanti' } : { tipo: 'json', stato: 403, corpo: JSON_NON_TUO }
      }
      return { tipo: 'redirect', verso: '/percorso' }
    }
    return { tipo: 'avanti' }
  }

  if (isPubblico(pathname)) return { tipo: 'avanti' }
  if (sotto(pathname, '/api/percorso')) return { tipo: 'json', stato: 401, corpo: JSON_SENZA_SESSIONE }
  if (sotto(pathname, '/percorso')) {
    return { tipo: 'redirect', verso: `/entra?da=${encodeURIComponent(`${pathname}${ricerca}`)}` }
  }
  // the whole address, query included, rides in "da" alone: "Registra rinnovo" from a
  // reminder email (/sales/new?cliente=…&tipo=rinnovo) opens that client's renewal after
  // the sign-in, not an empty sale
  return { tipo: 'redirect', verso: `/login?da=${encodeURIComponent(`${pathname}${ricerca}`)}` }
}

/** The host of Supabase for img-src and connect-src: the origin of the project URL, or nothing. */
function origineSupabase(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

/**
 * The Content-Security-Policy of /percorso, /join and /entra (the Next guide for the nonce):
 * only the app's scripts with the request's nonce; YouTube only as an iframe from
 * youtube-nocookie.com; the attributes `style` allowed (no script).
 */
export function politicaCsp(nonce: string, supabaseUrl: string, sviluppo: boolean): string {
  const supabase = origineSupabase(supabaseUrl)
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${sviluppo ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ''} https://*.googleusercontent.com`,
    `connect-src 'self'${supabase ? ` ${supabase}` : ''}`,
    'frame-src https://www.youtube-nocookie.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

/** A fresh nonce for each request (base64 of a random uuid, as the Next guide does). */
export function nuovoNonce(): string {
  return btoa(crypto.randomUUID())
}
