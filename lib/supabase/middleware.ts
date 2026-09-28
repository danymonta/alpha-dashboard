import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { destinazioneSicura } from '@/lib/auth/origine'
import { publicEnv } from '@/lib/env'

/**
 * Routes reachable without a session. The web app manifest is fetched by the
 * browser without cookies: behind the login it would never install.
 */
const PERCORSI_PUBBLICI = ['/login', '/auth', '/api/cron', '/manifest.webmanifest']

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
  const { pathname } = request.nextUrl

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
    url.searchParams.set('da', pathname)
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
