import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { getProfilo } from '@/lib/auth/session'
import { stessaOrigine } from '@/lib/auth/stessa-origine'
import { urlPassoCall } from '@/lib/call/lavori/config'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { cercaRegistrazioniCall } from '@/lib/fathom/cerca-call'
import { FRASI_FATHOM } from '@/lib/fathom/frasi'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const NO_STORE = { 'Cache-Control': 'private, no-store' }

const corpoSchema = z.object({ giorni: z.union([z.literal(14), z.literal(30), z.literal(90)]) })

/**
 * «Cerca su Fathom» of Marketing › Dalle call (1.65.0, Dany, 27/10/2026: «devi
 * analizzarle da fathom»): the held calls of the period without a recording
 * are looked for on Fathom (lib/fathom/cerca-call.ts); the ones found are tied
 * and go in the queue of the analyses, which the chain then does one at a time.
 * Admin only, checked with the session before the service role is created. A
 * POST route and never a server action (it waits for Fathom). Only counts come
 * back and go in the log.
 */
export async function POST(request: NextRequest) {
  if (!stessaOrigine(request)) return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 403, headers: NO_STORE })
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo || profilo.ruolo !== 'admin') {
    return NextResponse.json({ errore: 'Le registrazioni da Fathom le cerca l’admin.' }, { status: 403, headers: NO_STORE })
  }
  const letto = corpoSchema.safeParse(await request.json().catch(() => null))
  if (!letto.success) return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400, headers: NO_STORE })

  const oggi = oggiRoma()
  const db = createAdminClient()
  const avvio = Date.now()
  const esito = await cercaRegistrazioniCall({ db, da: aggiungiGiorni(oggi, -(letto.data.giorni - 1)), a: oggi, segnale: request.signal })

  if (esito.esito === 'non_collegato') {
    return NextResponse.json({ esito: 'non_collegato', errore: FRASI_FATHOM.non_collegato }, { headers: NO_STORE })
  }
  if (esito.esito === 'non_pronto') {
    console.error('[fathom] abbina: manca la migration 20261104090000_fathom_abbina.sql')
    return NextResponse.json({ esito: 'non_pronto' }, { headers: NO_STORE })
  }
  if (esito.esito === 'errore') {
    if (esito.errore.tipo === 'chiave') await db.rpc('fathom_segna_esito', { p_errore: FRASI_FATHOM.chiave })
    console.info('[fathom] abbina errore', esito.errore.tipo)
    return NextResponse.json({ esito: 'errore', errore: esito.errore.message }, { headers: NO_STORE })
  }
  console.info('[fathom] abbina', esito.cercate, esito.collegate, `${Math.round((Date.now() - avvio) / 100) / 10}s`)
  if (esito.collegate > 0) {
    try {
      await db.rpc('call_imposta_url', { p_url: urlPassoCall() as never })
      await db.rpc('call_sveglia')
    } catch (e) {
      // queued anyway: the scheduler (every 5 minutes) picks them up
      console.error('[fathom] catena non svegliata:', e instanceof Error ? e.name : 'errore')
    }
  }
  return NextResponse.json(esito, { headers: NO_STORE })
}
