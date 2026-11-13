import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Clock, UserRound } from 'lucide-react'

import { AccessoCliente } from '@/components/percorso/accesso-cliente'
import { CorniceAccesso, RigaStato } from '@/components/percorso/cornice-accesso'
import { COOKIE_REGISTRAZIONE, chiaveValida, sha256 } from '@/lib/percorso/accesso'
import { TESTI_JOIN, TESTI_REGISTRAZIONE as T } from '@/lib/percorso/testi'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Registrazione',
  robots: { index: false, follow: false },
}

/**
 * The registration after «Continua» (release B1a): no token in the address, the key of the
 * registration in its cookie. The address of the card already written (only here, never on
 * the page of the link: Telegram opens links for the preview), then the code.
 */
export default async function RegistratiPage() {
  // a session of the team alive in this browser: the registration would replace it
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user && user.app_metadata?.tipo !== 'cliente') {
    return (
      <CorniceAccesso titolo={TESTI_JOIN.titoloPagina}>
        <RigaStato icona={<UserRound className="size-4" aria-hidden="true" />}>{T.sessioneTeam}</RigaStato>
      </CorniceAccesso>
    )
  }

  const chiave = (await cookies()).get(COOKIE_REGISTRAZIONE)?.value
  let stato: { nome: string; email_proposta: string | null; codice_inviato_a: string | null } | null = null
  if (chiaveValida(chiave)) {
    const { data, error } = await createAdminClient().rpc('onboarding_join_stato', { p_chiave_hash: sha256(chiave) })
    if (error) {
      console.error('[join] stato della registrazione non letto:', error.code)
      throw new Error(T.nonCompletata)
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const r = data as Record<string, unknown>
      stato = {
        nome: typeof r.nome === 'string' ? r.nome : '',
        email_proposta: typeof r.email_proposta === 'string' ? r.email_proposta : null,
        codice_inviato_a: typeof r.codice_inviato_a === 'string' ? r.codice_inviato_a : null,
      }
    }
  }

  if (!stato) {
    return (
      <CorniceAccesso titolo={TESTI_JOIN.titoloPagina}>
        <RigaStato icona={<Clock className="size-4" aria-hidden="true" />}>{T.scaduta}</RigaStato>
      </CorniceAccesso>
    )
  }

  return (
    <CorniceAccesso>
      <AccessoCliente
        modo="registrazione"
        emailIniziale={stato.email_proposta ?? ''}
        codiceGiaInviatoA={stato.codice_inviato_a}
        titoli={{ email: T.titolo, sottoEmail: T.sotto, codice: T.titoloCodice }}
      />
    </CorniceAccesso>
  )
}
