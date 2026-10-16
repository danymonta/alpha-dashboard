import { z } from 'zod'

import { contestoCall } from '@/lib/call/accesso'
import { riassunto } from '@/lib/fathom/api'
import { ErroreFathom, FRASI_FATHOM } from '@/lib/fathom/frasi'
import { risolviLink } from '@/lib/fathom/risolvi'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const SENZA_CACHE = { 'Cache-Control': 'private, no-store' }

function risposta(corpo: unknown, status: number) {
  return Response.json(corpo, { status, headers: SENZA_CACHE })
}

/**
 * Fathom's own summary of a call, read now (1.37.0): in English as Fathom writes it,
 * never stored, never sent to Claude, never logged. Admin and the call's closer only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return risposta({ errore: 'Call non trovata.' }, 404)
  const contesto = await contestoCall(id)
  if (contesto === 'vietato') return risposta({ errore: 'Il riassunto lo leggono il closer della call e l’admin.' }, 403)
  if (contesto === 'sparita') return risposta({ errore: 'Call non trovata.' }, 404)

  const { call, registrazione } = contesto
  if (!call.link_registrazione || !registrazione || registrazione.stato !== 'collegata') {
    return risposta({ errore: 'Questa call non ha una registrazione di Fathom.' }, 404)
  }
  try {
    const db = createAdminClient()
    let recordingId = registrazione.link_verificato === call.link_registrazione ? registrazione.recording_id : null
    if (recordingId === null) {
      const trovata = await risolviLink({ db, callId: call.id, link: call.link_registrazione, programmataIl: call.programmata_il })
      if (trovata.esito === 'non_collegato') return risposta({ errore: FRASI_FATHOM.non_collegato }, 503)
      if (trovata.esito === 'errore') return risposta({ errore: trovata.errore.message }, 502)
      if (trovata.esito !== 'trovata') return risposta({ errore: FRASI_FATHOM.non_trovata }, 404)
      recordingId = trovata.riunione.recording_id
    }
    const { data: chiave } = await db.rpc('fathom_chiave')
    if (typeof chiave !== 'string' || chiave === '') return risposta({ errore: FRASI_FATHOM.non_collegato }, 503)
    return risposta({ testo: await riassunto({ chiave, recordingId }) }, 200)
  } catch (e) {
    const errore = e instanceof ErroreFathom ? e : new ErroreFathom('rete')
    return risposta({ errore: errore.message }, errore.tipo === 'non_trovata' ? 404 : 502)
  }
}
