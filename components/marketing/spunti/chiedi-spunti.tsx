'use client'

import { LoaderCircle, Sparkles } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { rivalidaMarketing } from '@/app/(app)/marketing/pubblicati/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { MARKETING } from '@/lib/i18n/testi/marketing'

/** «Chiedi nuovi spunti»: a POST to the route (never a server action), then the area is redrawn once. */
export function ChiediSpunti({ inCorso }: { inCorso: boolean }) {
  const t = MARKETING[useLingua()].spunti
  const [occupato, avvia] = useTransition()
  const [partito, setPartito] = useState(false)
  const lavora = occupato || inCorso || partito

  function chiedi() {
    avvia(async () => {
      try {
        const r = await fetch('/api/marketing/spunti/richiedi', { method: 'POST', cache: 'no-store' })
        const corpo = (await r.json().catch(() => ({}))) as { errore?: string }
        if (!r.ok) return void toast.error(corpo.errore ?? t.nonPartiti)
        setPartito(true)
        toast.success(t.partiti)
        await rivalidaMarketing()
      } catch {
        toast.error(t.connessione)
      }
    })
  }

  return (
    <Button type="button" onClick={chiedi} disabled={lavora} aria-busy={lavora} className="h-11" data-testid="chiedi-spunti">
      {lavora ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
      {lavora ? t.scrivo : t.chiedi}
    </Button>
  )
}
