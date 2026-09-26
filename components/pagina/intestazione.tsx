import type { ReactNode } from 'react'

type Props = {
  titolo: string
  descrizione?: string
  azione?: ReactNode
}

export function IntestazionePagina({ titolo, descrizione, azione }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">{titolo}</h1>
        {descrizione ? (
          <p className="text-sm text-muted-foreground">{descrizione}</p>
        ) : null}
      </div>
      {azione}
    </div>
  )
}
