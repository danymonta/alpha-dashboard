'use client'

import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { rivalidaTutto } from '@/app/actions/rivalida'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { CONTATTI, traduciErroreCalendario } from '@/lib/i18n/testi/contatti'
import { SHELL } from '@/lib/i18n/testi/shell'

/**
 * «Aggiorna dal calendario» (1.76.0): a POST to the route, never a server action (it waits for Google and
 * would hold every other action of the tab behind it), then one redraw with the browser's cache emptied.
 */
export function AggiornaCalendario({ collegato }: { collegato: boolean }) {
  const lingua = useLingua()
  const t = CONTATTI[lingua]
  const [inCorso, avvia] = useTransition()
  if (!collegato) return null

  function aggiorna() {
    avvia(async () => {
      try {
        const risposta = await fetch('/api/calendario/aggiorna', { method: 'POST' })
        const corpo = (await risposta.json().catch(() => null)) as { esito?: string; eventi?: number; errore?: string } | null
        if (!risposta.ok || !corpo || corpo.esito !== 'ok') {
          toast.error(traduciErroreCalendario(corpo?.errore ?? SHELL[lingua].connessione, lingua))
        } else {
          toast.success(t.aggiornato(corpo.eventi ?? 0))
        }
        await rivalidaTutto()
      } catch {
        toast.error(SHELL[lingua].connessione)
      }
    })
  }

  return (
    <Button type="button" variant="outline" className="h-11" onClick={aggiorna} disabled={inCorso} aria-busy={inCorso}>
      {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
      {inCorso ? t.aggiornando : t.aggiorna}
    </Button>
  )
}
