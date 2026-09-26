'use client'

import { TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Props = {
  titolo?: string
  descrizione?: string
  riprova: () => void
}

/** Error state: human wording plus one way out. Never a stack trace. */
export function StatoErrore({
  titolo = 'Qualcosa non ha funzionato',
  descrizione = 'Non siamo riusciti a caricare questi dati. Riprova fra un momento.',
  riprova,
}: Props) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-border px-6 py-12 text-center"
    >
      <TriangleAlert className="size-6 text-status-critical" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{titolo}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {descrizione}
        </p>
      </div>
      <Button type="button" onClick={riprova} variant="outline" className="h-11">
        Riprova
      </Button>
    </div>
  )
}
