import { NextResponse, type NextRequest } from 'next/server'

import { aggiornaContenutiInstagram } from '@/lib/instagram/sincronizza-contenuti'
import { urlPassoCall } from '@/lib/call/lavori/config'
import { urlPassoMarketing } from '@/lib/marketing/analisi/config'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
/**
 * Vercel Hobby with Fluid compute: 300 seconds at most. The listing stops asking
 * Instagram after TEMPO_ELENCO_MS; the statistics of the posts (1.36.0) go on
 * to TEMPO_NUMERI_MS from the start, with the same lease and the same token.
 */
export const maxDuration = 300
/** No new request for the listing after this much of the 300 seconds (today it lasts 10-20). */
export const TEMPO_ELENCO_MS = 120_000
/** ... and none for the numbers of the posts after this much: the rest is the database. */
export const TEMPO_NUMERI_MS = 240_000

/**
 * The posts and reels of the connected account linked to the content
 * calendar (1.33.0), every morning (vercel.json "0 4 * * *": Hobby fires
 * within that hour, 05:00-05:59 in Rome in winter, 06:00-06:59 in summer),
 * far from the DM report's night. Protected by CRON_SECRET like the other
 * jobs. The answer has only the outcome and counts: never a caption, a link,
 * a number of a post or the token. A missing permission for the statistics
 * is the phase's own outcome (metriche_esito): it never makes the run fail
 * nor the answer a 500. 200 also without a token (nothing connected yet) and when a
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

  const db = createAdminClient()
  const esito = await aggiornaContenutiInstagram({
    db,
    motivo: 'notte',
    entro: avvio + TEMPO_ELENCO_MS,
    entroNumeri: avvio + TEMPO_NUMERI_MS,
  })

  // the address the database posts the reel work's steps to (1.36.0): rewritten every morning from APP_URL
  // (also after a restore on a new project); never takes the run down
  try {
    await db.rpc('marketing_imposta_url', { p_url: urlPassoMarketing() as never })
  } catch (e) {
    console.error('[contenuti-instagram] indirizzo dei passi non scritto:', e instanceof Error ? e.name : 'errore')
  }
  // and the one of the call work (1.37.0): the analyses of the calls and the weekly brief
  try {
    await db.rpc('call_imposta_url', { p_url: urlPassoCall() as never })
  } catch (e) {
    console.error('[contenuti-instagram] indirizzo dei passi delle call non scritto:', e instanceof Error ? e.name : 'errore')
  }

  const corpo = {
    ok: esito.esito !== 'fallito',
    esito: esito.esito,
    letti: esito.letti,
    collegati: esito.collegati,
    proposti: esito.proposti,
    campi: esito.campi,
    ...(esito.metriche
      ? { metriche: esito.metriche.letti, metriche_esito: esito.metriche.esito, permesso: esito.metriche.permesso }
      : {}),
    ...(esito.rifiutato ? { rifiutato: esito.rifiutato } : {}),
    ...(esito.causa ? { causa: esito.causa } : {}),
  }
  const daConfigurare = esito.causa === 'senza_token' || esito.rifiutato !== undefined
  return NextResponse.json(corpo, { status: esito.esito === 'fallito' && !daConfigurare ? 500 : 200 })
}
