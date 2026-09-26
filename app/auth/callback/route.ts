import { NextResponse, type NextRequest } from 'next/server'

import { percorsoIniziale } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'

/**
 * OAuth landing. The invite gate lives in the database trigger: when the email
 * is not invited the exchange fails and we send the person back with a reason.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const da = searchParams.get('da')

  if (searchParams.get('error')) {
    return NextResponse.redirect(`${origin}/login?errore=accesso-negato`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?errore=callback`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?errore=accesso-negato`)
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
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?errore=accesso-negato`)
  }

  if (!profilo.attivo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?errore=disattivato`)
  }

  const destinazione =
    da && da.startsWith('/') && da !== '/login' ? da : percorsoIniziale(profilo.ruolo)

  return NextResponse.redirect(`${origin}${destinazione}`)
}
