import { NextResponse, type NextRequest } from 'next/server'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { calcolaReportInstagram, type MotivoErroreReport } from '@/lib/instagram/report'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
/**
 * Vercel Hobby with Fluid compute (the default): 300 seconds at most, declared
 * here as the App Router's route segment config (Next's maxDuration). Reading
 * a day's chats takes far less; the run stops starting requests well before.
 */
export const maxDuration = 300
/** No new request to Instagram after this much of the 300 seconds. */
const TEMPO_LETTURA_MS = 270_000

/** Not a failure of the run: nothing is connected yet, or nobody gets the proposal. */
const DA_CONFIGURARE: readonly MotivoErroreReport[] = ['senza_setter', 'setter_non_attivo', 'senza_token']

/**
 * The setter's report proposed from the Instagram DMs (Dany, 08/10/2026),
 * every night after midnight in Rome (vercel.json "15 23 * * *": Hobby fires
 * within that hour, 23:00-23:59 UTC, that is 00:00-00:59 in winter and
 * 01:00-01:59 in summer), for the day that just ended. Protected by
 * CRON_SECRET like the daily job. The answer has only the outcome and the
 * number of chats: never the proposal's numbers (they are on the cards: the
 * setter's in Oggi, the admin's on the Setter page, read with each one's
 * session).
 */
export async function GET(request: NextRequest) {
  const avvio = Date.now()
  const atteso = process.env.CRON_SECRET
  if (!atteso) return NextResponse.json({ errore: 'CRON_SECRET non configurato' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${atteso}`) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  const giorno = aggiungiGiorni(oggiRoma(), -1)
  const esito = await calcolaReportInstagram({
    db: createAdminClient(),
    giorno,
    entro: avvio + TEMPO_LETTURA_MS,
  })

  if (esito.ok) {
    return NextResponse.json({
      ok: true,
      giorno,
      proposta: esito.proposta,
      chat_lette: esito.chat_lette,
      chat_incerte: esito.chat_incerte,
      chat_non_lette: esito.chat_non_lette,
      token_rinnovato: esito.token_rinnovato,
    })
  }
  // the reason in words is recorded for the admin (instagram_collegamento)
  return NextResponse.json(
    { ok: false, giorno, motivo: esito.motivo },
    { status: DA_CONFIGURARE.includes(esito.motivo) ? 200 : 500 },
  )
}
