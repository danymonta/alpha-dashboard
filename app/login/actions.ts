'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { messaggioCodice, messaggioRichiesta, PAROLE_ACCESSO, esitoRichiestaCodice, esitoVerificaCodice } from '@/lib/auth/accesso'
import { isDevLoginEnabled } from '@/lib/auth/dev-login'
import {
  destinazioneDopoLogin,
  sessioneVecchia,
  togliSessioneVecchia,
  verificaDopoLogin,
} from '@/lib/auth/dopo-login'
import { COOKIE_DOPO_LOGIN, destinazioneSicura } from '@/lib/auth/origine'
import { origineCorrente } from '@/lib/auth/origine-server'
import { createClient } from '@/lib/supabase/server'
import { richiestaCodiceSchema, verificaCodiceSchema } from '@/lib/validation/accesso'

export type StatoLogin = { errore?: string }

export async function accediConGoogle(formData: FormData): Promise<void> {
  const da = destinazioneSicura(String(formData.get('da') ?? '/'))
  const supabase = await createClient()
  // back to the domain the person is on (dashboard.percorsoalpha.com), not to
  // whatever APP_URL said at build time: cookies live on one domain only
  const origine = await origineCorrente()

  // the return address stays exactly "/auth/callback" (Supabase's allow list
  // compares the query too): where to go afterwards rides in a cookie
  ;(await cookies()).set(COOKIE_DOPO_LOGIN, da, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origine.startsWith('https://'),
    path: '/',
    maxAge: 60 * 15,
  })

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origine}/auth/callback`,
    },
  })

  if (error || !data.url) {
    redirect('/login?errore=google')
  }

  redirect(data.url)
}

/**
 * Local development only: signs in a seed user with email and password. da:
 * where to go afterwards, bound by the form (the page's ?da=), checked here.
 */
export async function accediConPassword(
  da: string,
  _statoPrecedente: StatoLogin,
  formData: FormData,
): Promise<StatoLogin> {
  if (!isDevLoginEnabled()) {
    return { errore: 'Login di sviluppo non disponibile.' }
  }

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { errore: 'Inserisci email e password.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { errore: 'Credenziali non valide.' }
  }

  revalidatePath('/', 'layout')
  // back where the person was going, as after Google (the consent page of Claude's
  // connection comes back with its authorization_id): only a path of this app
  redirect(destinazioneSicura(typeof da === 'string' ? da : '/'))
}

export type EsitoAccessoCodice = { ok: true } | { ok: false; errore: string }

/** `vai`: the page to load next (a path of this app), the whole page and not a soft navigation: the session cookie is new. */
export type EsitoVerificaCodice = { ok: true; vai: string } | { ok: false; errore: string }

/**
 * An answer takes at least this long: with an address that has an account the
 * email is really sent (slow), with one that has none nothing happens (fast),
 * and the difference in time would tell them apart.
 */
const RISPOSTA_MINIMA_MS = 1200

async function almenoFinoA(inizio: number) {
  const resta = RISPOSTA_MINIMA_MS - (Date.now() - inizio)
  if (resta > 0) await new Promise((r) => setTimeout(r, resta))
}

/**
 * Sends the sign-in email (a link and a 6 digit code) to an address that
 * already has an account. The invite gate stays where it was: shouldCreateUser
 * is false, so Supabase never creates a user here (the trigger on auth.users
 * would refuse a stranger anyway). The answer is the same for an address with
 * an account, one without and one deactivated; a deactivated person is
 * stopped after the sign-in, as with Google (verificaDopoLogin).
 */
export async function richiediCodice(input: unknown): Promise<EsitoAccessoCodice> {
  const inizio = Date.now()
  const parsed = richiestaCodiceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }
  const { email, da } = parsed.data
  const origine = await origineCorrente()

  // where to go afterwards rides in the same cookie as with Google: the link in
  // the email is the same for everyone, and opened elsewhere it just goes home
  ;(await cookies()).set(COOKIE_DOPO_LOGIN, destinazioneSicura(da), {
    httpOnly: true,
    sameSite: 'lax',
    secure: origine.startsWith('https://'),
    path: '/',
    maxAge: 60 * 60,
  })

  const supabase = await createClient({ ignoraSessione: true })
  let errore: Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>['error']
  try {
    ;({ error: errore } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    }))
  } catch {
    await almenoFinoA(inizio)
    return { ok: false, errore: PAROLE_ACCESSO.connessione }
  }

  // the cause goes to the logs without the address; the person gets the same words either way
  if (errore) console.error('[login] codice non inviato:', errore.code, errore.status)

  const esito = esitoRichiestaCodice(errore)
  await almenoFinoA(inizio)
  return esito === 'inviata' ? { ok: true } : { ok: false, errore: messaggioRichiesta(esito) }
}

/**
 * Signs in with the code from the email. On success it says where to go (the
 * page the person was heading to, or the home of their role, or /login with
 * the reason when the account is refused); on a wrong or expired code it says so.
 * It answers instead of redirecting: called from the form, a redirect to /login
 * itself would leave the form's own state behind.
 */
export async function verificaCodice(input: unknown): Promise<EsitoVerificaCodice> {
  const parsed = verificaCodiceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }
  const { email, codice, da } = parsed.data

  const cookieStore = await cookies()
  const vecchia = sessioneVecchia(cookieStore)
  const supabase = await createClient({ ignoraSessione: true })

  let errore: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>['error']
  try {
    ;({ error: errore } = await supabase.auth.verifyOtp({ email, token: codice, type: 'email' }))
  } catch {
    return { ok: false, errore: PAROLE_ACCESSO.connessione }
  }
  if (errore) {
    console.error('[login] codice non verificato:', errore.code, errore.status)
    return { ok: false, errore: messaggioCodice(esitoVerificaCodice(errore)) }
  }

  togliSessioneVecchia(cookieStore, vecchia)
  cookieStore.delete(COOKIE_DOPO_LOGIN)

  // profile there and active: the same check as Google and the link
  const esito = await verificaDopoLogin(supabase, cookieStore)
  if (!esito.ok) {
    return { ok: true, vai: `/login?errore=${esito.motivo}` }
  }

  return { ok: true, vai: destinazioneDopoLogin(da, esito.ruolo) }
}
