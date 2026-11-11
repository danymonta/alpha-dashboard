import { NextResponse, type NextRequest } from 'next/server'

import { getProfilo } from '@/lib/auth/session'
import { stessaOrigine } from '@/lib/auth/stessa-origine'
import { FRASI_CALENDARIO, sincronizzaCalendario } from '@/lib/calendario/leggi'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * «Aggiorna dal calendario» of Setter › Contatti (1.76.0): reads the calendar «Dany Discovery Call» now.
 * Admin only, checked with the session before the service role is created. A POST route and never a
 * server action (it waits for Google). Only the outcome and the number of events come back.
 */
export async function POST(request: NextRequest) {
  if (!stessaOrigine(request)) return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 403, headers: NO_STORE })
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo || profilo.ruolo !== 'admin') {
    return NextResponse.json({ errore: 'Il calendario lo aggiorna l’admin.' }, { status: 403, headers: NO_STORE })
  }
  const esito = await sincronizzaCalendario(createAdminClient())
  if (esito.esito === 'errore') {
    return NextResponse.json({ esito: 'errore', errore: FRASI_CALENDARIO[esito.tipo] }, { headers: NO_STORE })
  }
  return NextResponse.json({ esito: 'ok', eventi: esito.eventi }, { headers: NO_STORE })
}
