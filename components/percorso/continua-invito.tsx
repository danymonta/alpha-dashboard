'use client'

import { LoaderCircle, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useActionState } from 'react'

import { apriInvito, type StatoApertura } from '@/app/join/actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { TESTI_JOIN as T } from '@/lib/percorso/testi'
import { cn } from '@/lib/utils'

/**
 * «Continua» on the page of an active link: a form with a server action (a preview that
 * only does GET consumes nothing). The action sets the key of the registration and goes to
 * /join/registrati; a link that meanwhile is no longer active answers its state here.
 */
export function ContinuaInvito({ segmento }: { segmento: string }) {
  const [stato, azione, inCorso] = useActionState<StatoApertura>(() => apriInvito(segmento), null)

  const messaggio =
    stato?.stato === 'in_attesa'
      ? T.inAttesa
      : stato?.stato === 'non_attivo'
        ? T.nonAttivo
        : stato?.stato === 'scaduto'
        ? T.scaduto
        : stato?.stato === 'revocato' || stato?.stato === 'non_valido'
          ? T.nonValido
          : stato?.stato === 'errore'
            ? T.nonDisponibile
            : null

  if (stato?.stato === 'usato') {
    return (
      <div className="space-y-3">
        <p className="text-sm">{T.usato}</p>
        <Link href="/entra" data-slot="button" className={cn(buttonVariants(), 'h-11 w-full')}>
          {T.entra}
        </Link>
      </div>
    )
  }

  return (
    <form action={azione} className="space-y-3">
      {messaggio ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {messaggio}
        </p>
      ) : null}
      <Button type="submit" className="glow-primario h-11 w-full gap-2" disabled={inCorso}>
        {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {stato?.stato === 'errore' ? T.riprova : T.attivo.continua}
      </Button>
    </form>
  )
}
