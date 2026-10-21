import type { ReactNode } from 'react'

import './etichette.css'

import { cn } from '@/lib/utils'
import type { ColoreEtichetta } from '@/lib/marketing/opzioni'

/**
 * The pill of a label (Dany, 21/10/2026, like Notion's select): the name on a
 * tinted background, the colours the tokens of etichette.css. Never the colour
 * alone: the name is always there, so it reads in grey too. `punto` adds the
 * dot of a Status.
 */
export function Pillola({
  nome,
  colore,
  punto = false,
  className,
  children,
}: {
  nome: string
  colore: ColoreEtichetta
  /** The dot of the Status, before the name. */
  punto?: boolean
  className?: string
  /** What goes after the name (the X of a chosen option). */
  children?: ReactNode
}) {
  return (
    <span
      data-colore={colore}
      className={cn(
        'pillola inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-sm leading-5 whitespace-nowrap',
        className,
      )}
    >
      {punto ? <span className="pillola-punto size-2 shrink-0 rounded-full" aria-hidden="true" /> : null}
      <span className="truncate">{nome}</span>
      {children}
    </span>
  )
}

/** A swatch of a colour (the menu of an option): a small round chip with the colour's edge. */
export function CampioneColore({ colore, className }: { colore: ColoreEtichetta; className?: string }) {
  return (
    <span
      data-colore={colore}
      aria-hidden="true"
      className={cn('pillola pillola-campione inline-block size-5 shrink-0 rounded-full', className)}
    />
  )
}
