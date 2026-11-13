import { NextResponse, type NextRequest } from 'next/server'

import { preparaAllegato } from '@/lib/percorso/operazioni'
import { SENZA_CACHE, clienteDellaRichiesta, rifiuto } from '@/lib/percorso/richiesta'
import { createAdminClient } from '@/lib/supabase/admin'

/** The body: a field, a name, a type and a size. */
const CORPO_MAX = 2048
const BUCKET = 'onboarding-allegati'

/**
 * A file of the questionnaire, step one (release B1b): allegato_prepara with the client's own
 * session decides (step, consent, kind, size, 3 per field, the limits of the day) and creates
 * the row; then the service role signs an upload on that one path only, and the browser puts
 * the file there. No policy on storage.objects for this bucket: the signed URL is the only way
 * in. The service role here only signs, with the path the database gave.
 */
export async function POST(request: NextRequest) {
  const cliente = await clienteDellaRichiesta(request)
  if (!cliente.ok) return cliente.risposta

  const testo = await request.text()
  if (testo.length > CORPO_MAX) return rifiuto('Richiesta troppo grande.', 413)
  let corpo: unknown
  try {
    corpo = JSON.parse(testo)
  } catch {
    return rifiuto('Richiesta non valida.', 400)
  }

  const esito = await preparaAllegato(cliente.supabase, corpo)
  if (!esito.ok) return rifiuto(esito.errore, esito.accesso ? 403 : 422)

  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(esito.percorso)
  if (error || !data) {
    console.error('[percorso] caricamento non firmato')
    return rifiuto('Il file non è arrivato: riprova.', 503)
  }
  return NextResponse.json({ id: esito.id, url: data.signedUrl }, { headers: SENZA_CACHE })
}
