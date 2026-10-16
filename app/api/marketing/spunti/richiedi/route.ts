import { NextResponse, type NextRequest } from 'next/server'

import { getProfilo } from '@/lib/auth/session'
import { stessaOrigine } from '@/lib/auth/stessa-origine'
import { urlPassoCall } from '@/lib/call/lavori/config'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
const SOLO_CHI_CHIEDE = 'Gli spunti li chiedono l’admin e il marketing.'

/**
 * «Chiedi nuovi spunti» (1.37.0, CLAUDE.md section 31): puts the weekly brief in the queue and wakes
 * the chain. A route and not a server action (Next sends the actions of a tab one at a time, and
 * the work itself is not here anyway). With the session of whoever asks, the database checks the role
 * and the limits (2 a day, one at a time, the month's spending: marketing_spunti_richiedi, in its own
 * words). Only then, with the service role created here, the step address is written (never from the
 * request) and the chain is woken. 202.
 */
export async function POST(request: NextRequest) {
  if (!stessaOrigine(request)) return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 403, headers: NO_STORE })
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo || (profilo.ruolo !== 'admin' && profilo.ruolo !== 'marketing')) {
    return NextResponse.json({ errore: SOLO_CHI_CHIEDE }, { status: 403, headers: NO_STORE })
  }
  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('marketing_spunti_richiedi')
  if (error || !id) {
    const frase = error && ['22023', '42501'].includes(error.code) ? error.message : 'Gli spunti non sono partiti. Riprova.'
    return NextResponse.json({ errore: frase }, { status: 422, headers: NO_STORE })
  }
  try {
    const db = createAdminClient()
    await db.rpc('call_imposta_url', { p_url: urlPassoCall() as never })
    await db.rpc('call_sveglia')
  } catch (e) {
    console.error('[spunti] catena non svegliata:', e instanceof Error ? e.name : 'errore')
  }
  return NextResponse.json({ id }, { status: 202, headers: NO_STORE })
}
