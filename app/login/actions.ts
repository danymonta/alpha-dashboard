'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { after } from 'next/server'

import { messaggioCodice, messaggioRichiesta, PAROLE_ACCESSO, esitoRichiestaCodice, esitoVerificaCodice } from '@/lib/auth/accesso'
import { isDevLoginEnabled } from '@/lib/auth/dev-login'
import {
  indirizzoRifiuto,
  sessioneVecchia,
  togliSessioneVecchia,
  verificaDopoLogin,
} from '@/lib/auth/dopo-login'
import { COOKIE_DOPO_LOGIN, destinazioneSicura } from '@/lib/auth/origine'
import { origineCorrente } from '@/lib/auth/origine-server'
import {
  TEMPO_LOGIN_MS,
  attendiFinoA,
  contaAccesso,
  contaIp,
  ipRichiesta,
  richiestaCodiceCliente,
} from '@/lib/percorso/accesso'
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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { errore: 'Credenziali non valide.' }
  }

  revalidatePath('/', 'layout')
  // a client of the seed (1.79.0) goes straight to his area: a redirect to / answered by the
  // proxy with /percorso would leave / in the address bar
  if (data?.user?.app_metadata?.tipo === 'cliente') redirect('/percorso')
  // back where the person was going, as after Google (the consent page of Claude's
  // connection comes back with its authorization_id): only a path of this app
  redirect(destinazioneSicura(typeof da === 'string' ? da : '/'))
}

export type EsitoAccessoCodice = { ok: true } | { ok: false; errore: string }

/** `vai`: the page to load next (a path of this app), the whole page and not a soft navigation: the session cookie is new. */
export type EsitoVerificaCodice = { ok: true; vai: string } | { ok: false; errore: string }

/**
 * Sends the sign-in email (a link and an 8 digit code) to an address that
 * already has an account. The invite gate stays where it was: shouldCreateUser
 * is false, so Supabase never creates a user here (the trigger on auth.users
 * would refuse a stranger anyway). The answer is the same for an address with
 * an account, one without and one deactivated; a deactivated person is
 * stopped after the sign-in, as with Google (verificaDopoLogin).
 *
 * A client of the path (release B1a) never receives the team's email: the same read for
 * every address (cliente_accesso_per_email) says whether it is a client's, and then the
 * client's email with the code goes after the answer (after(), the road of /entra). The
 * answer comes at a fixed time, 2 seconds from the start, for every outcome: the team's
 * road waits for Supabase at most until then (beyond, the neutral sentence, and the request
 * finishes in after()).
 *
 * «Too many requests» comes only from the app's limit per IP of the request (accesso_ip_conta),
 * before every road, the same for clients, team and strangers. Supabase's limit per IP is one
 * for the whole server (the requests leave from Vercel): its refusal is the neutral sentence,
 * otherwise anyone who exhausts it could tell a client's address (always «sent») from the others.
 * The team's road counts 10 codes an hour per address (invio_team, a refusal is the neutral
 * sentence too) and writes the last code sent, which verificaCodice wants before calling Supabase.
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

  // a client's address: the client's email, never the team's
  let cliente: Awaited<ReturnType<typeof richiestaCodiceCliente>>
  let ammessa = false
  try {
    if (!(await contaIp(await ipRichiesta(), 'richiesta'))) {
      await attendiFinoA(inizio, TEMPO_LOGIN_MS)
      return { ok: false, errore: PAROLE_ACCESSO.troppeRichieste }
    }
    cliente = await richiestaCodiceCliente(email, (lavoro) => after(lavoro))
    if (cliente === 'nessuno') ammessa = await contaAccesso(email, 'invio_team')
  } catch {
    console.error('[login] lettura dell’account del cliente non riuscita')
    await attendiFinoA(inizio, TEMPO_LOGIN_MS)
    return { ok: false, errore: PAROLE_ACCESSO.nonDisponibile }
  }
  if (cliente !== 'nessuno' || !ammessa) {
    await attendiFinoA(inizio, TEMPO_LOGIN_MS)
    return { ok: true }
  }

  const supabase = await createClient({ ignoraSessione: true })
  const richiesta = supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }).then(
    ({ error }) => ({ fatto: true as const, errore: error, rete: false }),
    () => ({ fatto: true as const, errore: null, rete: true }),
  )
  const scadenza = new Promise<{ fatto: false }>((r) =>
    setTimeout(() => r({ fatto: false }), Math.max(0, TEMPO_LOGIN_MS - (Date.now() - inizio))),
  )
  const primo = await Promise.race([richiesta, scadenza])

  if (!primo.fatto) {
    // Supabase is slow: the neutral sentence now, the request finishes after the answer
    after(async () => {
      const finale = await richiesta
      if (finale.errore) console.error('[login] codice non inviato:', finale.errore.code, finale.errore.status)
    })
    return { ok: true }
  }

  await attendiFinoA(inizio, TEMPO_LOGIN_MS)
  if (primo.rete) return { ok: false, errore: PAROLE_ACCESSO.connessione }
  // the cause goes to the logs without the address; the person gets the same words either way
  if (primo.errore) console.error('[login] codice non inviato:', primo.errore.code, primo.errore.status)

  const esito = esitoRichiestaCodice(primo.errore)
  // Supabase's limit per IP is the server's, not the visitor's: never told (see above)
  return esito === 'inviata' || esito === 'troppe-richieste' ? { ok: true } : { ok: false, errore: messaggioRichiesta(esito) }
}

/**
 * Signs in with the code from the email. On success it says where to go (the
 * page the person was heading to, or the home of their role, or /login with
 * the reason when the account is refused); on a wrong or expired code it says so.
 * It answers instead of redirecting: called from the form, a redirect to /login
 * itself would leave the form's own state behind.
 *
 * Supabase's limit of verifications per IP is one for the whole server: before calling it,
 * the app's limit per IP of the request (30 codes typed an hour) and the address must have
 * received a code from /login (or /entra) in the last 60 minutes with fewer than 5 wrong
 * codes (cliente_accesso_conta 'verifica'). Otherwise the answer of a wrong code.
 */
export async function verificaCodice(input: unknown): Promise<EsitoVerificaCodice> {
  const parsed = verificaCodiceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }
  const { email, codice, da } = parsed.data

  try {
    if (!(await contaIp(await ipRichiesta(), 'verifica'))) {
      return { ok: false, errore: PAROLE_ACCESSO.troppeRichieste }
    }
    if (!(await contaAccesso(email, 'verifica'))) {
      return { ok: false, errore: messaggioCodice('errato') }
    }
  } catch {
    return { ok: false, errore: PAROLE_ACCESSO.nonDisponibile }
  }

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
    const esito = esitoVerificaCodice(errore)
    if (esito === 'errato') await contaAccesso(email, 'errore').catch(() => undefined)
    return { ok: false, errore: messaggioCodice(esito) }
  }

  togliSessioneVecchia(cookieStore, vecchia)
  cookieStore.delete(COOKIE_DOPO_LOGIN)

  // profile there and active, or a client's account: the same check as Google and the link
  const esito = await verificaDopoLogin(supabase, cookieStore, da)
  if (!esito.ok) {
    return { ok: true, vai: indirizzoRifiuto(esito.motivo) }
  }

  return { ok: true, vai: esito.vai }
}
