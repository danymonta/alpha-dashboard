import { CampoBaseCliente } from '@/components/percorso/campo-base/campo-base'
import { leggiCampoBaseCliente, leggiPercorsoCliente } from '@/lib/percorso/letture'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * The client's home base (1.83.0): the path of the onboarding (percorso_cliente()) and the tabs of
 * the home base (campo_base_cliente()), both with the client's own session, read together. A
 * failed read is the error state with «Riprova»; there is no empty state: always a tab.
 */
export default async function PercorsoPage() {
  const db = await createClient()
  const [esito, campo] = await Promise.all([leggiPercorsoCliente(db), leggiCampoBaseCliente(db)])
  if (!esito.ok) throw new Error(esito.motivo === 'accesso' ? T.accessoNonValido : T.errore)
  if (!campo.ok) throw new Error(campo.motivo === 'accesso' ? T.accessoNonValido : T.errore)
  return <CampoBaseCliente percorso={esito.percorso} campo={campo.campo} />
}
