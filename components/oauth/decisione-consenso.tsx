'use client'

import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useActionState, useState } from 'react'

import { decidiCollegamento, type EsitoConsenso } from '@/app/oauth/consent/actions'
import { LinkBottone } from '@/components/link-bottone'
import { Button } from '@/components/ui/button'
import { CONSENSO } from '@/lib/mcp/consenso'
import type { DecisioneConsenso as Decisione } from '@/lib/validation/mcp'

export type BottoneDecisione = {
  decisione: Decisione
  etichetta: string
  primario?: boolean
}

type Props = {
  authorizationId: string
  /** Only on «Ricollega Claude»: the URL Supabase already built, carried by the tap. */
  redirectUrl?: string
  bottoni: BottoneDecisione[]
}

/**
 * The taps of the consent page: always a POST to a server action (Next checks
 * the Origin), which decides and sends the browser back to Claude. A plain
 * form with a progressively enhanced action (action=""): until the page is
 * hydrated (slow bundles on a phone's network, the usual case in the first
 * seconds) or if the bundles never arrive (the inline scripts still show the
 * page), the tap is a native post and the action answers 303; React does not
 * replay it as a fetch. The same-origin referrer policy of next.config.ts
 * keeps the Origin on that native post. Once hydrated, while it runs every
 * button is off, so a double tap never approves twice.
 */
export function DecisioneConsenso({ authorizationId, redirectUrl, bottoni }: Props) {
  const [esito, azione, inCorso] = useActionState<EsitoConsenso, FormData>(decidiCollegamento, null)
  const [toccato, setToccato] = useState<Decisione | null>(null)

  // a final answer (expired, already used, not from Claude): another tap would say the same
  if (esito?.finale) {
    return (
      <div className="space-y-4">
        <Avviso testo={esito.errore} />
        <LinkBottone href="/" variant="outline" className="w-full">
          {CONSENSO.vaiAllApp}
        </LinkBottone>
      </div>
    )
  }

  return (
    <form action={azione} className="space-y-4">
      <input type="hidden" name="authorization_id" value={authorizationId} />
      {redirectUrl ? <input type="hidden" name="redirect_url" value={redirectUrl} /> : null}
      {esito ? <Avviso testo={esito.errore} /> : null}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        {bottoni.map((b) => (
          <Button
            key={b.decisione}
            type="submit"
            name="decisione"
            value={b.decisione}
            variant={b.primario ? 'default' : 'outline'}
            className="h-11 w-full sm:w-auto sm:min-w-32"
            disabled={inCorso}
            onClick={() => setToccato(b.decisione)}
          >
            {inCorso && toccato === b.decisione ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {b.etichetta}
          </Button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {inCorso ? CONSENSO.inCorso : ''}
      </p>
    </form>
  )
}

function Avviso({ testo }: { testo: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-status-critical/10 px-3 py-2.5 text-sm text-status-critical"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}
