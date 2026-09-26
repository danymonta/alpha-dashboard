import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  titolo: string
  descrizione: string
  Icona?: LucideIcon
  azione?: ReactNode
}

/** Empty state: never a blank screen, always a next step. */
export function StatoVuoto({ titolo, descrizione, Icona = Inbox, azione }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <Icona className="size-6 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{titolo}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {descrizione}
        </p>
      </div>
      {azione}
    </div>
  )
}
