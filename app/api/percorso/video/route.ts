import { NextResponse, type NextRequest } from 'next/server'

import { stessaOrigine } from '@/lib/auth/stessa-origine'
import { progressoVideo } from '@/lib/percorso/operazioni'
import { createClient } from '@/lib/supabase/server'

const SENZA_CACHE = { 'Cache-Control': 'no-store' }

/** The longest body: a block id, a length and 50 stretches. */
const CORPO_MAX = 4096

/**
 * The seconds of a video the client has seen (release B1a): a route and not a server action,
 * because the player sends them every 10-15 seconds, at the pause, at the end and when the
 * page hides (fetch with keepalive), and Next sends a tab's actions one at a time. The same
 * origin, the client's session, then video_progresso, which checks the block and the step.
 */
export async function POST(request: NextRequest) {
  if (!stessaOrigine(request)) {
    return NextResponse.json({ errore: 'Origine non valida.' }, { status: 403, headers: SENZA_CACHE })
  }

  const testo = await request.text()
  if (testo.length > CORPO_MAX) {
    return NextResponse.json({ errore: 'Richiesta troppo grande.' }, { status: 413, headers: SENZA_CACHE })
  }
  let corpo: unknown
  try {
    corpo = JSON.parse(testo)
  } catch {
    return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400, headers: SENZA_CACHE })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ errore: 'Accesso non valido: entra di nuovo.' }, { status: 401, headers: SENZA_CACHE })
  if (user.app_metadata?.tipo !== 'cliente') {
    return NextResponse.json({ errore: 'Questa parte non è del tuo percorso.' }, { status: 403, headers: SENZA_CACHE })
  }

  const esito = await progressoVideo(supabase, corpo)
  if (!esito.ok) {
    return NextResponse.json({ errore: esito.errore }, { status: esito.accesso ? 403 : 422, headers: SENZA_CACHE })
  }
  return NextResponse.json({ percentuale: esito.percentuale, visto: esito.visto }, { headers: SENZA_CACHE })
}
