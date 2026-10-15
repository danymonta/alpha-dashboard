import 'server-only'

import {
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
  verifyBearerToken,
  type AuthInfo,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server'
import {
  createClient,
  isAuthApiError,
  isAuthError,
  isAuthRetryableFetchError,
  type SupabaseClient,
} from '@supabase/supabase-js'

import { publicEnv } from '@/lib/env'
import type { Database } from '@/lib/supabase/database.types'

import { isRuoloMcp, type RuoloMcp } from './contesto'
import { indirizziMcp } from './indirizzi'
import { registraAccesso, type MotivoAccesso } from './registro'

/**
 * Who is calling /mcp (Claude connected to the content calendar, 09/10/2026).
 * The token is an access token of Supabase Auth's OAuth 2.1 server: an
 * ordinary Supabase JWT plus client_id and session_id. Checked on every
 * request: signature and expiry (auth-js getClaims, JWKS cached), issuer,
 * aud, client_id (a JWT of the web app has none and never gets in), expiry
 * not within 30 seconds, then mcp_chi_sono() with the same token: a live OAuth
 * session of a client registered by hand, an active admin, video editor or
 * marketing person, and the Data API filter that ran on that very request.
 *
 * 401 only for a token that is wrong or dead: Claude answers a 401 by
 * refreshing (Supabase rotates the refresh token) and, when that fails, by
 * running the whole sign-in again, so a Supabase hiccup must never be a 401.
 * Network, timeouts and 5xx are 503 with Retry-After, failing closed. A role
 * that may not use Claude is 403 insufficient_scope: Claude sends the person
 * to the consent page, which says why. The token never reaches a log.
 */

/** A token this close to its exp gets 401: Claude refreshes before PostgREST refuses it mid-call. */
const MARGINE_SCADENZA_S = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MESSAGGIO_401 = 'Il collegamento con Claude non è valido o è scaduto: ricollega Alpha Management in Claude.'
export const MESSAGGIO_RUOLO =
  'Il tuo account non può usare Alpha Management da Claude: lo possono collegare l’admin, il video editor e il marketing, con l’account attivo.'
const MESSAGGIO_SOSPESO = 'Il collegamento a Claude è sospeso: avvisa l’admin.'
const MESSAGGIO_NON_DISPONIBILE = 'Alpha Management non risponde adesso: riprova tra poco.'

/** Network, timeout, 5xx, JWKS unreachable: 503 with Retry-After, never 401. */
class Temporaneo extends Error {
  constructor(readonly codice: string) {
    super('temporaneo')
  }
}

/** The Data API filter did not run on this request: 503, fail closed. */
class FiltroAssente extends Error {}

/** Why each refusal happened, for the log line only (the header says it in plain ASCII English). */
const motivi = new WeakMap<Error, MotivoAccesso>()

function invalido(motivo: MotivoAccesso, descrizione: string): OAuthError {
  const errore = new OAuthError(OAuthErrorCode.InvalidToken, descrizione)
  motivi.set(errore, motivo)
  return errore
}

function senzaPermesso(): OAuthError {
  // ASCII only: the SDK turns every other character of the header into a space
  const errore = new OAuthError(OAuthErrorCode.InsufficientScope, 'Account not enabled for Claude')
  motivi.set(errore, 'ruolo')
  return errore
}

const OPZIONI_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const

let verificatoreCondiviso: SupabaseClient<Database> | null = null

/** Module-wide and lazy: it holds no user data; auth-js caches the JWKS on it for 10 minutes. */
function verificatore(): SupabaseClient<Database> {
  verificatoreCondiviso ??= createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: OPZIONI_AUTH,
  })
  return verificatoreCondiviso
}

/**
 * A Supabase client that speaks to PostgREST as the person, with their own
 * OAuth token: RLS applies, the Data API filter applies. Per request, never
 * cached, never the service role.
 */
export function clientConToken(token: string): SupabaseClient<Database> {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: OPZIONI_AUTH,
  })
}

/** A wrong token (bad signature, malformed, expired, unknown key) is 401; Supabase not answering is 503. */
function erroreJwtOTemporaneo(errore: unknown): Error {
  if (isAuthRetryableFetchError(errore)) return new Temporaneo('auth_rete')
  if (isAuthApiError(errore)) {
    return errore.status >= 500 ? new Temporaneo(`auth_${errore.status}`) : invalido('firma', 'Invalid token')
  }
  if (isAuthError(errore)) {
    // AuthUnknownError: a body that is not JSON (a proxy page, a 502): Supabase, not the token
    if (errore.name === 'AuthUnknownError' || (errore.status ?? 0) >= 500) return new Temporaneo('auth_sconosciuto')
    return invalido('firma', 'Invalid token')
  }
  // decodeJWT parses the header and the payload: JSON that is not JSON is a wrong token
  if (errore instanceof SyntaxError) return invalido('firma', 'Invalid token')
  return new Temporaneo('auth_eccezione')
}

