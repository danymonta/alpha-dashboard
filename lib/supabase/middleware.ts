import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { conCsp, decidi, isPubblico, leggeLaSessione, nuovoNonce, politicaCsp } from '@/lib/auth/proxy-regole'
import { publicEnv } from '@/lib/env'

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

  // The Content-Security-Policy with a nonce of the client's pages (release B1a): the request
  // carries it too, so that Next puts the nonce on its own scripts (the Next guide).
  const nonce = conCsp(pathname) ? nuovoNonce() : null
  const csp = nonce ? politicaCsp(nonce, publicEnv.supabaseUrl, process.env.NODE_ENV === 'development') : null

  function intestazioniRichiesta() {
    if (!csp || !nonce) return request.headers
    const h = new Headers(request.headers)
    h.set('x-nonce', nonce)
    h.set('Content-Security-Policy', csp)
    return h
  }

  function avanti() {
    const r = NextResponse.next({ request: { headers: intestazioniRichiesta() } })
    if (csp) r.headers.set('Content-Security-Policy', csp)
    return r
  }

  // The public routes need no session, and the sign-in ones must not touch it:
  // refreshing a dead session clears the PKCE verifier together with it, and
  // the code coming back from Google can no longer be exchanged. Only opening
  // /login or /entra looks at the session, to send who is already in where they were going.
  if (isPubblico(pathname) && !leggeLaSessione(pathname, request.method)) {
    return avanti()
  }

  let response = avanti()

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
          response = avanti()
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

  // the proxy never reads the database: a client is the one whose app_metadata says so (only
  // the server writes it, when it creates the user); every page checks again
  const decisione = decidi({
    pathname,
    ricerca: request.nextUrl.search,
    metodo: request.method,
    da: searchParams.get('da'),
    utente: user ? { cliente: user.app_metadata?.tipo === 'cliente' } : null,
  })

  if (decisione.tipo === 'redirect') {
    const url = request.nextUrl.clone()
    const domanda = decisione.verso.indexOf('?')
    url.pathname = domanda >= 0 ? decisione.verso.slice(0, domanda) : decisione.verso
    url.search = domanda >= 0 ? decisione.verso.slice(domanda) : ''
    return NextResponse.redirect(url)
  }
  if (decisione.tipo === 'json') {
    return NextResponse.json(decisione.corpo, { status: decisione.stato, headers: { 'Cache-Control': 'no-store' } })
  }

  return response
}
