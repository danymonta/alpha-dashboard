import { NextResponse, type NextRequest } from 'next/server'

import { destinazioneSicura } from '@/lib/auth/origine'
import { percorsoIniziale } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'

/**
 * OAuth landing. The invite gate lives in the database trigger: when the email
 * is not invited, Supabase refuses to create the user and reports it here.
 * Every other failure gets its own reason, and the real cause goes to the logs.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const da = searchParams.get('da')

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

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] scambio del codice non riuscito:', error.code, error.message)
    return NextResponse.redirect(`${origin}/login?errore=callback`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?errore=callback`)
  }

  const { data: profilo } = await supabase
    .from('profiles')
    .select('ruolo, attivo')
    .eq('id', user.id)
    .maybeSingle()

  if (!profilo) {
    console.error('[auth/callback] utente senza profilo:', user.id)
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?errore=accesso-negato`)
  }

  if (!profilo.attivo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?errore=disattivato`)
  }

  const sicura = destinazioneSicura(da)
  const destinazione = sicura === '/' ? percorsoIniziale(profilo.ruolo) : sicura

  return NextResponse.redirect(`${origin}${destinazione}`)
}