function audAutenticato(aud: unknown): boolean {
  return aud === 'authenticated' || (Array.isArray(aud) && aud.includes('authenticated'))
}

type RispostaChiSono = { esito?: string; ruolo?: unknown; filtro?: unknown }

const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token) {
    const { emittente } = indirizziMcp()
    let claims: Record<string, unknown>
    try {
      const { data, error } = await verificatore().auth.getClaims(token)
      if (error) throw erroreJwtOTemporaneo(error)
      if (!data) throw invalido('firma', 'Invalid token')
      claims = data.claims as unknown as Record<string, unknown>
    } catch (e) {
      if (e instanceof OAuthError || e instanceof Temporaneo) throw e
      throw erroreJwtOTemporaneo(e)
    }

    if (claims.iss !== emittente) throw invalido('emittente', 'Invalid token')
    if (claims.role !== 'authenticated' || !audAutenticato(claims.aud)) throw invalido('firma', 'Invalid token')
    // GoTrue writes client_id only on OAuth sessions: a JWT of the web app stops here
    if (typeof claims.client_id !== 'string' || !UUID.test(claims.client_id)) throw invalido('client', 'Invalid token')
    if (typeof claims.sub !== 'string' || typeof claims.session_id !== 'string' || typeof claims.exp !== 'number') {
      throw invalido('firma', 'Invalid token')
    }
    if (claims.exp < Date.now() / 1000 + MARGINE_SCADENZA_S) throw invalido('scadenza', 'Token expired')

    const { data, error, status } = await clientConToken(token).rpc('mcp_chi_sono')
    if (error) {
      // PostgREST refused the JWT itself (HTTP 401, PGRST301/302/303): the token. Anything else
      // (network, 5xx, a timeout, an unexpected 42501) is Supabase or the setup: 503, fail closed.
      if (status === 401 || /^PGRST30[123]$/.test(error.code ?? '')) throw invalido('jwt_postgrest', 'Invalid token')
      throw new Temporaneo(error.code || `http_${status}`)
    }
    const risposta = (data ?? {}) as RispostaChiSono
    if (risposta.esito === 'ruolo') throw senzaPermesso()
    if (risposta.esito !== 'ok' || !isRuoloMcp(risposta.ruolo)) throw invalido('sessione', 'Session ended')
    if (risposta.filtro !== true) throw new FiltroAssente()

    return {
      token,
      clientId: claims.client_id,
      scopes: [],
      expiresAt: claims.exp,
      extra: { ruolo: risposta.ruolo, sessione: claims.session_id },
    }
  },
}

export type AccessoMcp =
  | { ok: true; authInfo: AuthInfo; ruolo: RuoloMcp; sessione: string }
  | { ok: false; risposta: Response }

function rispostaJson(stato: number, corpo: Record<string, string>, intestazioni: Record<string, string> = {}): Response {
  return Response.json(corpo, { status: stato, headers: { 'Cache-Control': 'no-store', ...intestazioni } })
}

/** The access to /mcp: the person behind the bearer token, or the answer to send back. */
export async function autenticaMcp(intestazione: string | null): Promise<AccessoMcp> {
  const { metadati } = indirizziMcp()
  try {
    const authInfo = await verifyBearerToken(intestazione, { verifier, resourceMetadataUrl: metadati })
    const ruolo = authInfo.extra?.ruolo
    const sessione = authInfo.extra?.sessione
    if (!isRuoloMcp(ruolo) || typeof sessione !== 'string') throw invalido('sessione', 'Session ended')
    return { ok: true, authInfo, ruolo, sessione }
  } catch (e) {
    if (e instanceof OAuthError) {
      // status and WWW-Authenticate (with resource_metadata) from the SDK, the body in Italian
      const sdk = bearerAuthChallengeResponse(e, { resourceMetadataUrl: metadati })
      const motivo = motivi.get(e) ?? (e.code === OAuthErrorCode.InsufficientScope ? 'ruolo' : 'intestazione')
      registraAccesso({ stato: sdk.status, motivo })
      const sfida = sdk.headers.get('WWW-Authenticate')
      return {
        ok: false,
        risposta: rispostaJson(
          sdk.status,
          { error: e.code, messaggio: sdk.status === 403 ? MESSAGGIO_RUOLO : MESSAGGIO_401 },
          sfida ? { 'WWW-Authenticate': sfida } : {},
        ),
      }
    }
    if (e instanceof FiltroAssente) {
      registraAccesso({ stato: 503, motivo: 'filtro_assente' })
      return { ok: false, risposta: rispostaJson(503, { error: 'filtro_assente', messaggio: MESSAGGIO_SOSPESO }) }
    }
    registraAccesso({ stato: 503, motivo: 'temporaneo', codice: e instanceof Temporaneo ? e.codice : 'eccezione' })
    return {
      ok: false,
      risposta: rispostaJson(
        503,
        { error: 'non_disponibile', messaggio: MESSAGGIO_NON_DISPONIBILE },
        { 'Retry-After': '30' },
      ),
    }
  }
}
