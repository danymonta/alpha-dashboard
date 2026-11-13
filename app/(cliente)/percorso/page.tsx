import { VistaPercorso } from '@/components/percorso/vista-percorso'
import { leggiPercorsoCliente } from '@/lib/percorso/letture'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * The client's path (release B1a): one read only, percorso_cliente() with the client's own
 * session; the timeline, the panel of the step and the player draw it
 * (components/percorso/vista-percorso.tsx). A failed read is the error state with
 * «Riprova»; there is no empty state: always a step or the waiting.
 */
export default async function PercorsoPage() {
  const esito = await leggiPercorsoCliente(await createClient())
  if (!esito.ok) throw new Error(esito.motivo === 'accesso' ? T.accessoNonValido : T.errore)
  return <VistaPercorso percorso={esito.percorso} />
}
