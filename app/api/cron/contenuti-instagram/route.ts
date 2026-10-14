import { NextResponse, type NextRequest } from 'next/server'

import { aggiornaContenutiInstagram } from '@/lib/instagram/sincronizza-contenuti'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
/**
 * Vercel Hobby with Fluid compute: 300 seconds at most. The run stops asking
 * Instagram after TEMPO_LETTURA_MS; 1.36.0 lengthens it with the statistics.
 */
export const maxDuration = 300
/** No new request to Instagram after this much of the 300 seconds. */
const TEMPO_LETTURA_MS = 120_000

/**
 * The posts and reels of the connected account linked to the content
 * calendar (1.33.0), every morning (vercel.json "0 4 * * *": Hobby fires
 * within that hour, 05:00-05:59 in Rome in winter, 06:00-06:59 in summer),
 * far from the DM report's night. Protected by CRON_SECRET like the other
 * jobs. The answer has only the outcome and counts: never a caption, a link
 * or the token. 200 also without a token (nothing connected yet) and when a
 * run is already going; 500 on the other failures, which the Marketing page
 * and Impostazioni › Instagram show in words.
 */
export async function GET(request: NextRequest) {
  const avvio = Date.now()
  const atteso = process.env.CRON_SECRET
  if (!atteso) return NextResponse.json({ errore: 'CRON_SECRET non configurato' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${atteso}`) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  const esito = await aggiornaContenutiInstagram({
    db: createAdminClient(),
    motivo: 'notte',
    entro: avvio + TEMPO_LETTURA_MS,
  })

  const corpo = {
    ok: esito.esito !== 'fallito',
    esito: esito.esito,
    letti: esito.letti,
    collegati: esito.collegati,
    proposti: esito.proposti,
    campi: esito.campi,
    ...(esito.rifiutato ? { rifiutato: esito.rifiutato } : {}),
    ...(esito.causa ? { causa: esito.causa } : {}),
  }
  const daConfigurare = esito.causa === 'senza_token' || esito.rifiutato !== undefined
  return NextResponse.json(corpo, { status: esito.esito === 'fallito' && !daConfigurare ? 500 : 200 })
}
