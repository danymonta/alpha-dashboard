import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { destinazioneSicura } from '@/lib/auth/origine'
import { publicEnv } from '@/lib/env'

/**
 * Routes reachable without a session. The web app manifest is fetched by the
 * browser without cookies: behind the login it would never install. The
 * privacy policy is the Meta app's Privacy Policy and Data deletion URL: Meta's
 * crawler and anyone on Instagram must read it without an account.
 */
const PERCORSI_PUBBLICI = ['/login', '/auth', '/api/cron', '/manifest.webmanifest', '/privacy']

function isPubblico(pathname: string) {
  return PERCORSI_PUBBLICI.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

/**
 * Refreshes the auth cookies on every request and keeps unauthenticated users
 * out of the app. Authorization itself lives in RLS, not here.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Google's code (or Supabase's error) that landed on the home or on /login:
  // Supabase sends it to the Site URL when the return address is not in its
  // allow list (a new domain, before the dashboard is updated). Only page
  // navigations (the "Accedi con Google" button posts its server action to the
  // current URL, which may still carry ?code, and the callback answers GET only)
  // and only while a sign-in is pending in this browser (the PKCE verifier the
  // server exchange reads is there): an old ?code link goes the normal way.
  const accessoInCorso = request.cookies.getAll().some((c) => /^sb-.+-auth-token-code-verifier$/.test(c.name))
  if (
    request.method === 'GET' &&
    accessoInCorso &&
    (pathname === '/' || pathname === '/login') &&
    (searchParams.has('code') || searchParams.has('error'))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  // The public routes need no session, and the sign-in ones must not touch it:
  // refreshing a dead session clears the PKCE verifier together with it, and
  // the code coming back from Google can no longer be exchanged. Only opening
  // /login looks at the session, to send who is already in where they were going.
  if (isPubblico(pathname) && !(pathname === '/login' && request.method === 'GET')) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPubblico(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // the whole address, query included, rides in "da" alone: "Registra
    // rinnovo" from a reminder email (/sales/new?cliente=…&tipo=rinnovo)
    // opens that client's renewal after the sign-in, not an empty sale
    url.search = ''
    url.searchParams.set('da', `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(url)
  }

  // already signed in (the session cookie is valid): no Google button again,
  // straight to where they were going
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    const destinazione = destinazioneSicura(request.nextUrl.searchParams.get('da'))
    url.pathname = destinazione.split('?')[0]
    url.search = destinazione.includes('?') ? destinazione.slice(destinazione.indexOf('?')) : ''
    return NextResponse.redirect(url)
  }

  return response
}
