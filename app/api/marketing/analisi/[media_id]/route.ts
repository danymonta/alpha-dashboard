import { RUOLI_MARKETING_LETTURA } from '@/lib/auth/roles'
import { getProfilo } from '@/lib/auth/session'
import { leggiDettaglioReel } from '@/lib/marketing/analisi/dettaglio'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Read through RLS, personal to the Marketing area: never kept by the browser or anything in between. */
const SENZA_CACHE = { 'Cache-Control': 'private, no-store' }

function risposta(corpo: unknown, status: number) {
  return Response.json(corpo, { status, headers: SENZA_CACHE })
}

/**
 * The reel panel's read (1.36.0): the card, the speech, the numbers, the
 * analysis and the calendar. A GET and not a server action, as the content
 * panel's (1.33.0): it can be preloaded when the mouse rests on a row and
 * aborted, and it never waits behind a save. The session's client, so RLS
 * decides; never the service role.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ media_id: string }> }) {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo || !RUOLI_MARKETING_LETTURA.includes(profilo.ruolo)) {
    return risposta({ errore: 'L’analisi dei reel è dell’area Marketing.' }, 403)
  }
  const { media_id } = await params
  if (!/^[0-9]{1,30}$/.test(media_id)) return risposta({ sparito: true }, 404)
  try {
    const dettaglio = await leggiDettaglioReel(await createClient(), media_id)
    return dettaglio ? risposta(dettaglio, 200) : risposta({ sparito: true }, 404)
  } catch {
    return risposta({ errore: 'Il reel non si è caricato.' }, 500)
  }
}
