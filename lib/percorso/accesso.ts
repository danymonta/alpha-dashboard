import 'server-only'

import { createHash, randomBytes, randomInt } from 'node:crypto'

import { headers } from 'next/headers'

import { emailCodiceCliente, type TipoEmailCodice } from '@/lib/email/cliente'
import { inviaEmail, type EsitoInvio } from '@/lib/email/invia'
import { publicEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The client's codes (release B1a, docs/onboarding/rilascio-b.md, «Autenticazione»). The
 * service role is used here only for the functions cliente_accesso_* and the admin API of
 * Auth, with values taken from the database (the account's user_id and email), never from
 * the browser. Never a token, a code or an address in a log.
 */

export function sha256(testo: string): string {
  return createHash('sha256').update(testo, 'utf8').digest('hex')
}

/** 8 digits from a cryptographic source, zeros included («00412907»). */
export function nuovoCodice(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, '0')
}

/** The cookie of the registration (/join): the key, 30 minutes, httpOnly, only on /join. */
export const COOKIE_REGISTRAZIONE = 'alpha-registrazione'

/** The key of the cookie of the registration: 32 random bytes, base64url (43 characters). */
export function nuovaChiave(): string {
  return randomBytes(32).toString('base64url')
}

export function chiaveValida(valore: string | null | undefined): valore is string {
  return typeof valore === 'string' && /^[A-Za-z0-9_-]{43}$/.test(valore)
}

export type AccountCliente = { userId: string; stato: 'attivo' | 'sospeso' | 'chiuso'; nome: string }

/** The client's account with this address, if any (every state): cliente_accesso_per_email. Throws when the database does not answer. */
export async function accountPerEmail(email: string): Promise<AccountCliente | null> {
  const { data, error } = await createAdminClient().rpc('cliente_accesso_per_email', { p_email: email })
  if (error) throw new Error(`cliente_accesso_per_email: ${error.code}`)
  const riga = Array.isArray(data) ? data[0] : null
  if (!riga || (riga.stato !== 'attivo' && riga.stato !== 'sospeso' && riga.stato !== 'chiuso')) return null
  return { userId: riga.user_id, stato: riga.stato, nome: riga.nome ?? '' }
}

/** The limits per address of /entra and /login: cliente_accesso_conta. Throws when the database does not answer. */
export async function contaAccesso(email: string, tipo: 'invio' | 'invio_team' | 'verifica' | 'errore'): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc('cliente_accesso_conta', { p_email: email, p_tipo: tipo })
  if (error) throw new Error(`cliente_accesso_conta: ${error.code}`)
  return data === true
}

/**
 * The IP of the request, as Vercel gives it (x-real-ip, or the first address of
 * x-forwarded-for); null on loopback (the dev server and the e2e, all from one machine) and
 * when there is none: no limit per IP there. Never logged.
 */
export function ipDaIntestazioni(h: Headers): string | null {
  const grezzo = h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? ''
  const ip = grezzo.trim().toLowerCase()
  if (!ip || ip.length > 100) return null
  if (ip === '::1' || ip === 'localhost' || ip.startsWith('127.') || ip.startsWith('::ffff:127.')) return null
  return ip
}

export async function ipRichiesta(): Promise<string | null> {
  return ipDaIntestazioni(await headers())
}

/**
 * The limit per IP of /entra and /login (accesso_ip_conta): 20 codes asked and 30 typed an
 * hour from one source, before every road, so one source never consumes the counters of
 * everybody. True without an IP. Throws when the database does not answer.
 */
export async function contaIp(ip: string | null, tipo: 'richiesta' | 'verifica'): Promise<boolean> {
  if (!ip) return true
  const { data, error } = await createAdminClient().rpc('accesso_ip_conta', { p_ip: ip, p_tipo: tipo })
  if (error) throw new Error(`accesso_ip_conta: ${error.code}`)
  return data === true
}

/** The logo of the emails, an image of the app (never a link). */
function urlLogo() {
  return `${publicEnv.appUrl.replace(/\/+$/, '')}/brand/percorso-alpha-email.png`
}

/** An email of a code to the client, through Resend (or Mailpit in the e2e), 8 seconds at most. */
export async function mandaCodice(m: {
  tipo: TipoEmailCodice
  a: string
  nome: string
  codice: string
}): Promise<EsitoInvio> {
  const email = emailCodiceCliente({ tipo: m.tipo, nome: m.nome, codice: m.codice, urlLogo: urlLogo() })
  return inviaEmail({
    a: m.a,
    ...email,
    // a retry after a lost answer never doubles it, and never names the code
    idempotenza: `codice-${m.tipo}-${sha256(m.codice + m.a).slice(0, 32)}`,
    timeoutMs: 8000,
  })
}

/**
 * The code of the return (/entra and the client's branch of /login), after the answer has
 * gone (inside `after()`): Supabase's OTP from generateLink without sending, checked against
 * the account's user (the same id cliente_accesso_per_email gave), then our email. Never
 * for an address without an account: on an address with no user GoTrue would try to create
 * one (the trigger on auth.users refuses it anyway: the net).
 */
export async function mandaCodiceAccesso(email: string, atteso: AccountCliente): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (error) {
      console.error('[entra] codice non generato:', error.code ?? error.status)
      return
    }
    if (!data.user || data.user.id !== atteso.userId) {
      console.error('[entra] utente diverso da quello dell’account: nessun invio')
      return
    }
    const codice = data.properties?.email_otp
    if (!codice || !/^\d{8}$/.test(codice)) {
      console.error('[entra] codice non valido da generateLink')
      return
    }
    const esito = await mandaCodice({ tipo: 'accesso', a: data.user.email ?? email, nome: atteso.nome, codice })
    if (!esito.inviata) console.error('[entra] email non partita:', esito.motivo)
  } catch {
    console.error('[entra] invio del codice non riuscito')
  }
}

/** Waits until `ms` milliseconds have passed since `inizio`: every answer takes the same time. */
export async function attendiFinoA(inizio: number, ms: number): Promise<void> {
  const resta = ms - (Date.now() - inizio)
  if (resta > 0) await new Promise((r) => setTimeout(r, resta))
}

/** The fixed times of the answers: /entra 1.2 seconds, /login 2 seconds. */
export const TEMPO_ENTRA_MS = 1200
export const TEMPO_LOGIN_MS = 2000

/**
 * «Send me a code» for an address that may be a client's (/entra and /login). It answers
 * whether the address is a client's (and so the team's road must not run), and schedules the
 * email for later through `pianifica` (after() of Next). It never says whether the address
 * has an account: the caller answers the same sentence after the same time.
 * - 'cliente': an account attivo or sospeso; the code is scheduled if the limits allow it
 * - 'chiuso': a closed account; nothing is sent (never the team's email to a client)
 * - 'nessuno': no client's account with this address
 * Throws when the database does not answer.
 */
export async function richiestaCodiceCliente(
  email: string,
  pianifica: (lavoro: () => Promise<void>) => void,
): Promise<'cliente' | 'chiuso' | 'nessuno'> {
  const account = await accountPerEmail(email)
  if (!account) return 'nessuno'
  if (account.stato === 'chiuso') return 'chiuso'
  // the limits are counted before the answer; a refusal is the same neutral answer
  if (await contaAccesso(email, 'invio')) pianifica(() => mandaCodiceAccesso(email, account))
  return 'cliente'
}
