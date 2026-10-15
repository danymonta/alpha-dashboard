import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { getProfilo } from '@/lib/auth/session'
import { urlPassoMarketing } from '@/lib/marketing/analisi/config'
import { VERSIONE_PROMPT_VISIONE } from '@/lib/marketing/analisi/prompt'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** «Analizza» and «Analizza di nuovo»: the admin and marketing (Dany, 09/10/2026); not the video editor. */
const RUOLI_ANALIZZA = ['admin', 'marketing'] as const
const SOLO_CHI_ANALIZZA = 'Le analisi le chiedono l’admin e il marketing.'
const NO_STORE = { 'Cache-Control': 'no-store' }

const corpoSchema = z.object({ media_id: z.string().regex(/^[0-9]{1,30}$/) })

/** The request comes from a page of this app (the browser sends Origin on a POST). */
function stessaOrigine(request: NextRequest): boolean {
  const origine = request.headers.get('origin')
  if (!origine) return false
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return Boolean(host) && new URL(origine).host === host
  } catch {
    return false
  }
}

/**
 * «Analizza» (1.36.0, CLAUDE.md section 30): puts a reel's analysis in the
 * queue and wakes the chain. A route and not a server action: Next sends the
 * actions of a tab one at a time, and the work itself is not here anyway.
 *
 * With the session of whoever asks, the database checks the role, the
 * limits (10 requests a day for the team, the month's spending) and what is
 * already going (marketing_analisi_richiedi, with its sentences). Only then,
 * with the service role created here, the address of the steps is written
 * (never from the request: urlPassoMarketing() builds it from APP_URL) and the
 * chain is woken if the lease is free. 202 with the analysis id.
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
  const { media_id } = letto.data

  const supabase = await createClient()
  // the reading is redone when it is missing, only the speech, not ready, or made with an older prompt
  const { data: lettura } = await supabase
    .from('instagram_letture')
    .select('richiesta, stato, visione_esito, versione_prompt_visione')
    .eq('media_id', media_id)
    .maybeSingle()
  const rileggi =
    !lettura ||
    lettura.richiesta === 'trascrizione' ||
    lettura.visione_esito !== 'pronta' ||
    lettura.versione_prompt_visione !== VERSIONE_PROMPT_VISIONE

  const { data: id, error } = await supabase.rpc('marketing_analisi_richiedi', { p_media_id: media_id, p_rileggi: rileggi })
  if (error || !id) {
    // the database's own sentences (in Italian) for a refusal it explains; anything else is generic
    const frase = error && ['22023', '42501', 'P0002'].includes(error.code) ? error.message : 'Analisi non partita. Riprova.'
    return NextResponse.json({ errore: frase }, { status: 422, headers: NO_STORE })
  }

  try {
    const db = createAdminClient()
    await db.rpc('marketing_imposta_url', { p_url: urlPassoMarketing() as never })
    await db.rpc('marketing_sveglia')
  } catch (e) {
    // the analysis is queued: the scheduler (every 5 minutes) picks it up anyway
    console.error('[analisi] catena non svegliata:', e instanceof Error ? e.name : 'errore')
  }
  return NextResponse.json({ id }, { status: 202, headers: NO_STORE })
}
