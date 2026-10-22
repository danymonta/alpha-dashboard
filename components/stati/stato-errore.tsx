'use client'

import { TriangleAlert } from 'lucide-react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { SHELL } from '@/lib/i18n/testi/shell'

type Props = {
  titolo?: string
  descrizione?: string
  riprova: () => void
}

/** Error state: human wording plus one way out. Never a stack trace. */
export function StatoErrore({ titolo, descrizione, riprova }: Props) {
  const t = SHELL[useLingua()].errore
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-border px-6 py-12 text-center"
    >
      <TriangleAlert className="size-6 text-status-critical" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{titolo ?? t.titolo}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {descrizione ?? t.descrizione}
        </p>
      </div>
      <Button type="button" onClick={riprova} variant="outline" className="h-11">
        {t.riprova}
      </Button>
    </div>
  )
}
