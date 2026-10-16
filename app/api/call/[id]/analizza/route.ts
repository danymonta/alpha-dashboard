import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { stessaOrigine } from '@/lib/auth/stessa-origine'
import { contestoCall } from '@/lib/call/accesso'
import { urlPassoCall } from '@/lib/call/lavori/config'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * «Analizza di nuovo» (1.37.0): puts the call's analysis in the queue and wakes the chain.
 * With the session of whoever asks, the database checks the role, the limits (10 a day for
 * the team, the month's spending) and what is going on (call_analisi_richiedi, in its own
 * words). Only then, with the service role created here, the step address is written
 * (never from the request) and the chain is woken. 202.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!stessaOrigine(request)) return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 403, headers: NO_STORE })
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ errore: 'Call non trovata.' }, { status: 404, headers: NO_STORE })
  const contesto = await contestoCall(id)
  if (contesto === 'vietato') {
    return NextResponse.json({ errore: 'L’analisi la chiedono il closer della call e l’admin.' }, { status: 403, headers: NO_STORE })
  }
  if (contesto === 'sparita') return NextResponse.json({ errore: 'Call non trovata.' }, { status: 404, headers: NO_STORE })

  const { error } = await contesto.supabase.rpc('call_analisi_richiedi', { p_call: id })
  if (error) {
    const frase = ['22023', '42501', 'P0002'].includes(error.code) ? error.message : 'Analisi non partita. Riprova.'
    return NextResponse.json({ errore: frase }, { status: 422, headers: NO_STORE })
  }
  try {
    const db = createAdminClient()
    await db.rpc('call_imposta_url', { p_url: urlPassoCall() as never })
    await db.rpc('call_sveglia')
  } catch (e) {
    // queued anyway: the scheduler (every 5 minutes) picks it up
    console.error('[analisi-call] catena non svegliata:', e instanceof Error ? e.name : 'errore')
  }
  return NextResponse.json({ ok: true }, { status: 202, headers: NO_STORE })
}
