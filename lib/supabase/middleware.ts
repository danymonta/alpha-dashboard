import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  const { pathname } = request.nextUrl

  if (!user && !isPubblico(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('da', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
