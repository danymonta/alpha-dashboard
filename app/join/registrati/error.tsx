'use client'

import { TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TESTI_JOIN as T } from '@/lib/percorso/testi'

/** The database did not answer: the client's words, «Riprova». */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main lang="it" className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div role="alert" className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-5 text-center">
        <TriangleAlert className="mx-auto size-6 text-status-critical" aria-hidden="true" />
        <p className="text-sm">{T.nonDisponibile}</p>
        <Button type="button" variant="outline" className="h-11 w-full" onClick={reset}>
          {T.riprova}
        </Button>
      </div>
    </main>
  )
}
