import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { getProfilo } from '@/lib/auth/session'
import { richiediAnalisi, RUOLI_ANALIZZA, SOLO_CHI_ANALIZZA, stessaOrigine, svegliaCatena } from '@/lib/marketing/analisi/richiedi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

const corpoSchema = z.object({ media_id: z.string().regex(/^[0-9]{1,30}$/) })

/**
 * «Analizza» (1.36.0, CLAUDE.md section 30): puts a reel's analysis in
 * the queue and wakes the chain. A route and not a server action: Next sends the
 * actions of a tab one at a time, and the work itself is not here anyway. Since
 * 1.39.0 this click is the only thing that makes Claude work on a reel: the
 * analysis and its score are one request.
 *
 * With the session of whoever asks, the database checks the role, the
 * limits (10 requests a day for the team, the month's spending) and what is
 * already going (marketing_analisi_richiedi, with its sentences). Only then,
 * with the service role created in svegliaCatena, the address of the steps is
 * written (never from the request: urlPassoMarketing() builds it from APP_URL)
 * and the chain is woken if the lease is free. 202 with the analysis id.
 */
export async function POST(request: NextRequest) {
  if (!stessaOrigine(request)) {
    return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 403, headers: NO_STORE })
  }
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo || !(RUOLI_ANALIZZA as readonly string[]).includes(profilo.ruolo)) {
    return NextResponse.json({ errore: SOLO_CHI_ANALIZZA }, { status: 403, headers: NO_STORE })
  }
  const letto = corpoSchema.safeParse(await request.json().catch(() => null))
  if (!letto.success) return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400, headers: NO_STORE })

  const esito = await richiediAnalisi(await createClient(), letto.data.media_id)
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 422, headers: NO_STORE })

  await svegliaCatena()
  return NextResponse.json({ id: esito.id }, { status: 202, headers: NO_STORE })
}
