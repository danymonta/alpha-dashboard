'use client'

import { LoaderCircle, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import { toast } from 'sonner'

import { rivalidaTutto } from '@/app/actions/rivalida'
import { useTesti } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { DALLE_CALL } from '@/lib/i18n/testi/dalle-call'

type Risposta =
  | { esito: 'fatto'; cercate: number; collegate: number; completo: boolean }
  | { esito: 'non_collegato' | 'non_pronto' | 'errore'; errore?: string }

/**
 * «Cerca su Fathom e analizza» (1.65.0): a POST to the route (never a server
 * action: it waits for Fathom), then the app is redrawn once. Only the admin.
 */
export function CercaFathom({ giorni }: { giorni: number }) {
  const t = useTesti(DALLE_CALL)
  const [occupato, avvia] = useTransition()

  function cerca() {
    avvia(async () => {
      try {
        const r = await fetch('/api/fathom/abbina', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ giorni }),
        })
        const corpo = (await r.json().catch(() => ({ esito: 'errore' }))) as Risposta
        if (!r.ok || corpo.esito !== 'fatto') {
          return void toast.error(
            corpo.esito === 'non_collegato' ? t.nonCollegato : corpo.esito === 'non_pronto' ? t.nonPronto : t.erroreCerca,
          )
        }
        if (corpo.cercate === 0) toast.success(t.nienteDaCercare)
        else if (corpo.collegate === 0) toast.info(t.risultato(0, corpo.cercate))
        else toast.success(t.risultato(corpo.collegate, corpo.cercate))
        if (!corpo.completo) toast.info(t.parziale)
        await rivalidaTutto()
      } catch {
        toast.error(t.connessione)
      }
    })
  }

  return (
    <Button type="button" onClick={cerca} disabled={occupato} aria-busy={occupato} className="h-11" data-testid="cerca-fathom">
      {occupato ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
      {occupato ? t.cercaInCorso : t.cerca}
    </Button>
  )
}

/** While Claude is analysing calls of the period, the page reads itself again every 45 seconds. */
export function AggiornaMentreAnalizza({ attive }: { attive: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!attive) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 45_000)
    return () => window.clearInterval(id)
  }, [attive, router])
  return null
}
