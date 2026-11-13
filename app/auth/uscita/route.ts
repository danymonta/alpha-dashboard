import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { destinazioneUtente } from '@/lib/auth/destinazione'
import { togliSessione } from '@/lib/auth/dopo-login'
import { createClient } from '@/lib/supabase/server'

/** Nothing here may be kept by a cache: the answer takes a session away. */
const SENZA_CACHE = { 'Cache-Control': 'no-store' }

const MOTIVI = new Set(['nessun-account', 'percorso-concluso', 'disattivato'])

/**
 * A session that has no way in (release B1a): a user without a profile and without a
 * client's account, or a client whose path ended. The pages send it here
 * (requireProfilo, requireCliente) instead of /login, where the proxy would send it back:
 * the loop of before. It signs out this browser only (scope 'local'), takes the session
 * cookies away and says why on /accesso-negato. A session that has a way in (team, client
 * attivo or sospeso) is sent where it belongs instead, never signed out.
 */
export async function GET(request: NextRequest) {
  const motivo = request.nextUrl.searchParams.get('motivo')
  const cookieStore = await cookies()
  const supabase = await createClient()

  // only a session that really has no way in signs out here: a link from anywhere (a GET with
  // the Lax cookies) never takes the session of a person of the team or of an active client
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const destinazione = await destinazioneUtente(supabase, user)
    if (destinazione.esito === 'team' || destinazione.esito === 'cliente') {
      return NextResponse.redirect(new URL(destinazione.vai, request.nextUrl.origin), { headers: SENZA_CACHE })
    }
    if (destinazione.esito === 'errore') {
      // the database did not answer: never a sign-out; the page says so, with «Riprova»
      return NextResponse.redirect(new URL('/', request.nextUrl.origin), { headers: SENZA_CACHE })
    }
  }

  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // the cookies go anyway: the session in this browser is over
  }
  togliSessione(cookieStore)

  const verso = new URL('/accesso-negato', request.nextUrl.origin)
  if (motivo && MOTIVI.has(motivo)) verso.searchParams.set('motivo', motivo)
  return NextResponse.redirect(verso, { headers: SENZA_CACHE })
}
