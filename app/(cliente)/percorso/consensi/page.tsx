import type { Metadata } from 'next'

import { ConsensiCliente } from '@/components/percorso/consensi-cliente'
import { EMAIL_TITOLARE } from '@/lib/percorso/consensi'
import { leggiPercorsoCliente } from '@/lib/percorso/letture'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: T.consensiTitolo }

/** «I tuoi consensi» (release B1a): read from percorso_cliente(), as the rest of the area. */
export default async function ConsensiPage() {
  const esito = await leggiPercorsoCliente(await createClient())
  if (!esito.ok) throw new Error(esito.motivo === 'accesso' ? T.accessoNonValido : T.errore)
  return <ConsensiCliente consensi={esito.percorso.consensi} emailTitolare={EMAIL_TITOLARE} />
}
