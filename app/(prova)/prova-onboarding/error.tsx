'use client'

import { TriangleAlert } from 'lucide-react'

import { useTesti } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { PROVA } from '@/lib/i18n/testi/prova'

export default function ErroreProva({ reset }: { error: Error; reset: () => void }) {
  const t = useTesti(PROVA)
  return (
    <div role="alert" className="mx-auto mt-10 max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center">
      <TriangleAlert className="mx-auto size-6 text-status-critical" aria-hidden="true" />
      <p className="text-sm">{t.errore}</p>
      <Button type="button" variant="outline" className="h-11" onClick={reset}>
        {t.riprova}
      </Button>
    </div>
  )
}
