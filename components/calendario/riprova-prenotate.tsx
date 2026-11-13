'use client'

import { LoaderCircle, RotateCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { useTesti } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { PRENOTATE } from '@/lib/i18n/testi/prenotate'

/**
 * «Riprova» of the Calendly section: reads the page again. A «Riprova» is one of the
 * written exceptions where a component calls router.refresh() (CLAUDE.md section 10).
 */
export function RiprovaPrenotate() {
  const t = useTesti(PRENOTATE)
  const router = useRouter()
  const [inCorso, avvia] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      disabled={inCorso}
      onClick={() => avvia(() => router.refresh())}
    >
      {inCorso ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <RotateCw className="size-4" aria-hidden="true" />
      )}
      {t.riprova}
    </Button>
  )
}
