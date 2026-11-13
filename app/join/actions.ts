'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { sessioneVecchia, togliSessioneVecchia } from '@/lib/auth/dopo-login'
import { origineCorrente } from '@/lib/auth/origine-server'
import { separaJoin } from '@/lib/onboarding/link'
import {
  COOKIE_REGISTRAZIONE,
  accountPerEmail,
  chiaveValida,
  mandaCodice,
  nuovaChiave,
  nuovoCodice,
  sha256,
} from '@/lib/percorso/accesso'
import { TESTI_REGISTRAZIONE as T } from '@/lib/percorso/testi'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  apriInvitoSchema,
  codiceRegistrazioneSchema,
  verificaRegistrazioneSchema,
} from '@/lib/validation/registrazione-cliente'

/**
 * The registration of a client from the personal link (release B1a,
 * docs/onboarding/rilascio-b.md, «/join e registrazione»). The service role only for the
 * functions onboarding_join_* and the admin API of Auth, with values taken from the
 * database (the reserved id, the address the code went to), never from the browser. The
 * token of the link never travels past the page GET: «Continua» trades it for a key in an
 * httpOnly cookie on /join. No token, code or address in a log.
 */

const DURATA_CHIAVE_S = 30 * 60

async function chiaveDalCookie(): Promise<string | null> {
  const valore = (await cookies()).get(COOKIE_REGISTRAZIONE)?.value
  return chiaveValida(valore) ? valore : null
}

export type StatoApertura = { stato: 'in_attesa' | 'non_attivo' | 'usato' | 'scaduto' | 'revocato' | 'non_valido' | 'errore' } | null

/**
 * «Continua» on the page of an active link: a new key (32 random bytes), its sha256 to
 * onboarding_join_apri, the key in the cookie, then /join/registrati. A link that is not
 * active any more answers its state, drawn by the same page (no redirect carries the token).
 */
export async function apriInvito(segmento: string): Promise<StatoApertura> {
  const parsed = apriInvitoSchema.safeParse({ segmento })
  const parti = parsed.success ? separaJoin(parsed.data.segmento) : null
  if (!parti) return { stato: 'non_valido' }

  const chiave = nuovaChiave()
  const { data, error } = await createAdminClient().rpc('onboarding_join_apri', {
    p_token_hash: sha256(parti.token),
    p_chiave_hash: sha256(chiave),
    p_slug: parti.slug,
  })
  if (error) {
    console.error('[join] apertura non riuscita:', error.code)
    return { stato: 'errore' }
  }
  const esito = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>).esito : null
  if (esito !== 'ok') {
    const stato =
      esito === 'in_attesa' || esito === 'non_attivo' || esito === 'usato' || esito === 'scaduto' || esito === 'revocato'
        ? esito
        : 'non_valido'
    return { stato }
  }

  const origine = await origineCorrente()
  ;(await cookies()).set(COOKIE_REGISTRAZIONE, chiave, {
    httpOnly: true,
    secure: origine.startsWith('https://'),
    sameSite: 'lax',
    path: '/join',
    maxAge: DURATA_CHIAVE_S,
  })
  redirect('/join/registrati')
}

export type EsitoInvioCodice =
  | { ok: true; email: string }
  | { ok: false; errore: string; scaduta?: true }

/**
 * «Inviami il codice»: an 8 digit code of ours (crypto.randomInt), its sha256 to
 * onboarding_join_codice, which counts every request and checks the address; with `invia`
 * the email goes through Resend now (the invite is one and the card belongs to whoever has
 * the link: waiting for Resend tells nothing).
 */
