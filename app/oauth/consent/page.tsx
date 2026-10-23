import type { Metadata } from 'next'

import {
  PaginaConsenso,
  SchedaConsenso,
  SchedaMessaggio,
  SchedaNonAmmesso,
  SchedaNonDaClaude,
  SchedaRicollega,
} from '@/components/oauth/scheda-consenso'
import { ETICHETTA_RUOLO, livelloPmEffettivo } from '@/lib/auth/roles'
import { getProfilo } from '@/lib/auth/session'
import {
  CONSENSO,
  MESSAGGI_AUTORIZZAZIONE,
  hostDi,
  leggiDestinazione,
  testoNonAmmesso,
  tipoErroreAutorizzazione,
} from '@/lib/mcp/consenso'
import { createClient } from '@/lib/supabase/server'
import { NON_VALIDA, idAutorizzazioneSchema } from '@/lib/validation/mcp'

/*
 * The consent page of Supabase Auth's OAuth 2.1 server (Claude connected to
 * Alpha Management, 09/10/2026): Supabase sends the browser here with
 * ?authorization_id= (Site URL + Authorization Path). Outside the (app) group:
 * no shell, no intro, no tour. Behind the Google sign-in: the proxy sends who
 * has no session to /login?da= and brings them back, query included. It always
 * needs a tap, also when Supabase has already approved a repeat consent.
 * next.config.ts adds frame-ancestors 'none', a same-origin referrer policy (no Referer
 * to Claude or anywhere else) and no-store on /oauth.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Collega Claude',
  robots: { index: false, follow: false },
}

export default async function ConsensoPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string | string[] }>
}) {
  const { authorization_id } = await searchParams
  const id = idAutorizzazioneSchema.safeParse(authorization_id)
  if (!id.success) {
    return (
      <PaginaConsenso>
        <SchedaMessaggio titolo={CONSENSO.titoloInterrotto} testo={NON_VALIDA} />
      </PaginaConsenso>
    )
  }

  const profilo = await getProfilo()
  if (!profilo) {
    // the proxy already sent who has no session to /login: a session without a profile
    // would loop between the two, so the page just says it
    return (
      <PaginaConsenso>
        <SchedaMessaggio titolo={CONSENSO.titoloInterrotto} testo={MESSAGGI_AUTORIZZAZIONE.sessione} />
      </PaginaConsenso>
    )
  }

  const supabase = await createClient()

  // Who may not connect Claude never gets its details read while the page renders:
  // that read binds the authorization to the person and, with an old consent,
  // issues a code on a page view. «Torna a Claude» binds and refuses in one tap.
  const { data: puo, error: errorePuo } = await supabase.rpc('puo_usare_mcp')
  if (errorePuo || puo !== true) {
    return (
      <PaginaConsenso>
        <SchedaNonAmmesso authorizationId={id.data} testo={testoNonAmmesso(profilo.ruolo)} />
      </PaginaConsenso>
    )
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id.data)
  if (error || !data) {
    const tipo = tipoErroreAutorizzazione(error)
    // network or Supabase down: the error state with «Riprova» (error.tsx)
    if (tipo === 'temporaneo') throw new Error('Consenso non disponibile')
    return (
      <PaginaConsenso>
        <SchedaMessaggio titolo={CONSENSO.titoloInterrotto} testo={MESSAGGI_AUTORIZZAZIONE[tipo]} />
      </PaginaConsenso>
    )
  }

  const nome = profilo.nome
  const ruolo = ETICHETTA_RUOLO[profilo.ruolo]

  if ('authorization_id' in data) {
    const destinazione = leggiDestinazione(data.redirect_uri)
    if (!destinazione) {
      console.warn(`[mcp] consenso destinazione rifiutata host=${hostDi(data.redirect_uri)}`)
      return (
        <PaginaConsenso>
          <SchedaNonDaClaude authorizationId={id.data} />
        </PaginaConsenso>
      )
    }
    return (
      <PaginaConsenso>
        <SchedaConsenso
          authorizationId={id.data}
          client={data.client.name || 'Claude'}
          destinazione={destinazione}
          nome={nome}
          ruolo={ruolo}
          chi={{ ruolo: profilo.ruolo, livello: livelloPmEffettivo(profilo.ruolo, profilo.livello_pm) }}
        />
      </PaginaConsenso>
    )
  }

  // Supabase found an earlier consent and approved on the spot: the code is in this URL
  const destinazione = leggiDestinazione(data.redirect_url)
  if (!destinazione) {
    console.warn(`[mcp] consenso destinazione rifiutata host=${hostDi(data.redirect_url)}`)
    return (
      <PaginaConsenso>
        <SchedaNonDaClaude />
      </PaginaConsenso>
    )
  }
  return (
    <PaginaConsenso>
      <SchedaRicollega
        authorizationId={id.data}
        redirectUrl={destinazione.href}
        destinazione={destinazione}
        nome={nome}
        ruolo={ruolo}
      />
    </PaginaConsenso>
  )
}
