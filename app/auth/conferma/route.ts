import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { motivoLoginPerLink } from '@/lib/auth/accesso'
import {
  indirizzoRifiuto,
  sessioneVecchia,
  togliSessioneVecchia,
  verificaDopoLogin,
} from '@/lib/auth/dopo-login'
import { COOKIE_DOPO_LOGIN } from '@/lib/auth/origine'
import { createClient } from '@/lib/supabase/server'
import { linkAccessoSchema } from '@/lib/validation/accesso'

/** Nothing here may be kept by a cache or a proxy: the answer carries a session. */
const SENZA_CACHE = { 'Cache-Control': 'no-store' }

function verso(origin: string, percorso: string) {
  return NextResponse.redirect(`${origin}${percorso}`, { headers: SENZA_CACHE })
}

/**
 * The link in the sign-in email: /auth/conferma?token_hash=…&type=email.
 *
 * It uses the token_hash flow (verifyOtp), not the PKCE one (a ?code= with a
 * verifier cookie): PKCE only works in the browser that asked for the link,
 * while the email is often opened from the mail app's own browser or from
 * another device, where there is no verifier. The invite gate is the same as
 * ever: the code was asked with shouldCreateUser: false, so this never creates
 * a user, and the profile check is the one of Google (verificaDopoLogin).
 *
 * GET only (a link is opened with GET; HEAD is refused below so that a preview
 * that only asks for the headers cannot use the link up). Token and email are
 * never logged.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const cookieStore = await cookies()
  // where the code was asked from: a cookie set then (the link itself is the same for everyone)
  const da = searchParams.get('da') ?? cookieStore.get(COOKIE_DOPO_LOGIN)?.value ?? null
  cookieStore.delete(COOKIE_DOPO_LOGIN)

  const link = linkAccessoSchema.safeParse({
    token_hash: searchParams.get('token_hash'),
    type: searchParams.get('type'),
  })
  if (!link.success) {
    return verso(origin, '/login?errore=link-scaduto')
  }

  const vecchia = sessioneVecchia(cookieStore)
  const supabase = await createClient({ ignoraSessione: true })
  const { error } = await supabase.auth.verifyOtp({
    token_hash: link.data.token_hash,
    type: link.data.type,
  })

  if (error) {
    console.error('[auth/conferma] link non verificato:', error.code, error.status)
    return verso(origin, `/login?errore=${motivoLoginPerLink(error)}`)
  }

  togliSessioneVecchia(cookieStore, vecchia)

  const esito = await verificaDopoLogin(supabase, cookieStore, da)
  if (!esito.ok) {
    return verso(origin, indirizzoRifiuto(esito.motivo))
  }

  return verso(origin, esito.vai)
}

export function HEAD() {
  return new Response(null, { status: 405, headers: { ...SENZA_CACHE, Allow: 'GET' } })
}
