import { z } from 'zod'

import { contestoCall } from '@/lib/call/accesso'
import { trascrizione } from '@/lib/fathom/api'
import { ErroreFathom, FRASI_FATHOM } from '@/lib/fathom/frasi'
import { compatta, quotaParlato } from '@/lib/fathom/trascrizione'
import { risolviLink } from '@/lib/fathom/risolvi'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const SENZA_CACHE = { 'Cache-Control': 'private, no-store' }

function risposta(corpo: unknown, status: number) {
  return Response.json(corpo, { status, headers: SENZA_CACHE })
}

/**
 * The transcript of a call, read from Fathom now (1.37.0, CLAUDE.md section 31): for the
 * admin and the call's closer only (the session and RLS decide first), never stored, never
 * logged: the log has the outcome and the seconds. A GET and not a server action (Next
 * sends the actions one at a time, and this one waits for Fathom). The emails of the
 * speakers stay here, only to tell the closer from the lead.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return risposta({ errore: 'Call non trovata.' }, 404)
  const contesto = await contestoCall(id)
  if (contesto === 'vietato') return risposta({ errore: 'La trascrizione la leggono il closer della call e l’admin.' }, 403)
  if (contesto === 'sparita') return risposta({ errore: 'Call non trovata.' }, 404)

  const { call, registrazione } = contesto
  if (!call.link_registrazione || !registrazione || registrazione.stato !== 'collegata') {
    return risposta({ errore: 'Questa call non ha una registrazione di Fathom.' }, 404)
  }
  const avvio = Date.now()
  try {
    const db = createAdminClient()
    let recordingId = registrazione.link_verificato === call.link_registrazione ? registrazione.recording_id : null
    let durata = registrazione.durata_secondi
    if (recordingId === null) {
      // the link was saved before Fathom had the recording: look again, once
      const trovata = await risolviLink({ db, callId: call.id, link: call.link_registrazione, programmataIl: call.programmata_il })
      if (trovata.esito === 'non_collegato') return risposta({ errore: FRASI_FATHOM.non_collegato }, 503)
      if (trovata.esito === 'errore') return risposta({ errore: trovata.errore.message }, 502)
      if (trovata.esito !== 'trovata') return risposta({ errore: FRASI_FATHOM.non_trovata }, 404)
      recordingId = trovata.riunione.recording_id
      durata = trovata.riunione.durata_secondi
    }
    const { data: chiave } = await db.rpc('fathom_chiave')
    if (typeof chiave !== 'string' || chiave === '') return risposta({ errore: FRASI_FATHOM.non_collegato }, 503)
    const { data: closer } = call.closer_id
      ? await contesto.supabase.from('profiles').select('nome, email').eq('id', call.closer_id).maybeSingle()
      : { data: null }
    const grezza = await trascrizione({ chiave, recordingId })
    const segmenti = compatta(grezza, { email: closer?.email ?? null, nome: closer?.nome ?? null })
    console.info('[fathom] trascrizione', 'ok', `${Math.round((Date.now() - avvio) / 100) / 10}s`)
    return risposta({ segmenti, quota_parlato: quotaParlato(segmenti, durata), link: call.link_registrazione }, 200)
  } catch (e) {
    const errore = e instanceof ErroreFathom ? e : new ErroreFathom('rete')
    console.info('[fathom] trascrizione', errore.tipo, `${Math.round((Date.now() - avvio) / 100) / 10}s`)
    return risposta({ errore: errore.message }, errore.tipo === 'non_trovata' ? 404 : 502)
  }
}
