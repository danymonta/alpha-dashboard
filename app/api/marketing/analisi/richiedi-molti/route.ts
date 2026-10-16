import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { getProfilo } from '@/lib/auth/session'
import { richiediAnalisi, RUOLI_ANALIZZA, SOLO_CHI_ANALIZZA, stessaOrigine, svegliaCatena } from '@/lib/marketing/analisi/richiedi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** At most the day's requests of the team: more would only be refused one by one. */
const corpoSchema = z.object({ media_ids: z.array(z.string().regex(/^[0-9]{1,30}$/)).min(1).max(10) })

/**
 * «Valuta i reel non valutati» (1.39.0): the click of «Analizza» on several reels at once, one request each,
 * with the session of whoever asks and the same checks (role, 10 requests a day for the team, the month's
 * spending, a reel already going). It stops at the first refusal that is a limit (the day's requests, the
 * month's spending) and says why; a reel that cannot be analysed (gone from Instagram, already going) is
 * skipped. One confirmation on the page, one cost shown before: this is still a click of a person, never
 * something the app does by itself. 202 with how many were queued.
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

  const supabase = await createClient()
  let accodate = 0
  let saltate = 0
  let fermata: string | null = null
  for (const id of new Set(letto.data.media_ids)) {
    const esito = await richiediAnalisi(supabase, id)
    if (esito.ok) {
      accodate++
      continue
    }
    // a limit stops the rest; any other refusal is only this reel's
    if (/oggi sono finite|limite di spesa/.test(esito.errore)) {
      fermata = esito.errore
      break
    }
    saltate++
  }

  if (accodate > 0) await svegliaCatena()
  return NextResponse.json({ accodate, saltate, fermata }, { status: accodate > 0 ? 202 : 422, headers: NO_STORE })
}
