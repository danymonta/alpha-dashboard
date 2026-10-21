import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { LinkNav } from '@/components/shell/link-nav'
import { cn } from '@/lib/utils'

export type SchedaPagina = {
  href: string
  etichetta: string
  attiva: boolean
  /** The accessible name when it says more than the label (a badge, "Oggi, 2 giornate da approvare"). */
  nome?: string
  Icona?: LucideIcon
  /** Classes of the icon (the Insight's sparkles take the brand's flame). */
  classeIcona?: string
  /** A badge after the label. */
  badge?: ReactNode
  /** The element the guided tour points at. */
  dataTour?: string
}

/**
 * The tabs on top of a page that has a sibling page (1.38.0, the same look as
 * the Marketing area's, 1.33.0): link tabs, not a tablist, 44 px high, the
 * current one marked with aria-current. They are links of the navigation
 * (LinkNav: same prefetch on intent, same dissolve). One row at 390 px; if it
 * ever grew, the row scrolls inside its box, never the page.
 */
export function SchedePagina({ etichetta, schede }: { etichetta: string; schede: SchedaPagina[] }) {
  return (
    <nav aria-label={etichetta} className="mb-5 border-b border-border">
      <ul className="flex gap-0.5 overflow-x-auto sm:gap-1">
        {schede.map(({ href, etichetta: testo, attiva, nome, Icona, classeIcona, badge, dataTour }) => (
          <li key={href} className="shrink-0">
            <LinkNav
              href={href}
              data-tour={dataTour}
              aria-current={attiva ? 'page' : undefined}
              aria-label={nome}
              className={cn(
                '-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-2 text-sm transition-colors sm:px-3',
                attiva
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {Icona ? <Icona className={cn('size-4 shrink-0', classeIcona)} aria-hidden="true" /> : null}
              {testo}
              {badge}
            </LinkNav>
          </li>
        ))}
      </ul>
    </nav>
  )
}
