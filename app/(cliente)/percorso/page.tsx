import { leggiPercorsoCliente } from '@/lib/percorso/letture'
import { fraseStima } from '@/lib/percorso/stima'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'
import { createClient } from '@/lib/supabase/server'

/**
 * The client's path (release B1a). The first draft of the page: the timeline, the panel of
 * the step and the player come with the interface of B1a (components/percorso/); the read
 * is already the only one the page will ever do, percorso_cliente() with the client's
 * session.
 */
export default async function PercorsoPage() {
  const esito = await leggiPercorsoCliente(await createClient())
  if (!esito.ok) throw new Error(esito.motivo === 'accesso' ? T.accessoNonValido : T.errore)
  const { percorso } = esito

  return (
    <div className="space-y-4 pt-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {percorso.nome ? `Ciao ${percorso.nome}.` : T.titolo}
      </h1>
      {percorso.stima ? <p className="text-sm text-muted-foreground">{fraseStima(percorso.stima)}</p> : null}
      {percorso.inAttesa ? <p className="text-sm">{T.attesa}</p> : null}
    </div>
  )
}
