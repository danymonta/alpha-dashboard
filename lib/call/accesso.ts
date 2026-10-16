import 'server-only'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

/**
 * The call a route is about, read with the session of whoever asks (RLS decides): the
 * admin on any call, the closer on his own, nobody else. Null when the person may not
 * touch recordings or the call is not theirs to read: the routes answer 403 / 404.
 */
export type ContestoCall = {
  supabase: Awaited<ReturnType<typeof createClient>>
  profiloId: string
  ruolo: 'admin' | 'closer'
  call: { id: string; closer_id: string | null; programmata_il: string; link_registrazione: string | null }
  registrazione: { stato: string; recording_id: number | null; link_verificato: string | null; durata_secondi: number | null } | null
}

export async function contestoCall(callId: string): Promise<ContestoCall | 'vietato' | 'sparita'> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo || (profilo.ruolo !== 'admin' && profilo.ruolo !== 'closer')) return 'vietato'
  const supabase = await createClient()
  const [call, registrazione] = await Promise.all([
    supabase.from('calls').select('id, closer_id, programmata_il, link_registrazione').eq('id', callId).maybeSingle(),
    supabase.from('call_registrazioni').select('stato, recording_id, link_verificato, durata_secondi').eq('call_id', callId).maybeSingle(),
  ])
  if (!call.data) return 'sparita'
  if (profilo.ruolo === 'closer' && call.data.closer_id !== profilo.id) return 'sparita'
  return { supabase, profiloId: profilo.id, ruolo: profilo.ruolo, call: call.data, registrazione: registrazione.data }
}
