'use client'

import { TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mt-10 space-y-4 rounded-xl border border-border bg-card p-6 text-center">
      <TriangleAlert className="mx-auto size-6 text-status-critical" aria-hidden="true" />
      <p className="text-sm">{T.errore}</p>
      <Button type="button" variant="outline" className="h-11" onClick={reset}>
        {T.riprova}
      </Button>
    </div>
  )
}
