import { NextResponse, type NextRequest } from 'next/server'

import { getProfilo } from '@/lib/auth/session'
import { aggiornaContenutiInstagram } from '@/lib/instagram/sincronizza-contenuti'
import { baseGraph } from '@/lib/instagram/richieste'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
/** The listing stops asking Instagram after a minute, the numbers of the posts after 90 seconds. */
export const maxDuration = 120
const TEMPO_ELENCO_MS = 60_000
const TEMPO_NUMERI_MS = 90_000

/** "Aggiorna da Instagram": the admin and marketing (Dany, 09/10/2026), not the video editor. */
const RUOLI_AGGIORNA = ['admin', 'marketing'] as const
const SOLO_CHI_AGGIORNA = 'Aggiorna da Instagram lo usano l’admin e il marketing.'

const NO_STORE = { 'Cache-Control': 'no-store' }

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
 * "Aggiorna da Instagram" (1.33.0): the listing run of the posts, now. A route
 * and not a server action (spec R5): Next sends the actions of a tab one at a
 * time, and a run of up to a minute would hold every other save of the page
 * behind it. The page then calls rivalidaMarketing() for one redraw.
 *
 * The run uses the service role (it writes what no session can), created only
 * after the role check. The answer has only the outcome and counts, never a
 * token, a caption or a link.
 */
export async function POST(request: NextRequest) {
  if (!stessaOrigine(request)) {
    return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 403, headers: NO_STORE })
  }
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo || !(RUOLI_AGGIORNA as readonly string[]).includes(profilo.ruolo)) {
    return NextResponse.json({ errore: SOLO_CHI_AGGIORNA }, { status: 403, headers: NO_STORE })
  }

  const avvio = Date.now()
  const esito = await aggiornaContenutiInstagram({
    db: createAdminClient(),
    motivo: 'manuale',
    entro: avvio + TEMPO_ELENCO_MS,
    entroNumeri: avvio + TEMPO_NUMERI_MS,
    graph: { base: baseGraph() },
  })

  return NextResponse.json(
    {
      esito: esito.esito,
      letti: esito.letti,
      collegati: esito.collegati,
      proposti: esito.proposti,
      campi: esito.campi,
      errore: esito.errore,
      ...(esito.metriche ? { metriche: esito.metriche.letti, permesso: esito.metriche.permesso } : {}),
      ...(esito.rifiutato ? { rifiutato: esito.rifiutato, dal: esito.dal ?? null } : {}),
    },
    { headers: NO_STORE },
  )
}
