import 'server-only'

import { cercaRegistrazionePerLink } from '@/lib/fathom/api'
import { ErroreFathom } from '@/lib/fathom/frasi'
import { normalizzaLink } from '@/lib/fathom/link'
import type { Riunione } from '@/lib/fathom/riunione'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Finds the recording behind the link of a call and writes what Fathom answered
 * (call_registrazioni, by fathom_salva_verifica). Service role: the callers have
 * already checked, with the session, that the person may touch this call. The
 * key is read from Vault here and goes nowhere but the header of the request.
 */
type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc'>

export type EsitoRisolvi =
  | { esito: 'trovata'; riunione: Riunione; link: string }
  | { esito: 'non_trovata'; link: string }
  | { esito: 'non_fathom'; link: string }
  | { esito: 'link_non_valido'; errore: string }
  | { esito: 'non_collegato' }
  | { esito: 'errore'; errore: ErroreFathom }

export async function risolviLink(op: {
  db: Db
  callId: string
  link: string
  programmataIl: string
  scrivi?: boolean
  segnale?: AbortSignal
  fetch?: typeof fetch
}): Promise<EsitoRisolvi> {
  const n = normalizzaLink(op.link)
  if (!n.ok) return { esito: 'link_non_valido', errore: n.errore }
  if (!n.fathom) return { esito: 'non_fathom', link: n.canonico }

  const { data: chiave, error } = await op.db.rpc('fathom_chiave')
  if (error) return { esito: 'errore', errore: new ErroreFathom('rete') }
  if (typeof chiave !== 'string' || chiave === '') return { esito: 'non_collegato' }

  try {
    const r = await cercaRegistrazionePerLink({
      chiave,
      link: n.canonico,
      programmataIl: new Date(op.programmataIl),
      segnale: op.segnale,
      fetch: op.fetch,
    })
    if (!r.trovata) return { esito: 'non_trovata', link: n.canonico }
    if (op.scrivi !== false) {
      const { error: e } = await op.db.rpc('fathom_salva_verifica', {
        p_call_id: op.callId,
        p_url: n.canonico,
        p_recording_id: r.riunione.recording_id,
        p_durata: r.riunione.durata_secondi ?? 0,
        p_inizio: r.riunione.inizio ?? new Date().toISOString(),
      })
      if (e) return { esito: 'errore', errore: new ErroreFathom('rete') }
    }
    return { esito: 'trovata', riunione: r.riunione, link: n.canonico }
  } catch (e) {
    return { esito: 'errore', errore: e instanceof ErroreFathom ? e : new ErroreFathom('rete') }
  }
}
