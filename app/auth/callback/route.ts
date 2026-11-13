import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import {
  indirizzoRifiuto,
  sessioneVecchia,
  togliSessioneVecchia,
  verificaDopoLogin,
} from '@/lib/auth/dopo-login'
import { COOKIE_DOPO_LOGIN } from '@/lib/auth/origine'
import { createClient } from '@/lib/supabase/server'

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

  // The session already in the browser, as it came in: see sessioneVecchia.
  const vecchia = sessioneVecchia(cookieStore)

  const supabase = await createClient({ ignoraSessione: true })
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] scambio del codice non riuscito:', error.code, error.message)
    return NextResponse.redirect(`${origin}/login?errore=callback`)
  }

  togliSessioneVecchia(cookieStore, vecchia)

  // profile there and active: the same check as the code and the link
  const esito = await verificaDopoLogin(supabase, cookieStore, da)
  if (!esito.ok) {
    return NextResponse.redirect(`${origin}${indirizzoRifiuto(esito.motivo)}`)
  }

  return NextResponse.redirect(`${origin}${esito.vai}`)
}
