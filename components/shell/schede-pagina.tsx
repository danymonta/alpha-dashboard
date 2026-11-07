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
 * ever grew, the row scrolls inside its box, never the page. Since 1.73.0 a
 * pill of frosted glass, the current tab a lit pill (never colour alone:
 * aria-current and the weight say it too).
 */
export function SchedePagina({ etichetta, schede }: { etichetta: string; schede: SchedaPagina[] }) {
  return (
    <nav aria-label={etichetta} className="mb-5">
      {/* a pill of glass with the current tab lit (1.73.0): frosted CSS only, no SVG filter */}
      <ul className="vetro inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full p-1 sm:gap-1">
        {schede.map(({ href, etichetta: testo, attiva, nome, Icona, classeIcona, badge, dataTour }) => (
          <li key={href} className="shrink-0">
            <LinkNav
              href={href}
              data-tour={dataTour}
              aria-current={attiva ? 'page' : undefined}
              aria-label={nome}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full px-2.5 text-sm whitespace-nowrap transition-colors sm:px-4',
                attiva
                  ? 'glow-primario bg-selezione font-medium text-selezione-foreground'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
              )}
            >
              {/* on the lit pill the icon takes the pill's text colour: a tinted icon would lose contrast */}
              {Icona ? <Icona className={cn('size-4 shrink-0', !attiva && classeIcona)} aria-hidden="true" /> : null}
              {testo}
              {badge}
            </LinkNav>
          </li>
        ))}
      </ul>
    </nav>
  )
}
