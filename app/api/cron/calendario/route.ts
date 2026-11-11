import { NextResponse, type NextRequest } from 'next/server'

import { sincronizzaCalendario } from '@/lib/calendario/leggi'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The calendar «Dany Discovery Call» every morning (1.76.0, vercel.json "20 5 * * *": Hobby fires within
 * that hour, 06:20-07:20 in Rome in winter), so the counts of yesterday are whole before the day starts;
 * the evening job reads it again before the Friday summary, and the admin has «Aggiorna dal calendario».
 * Protected by CRON_SECRET like the other jobs. 200 also when the calendar is not linked; only the outcome
 * and the number of events in the answer and in the log, never the address.
 */
export async function GET(request: NextRequest) {
  const atteso = process.env.CRON_SECRET
  if (!atteso) return NextResponse.json({ errore: 'CRON_SECRET non configurato' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${atteso}`) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }
  const esito = await sincronizzaCalendario(createAdminClient())
  if (esito.esito === 'errore' && esito.tipo !== 'non_collegato') {
    return NextResponse.json({ ok: false, ...esito }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ...esito })
}
