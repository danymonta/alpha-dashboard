import { NextResponse, type NextRequest } from 'next/server'

import { eVecchiaPagina, indirizzoDaVecchiaPagina } from '@/lib/marketing/pubblicati/vecchi-indirizzi'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  // «Post di Instagram» and «Analisi» are one page now, «Pubblicati» (25/10/2026): a permanent redirect that keeps
  // what still means something (the reel or the content open, the period, the reels to change, the posts not in the plan)
  if (eVecchiaPagina(request.nextUrl.pathname)) {
    const [percorso, ricerca = ''] = indirizzoDaVecchiaPagina(request.nextUrl.searchParams).split('?')
    const destinazione = request.nextUrl.clone()
    destinazione.pathname = percorso
    destinazione.search = ricerca ? `?${ricerca}` : ''
    return NextResponse.redirect(destinazione, 308)
  }
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
