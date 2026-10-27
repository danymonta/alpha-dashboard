import { NextResponse, type NextRequest } from 'next/server'

import { urlPassoCall } from '@/lib/call/lavori/config'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { cercaRegistrazioniCall } from '@/lib/fathom/cerca-call'
import { FRASI_FATHOM } from '@/lib/fathom/frasi'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** How far back the evening looks: a call whose outcome was written a few days later is still found. */
const GIORNI = 7

/**
 * The recordings of the day's calls, every evening (1.65.0, vercel.json "45 21 * * *":
 * Hobby fires within that hour, 22:45-23:45 in Rome in winter, an hour later in summer),
 * after the evening calls. The held calls of the last 7 days without a recording are
 * looked for on Fathom and the ones found go in the queue of the analyses
 * (lib/fathom/cerca-call.ts), so Marketing › Dalle call fills by itself. Protected by
 * CRON_SECRET like the other jobs. 200 also without the key; only counts in the answer
 * and in the log.
 */
export async function GET(request: NextRequest) {
  const atteso = process.env.CRON_SECRET
  if (!atteso) return NextResponse.json({ errore: 'CRON_SECRET non configurato' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${atteso}`) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  const oggi = oggiRoma()
  const db = createAdminClient()
  const esito = await cercaRegistrazioniCall({ db, da: aggiungiGiorni(oggi, -(GIORNI - 1)), a: oggi, pagineMax: 5 })
  if (esito.esito === 'non_collegato') return NextResponse.json({ ok: true, esito: 'non_collegato' })
  if (esito.esito === 'non_pronto') {
    console.error('[fathom] sera: manca la migration 20261104090000_fathom_abbina.sql')
    return NextResponse.json({ ok: false, esito: 'non_pronto' }, { status: 500 })
  }
  if (esito.esito === 'errore') {
    if (esito.errore.tipo === 'chiave') await db.rpc('fathom_segna_esito', { p_errore: FRASI_FATHOM.chiave })
    console.error('[fathom] sera errore', esito.errore.tipo)
    return NextResponse.json({ ok: false, esito: 'errore', tipo: esito.errore.tipo }, { status: 500 })
  }
  console.info('[fathom] sera', esito.cercate, esito.collegate)
  if (esito.collegate > 0) {
    try {
      await db.rpc('call_imposta_url', { p_url: urlPassoCall() as never })
      await db.rpc('call_sveglia')
    } catch (e) {
      console.error('[fathom] catena non svegliata:', e instanceof Error ? e.name : 'errore')
    }
  }
  return NextResponse.json({ ok: true, ...esito })
}
