import { RUOLI_MARKETING_LETTURA } from '@/lib/auth/roles'
import { getProfilo } from '@/lib/auth/session'
import { leggiDettaglioContenuto } from '@/lib/marketing/dettaglio'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Personal data, read through RLS: never kept by the browser or anything in between. */
const SENZA_CACHE = { 'Cache-Control': 'private, no-store' }

function risposta(corpo: unknown, status: number) {
  return Response.json(corpo, { status, headers: SENZA_CACHE })
}

/**
 * The content panel's read (1.33.0): the sections and their fingerprints,
 * which the list never reads. A GET and not a server action: Next sends the
 * actions of a tab one at a time, and a read queued behind a save is not
 * smooth; a GET can be preloaded when the mouse rests on a row and aborted.
 * The session's client, so RLS decides; never the service role.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo || !RUOLI_MARKETING_LETTURA.includes(profilo.ruolo)) {
    return risposta({ errore: 'Il calendario dei contenuti è dell’area Marketing.' }, 403)
  }

  const { id } = await params
  if (!isUuid(id)) return risposta({ sparito: true }, 404)

  try {
    const dettaglio = await leggiDettaglioContenuto(await createClient(), id)
    return dettaglio ? risposta(dettaglio, 200) : risposta({ sparito: true }, 404)
  } catch {
    return risposta({ errore: 'Il contenuto non si è caricato.' }, 500)
  }
}