export async function inviaCodiceRegistrazione(input: unknown): Promise<EsitoInvioCodice> {
  const parsed = codiceRegistrazioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? T.emailNonAmmessa }
  const chiave = await chiaveDalCookie()
  if (!chiave) return { ok: false, errore: T.scaduta, scaduta: true }

  const { email } = parsed.data
  const codice = nuovoCodice()
  const { data, error } = await createAdminClient().rpc('onboarding_join_codice', {
    p_chiave_hash: sha256(chiave),
    p_email: email,
    p_codice_hash: sha256(codice),
  })
  if (error) {
    console.error('[join] codice non preparato:', error.code)
    return { ok: false, errore: T.nonPartita }
  }
  const r = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  switch (r.esito) {
    case 'invia':
      break
    case 'troppe_richieste':
      return { ok: false, errore: T.troppeRichieste }
    case 'email_non_ammessa':
      return { ok: false, errore: T.emailNonAmmessa }
    default:
      return { ok: false, errore: T.scaduta, scaduta: true }
  }

  const invio = await mandaCodice({
    tipo: 'registrazione',
    a: email,
    nome: typeof r.nome === 'string' ? r.nome : '',
    codice,
  })
  if (!invio.inviata) {
    console.error('[join] email del codice non partita:', invio.motivo)
    return { ok: false, errore: T.nonPartita }
  }
  return { ok: true, email }
}

export type EsitoRegistrazione =
  | { ok: true; vai: string }
  | { ok: false; errore: string; scaduta?: true; pronto?: true }

/**
 * The code: onboarding_join_verifica; with `ok` the user is born with the reserved id and
 * the address the code went to (both from the database), no password, app_metadata.tipo
 * 'cliente'; the trigger on auth.users writes the account in the same transaction. Then
 * Supabase's OTP from generateLink (checked: the same user) opens the session in the
 * cookies, as the team's code does.
 */
export async function verificaCodiceRegistrazione(input: unknown): Promise<EsitoRegistrazione> {
  const parsed = verificaRegistrazioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? T.errato }
  const chiave = await chiaveDalCookie()
  if (!chiave) return { ok: false, errore: T.scaduta, scaduta: true }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('onboarding_join_verifica', {
    p_chiave_hash: sha256(chiave),
    p_codice: parsed.data.codice,
  })
  if (error) {
    console.error('[join] verifica non riuscita:', error.code)
    return { ok: false, errore: T.nonCompletata }
  }
  const r = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  if (r.esito === 'errato') return { ok: false, errore: T.errato }
  if (r.esito === 'bloccato') return { ok: false, errore: T.bloccato }
  if (r.esito !== 'ok' || typeof r.utente_id !== 'string' || typeof r.email !== 'string') {
    return { ok: false, errore: T.scaduta, scaduta: true }
  }
  const utenteId = r.utente_id
  const email = r.email

  const cookieStore = await cookies()
  const { error: erroreCreazione } = await admin.auth.admin.createUser({
    id: utenteId,
    email,
    email_confirm: true,
    app_metadata: { tipo: 'cliente' },
  })
  if (erroreCreazione) {
    // the trigger, an address already of a user, a second tab that has just created the same id:
    // GoTrue hides the cause in a generic 500, so the database says what happened
    console.error('[join] utente non creato:', erroreCreazione.code ?? erroreCreazione.status)
    const account = await accountPerEmail(email).catch(() => null)
    if (account && account.userId === utenteId) {
      cookieStore.delete({ name: COOKIE_REGISTRAZIONE, path: '/join' })
      return { ok: false, errore: T.pronto, pronto: true }
    }
    return { ok: false, errore: T.nonCompletata }
  }

  // from here the user exists: whatever happens, «entra con la tua email»
  cookieStore.delete({ name: COOKIE_REGISTRAZIONE, path: '/join' })

  const { data: link, error: erroreLink } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const otp = link?.properties?.email_otp
  if (erroreLink || !link?.user || link.user.id !== utenteId || !otp) {
    console.error('[join] sessione non aperta: codice di accesso non generato', erroreLink?.code ?? '')
    return { ok: false, errore: T.pronto, pronto: true }
  }

  const vecchia = sessioneVecchia(cookieStore)
  const supabase = await createClient({ ignoraSessione: true })
  const { error: erroreSessione } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
  if (erroreSessione) {
    console.error('[join] sessione non aperta:', erroreSessione.code ?? erroreSessione.status)
    return { ok: false, errore: T.pronto, pronto: true }
  }
  togliSessioneVecchia(cookieStore, vecchia)

  return { ok: true, vai: '/percorso' }
}
