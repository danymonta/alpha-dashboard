import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { COOKIE_DOPO_LOGIN, destinazioneSicura } from '@/lib/auth/origine'
import { percorsoIniziale } from '@/lib/auth/roles'
import { COOKIE_SESSIONE, createClient } from '@/lib/supabase/server'

type CookieStore = Awaited<ReturnType<typeof cookies>>

/** Every session cookie in the response goes: signOut() cannot see them through the filtered client. */
function togliSessione(cookieStore: CookieStore) {
  for (const { name } of cookieStore.getAll()) {
    if (COOKIE_SESSIONE.test(name)) cookieStore.delete(name)
  }
}

/**
 * OAuth landing. The invite gate lives in the database trigger: when the email
 * is not invited, Supabase refuses to create the user and reports it here.
 * Every other failure gets its own reason, and the real cause goes to the logs.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const cookieStore = await cookies()
  // the sign-in started with a cookie saying where to go; old links carried it in the query
  const da = searchParams.get('da') ?? cookieStore.get(COOKIE_DOPO_LOGIN)?.value ?? null
  cookieStore.delete(COOKIE_DOPO_LOGIN)

  if (searchParams.get('error')) {
    const descrizione = searchParams.get('error_description') ?? ''
    console.error('[auth/callback] errore da Supabase:', searchParams.get('error'), descrizione)
    // the invite gate raises inside the insert into auth.users: a database error
    const motivo = /database error|invit/i.test(descrizione) ? 'accesso-negato' : 'callback'
    return NextResponse.redirect(`${origin}/login?errore=${motivo}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?errore=callback`)
  }

  // The session already in the browser, as it came in. Hidden from the
  // exchange (a dead one would take the PKCE verifier with it) and left alone
  // if the exchange fails: an old or forged ?code never signs anyone out.
  const sessioneVecchia = cookieStore
    .getAll()
    .filter((c) => COOKIE_SESSIONE.test(c.name))
    .map((c) => ({ nome: c.name, valore: c.value }))

  const supabase = await createClient({ ignoraSessione: true })
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] scambio del codice non riuscito:', error.code, error.message)
    return NextResponse.redirect(`${origin}/login?errore=callback`)
  }

  // the new session is written: what it did not overwrite of the old one goes
  // (a stale ".2" chunk must never be glued to the new session)
  for (const { nome, valore } of sessioneVecchia) {
    if (cookieStore.get(nome)?.value === valore) cookieStore.delete(nome)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?errore=callback`)
  }

  const { data: profilo, error: erroreProfilo } = await supabase
    .from('profiles')
    .select('ruolo, attivo')
    .eq('id', user.id)
    .maybeSingle()

  // the database did not answer (e.g. a deploy reloading its schema): not a
  // refusal. Only this browser gives the new session back, the others stay in.
  if (erroreProfilo) {
    console.error('[auth/callback] profilo non letto:', erroreProfilo.code, erroreProfilo.message)
    await supabase.auth.signOut({ scope: 'local' })
    togliSessione(cookieStore)
    return NextResponse.redirect(`${origin}/login?errore=callback`)
  }

  if (!profilo) {
    console.error('[auth/callback] utente senza profilo:', user.id)
    await supabase.auth.signOut()
    togliSessione(cookieStore)
    return NextResponse.redirect(`${origin}/login?errore=accesso-negato`)
  }

  if (!profilo.attivo) {
    await supabase.auth.signOut()
    togliSessione(cookieStore)
    return NextResponse.redirect(`${origin}/login?errore=disattivato`)
  }

  const sicura = destinazioneSicura(da)
  const destinazione = sicura === '/' ? percorsoIniziale(profilo.ruolo) : sicura

  return NextResponse.redirect(`${origin}${destinazione}`)
}
