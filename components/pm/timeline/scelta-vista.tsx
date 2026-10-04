import { ChartGantt, LayoutGrid, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import type { VistaProgetti } from '@/lib/progetti-timeline'
import { cn } from '@/lib/utils'

const VISTE: { valore: VistaProgetti; etichetta: string; Icona: LucideIcon }[] = [
  { valore: 'elenco', etichetta: 'Elenco', Icona: LayoutGrid },
  { valore: 'timeline', etichetta: 'Timeline', Icona: ChartGantt },
]

/**
 * "Elenco | Timeline" on /progetti (05/10/2026): two links, so the view lives
 * in the URL (?vista=timeline) next to the filters, which it keeps.
 */
export function SceltaVista({
  vista,
  parametri,
  className,
}: {
  vista: VistaProgetti
  parametri: Record<string, string | undefined>
  className?: string
}) {
  function href(valore: VistaProgetti) {
    const cerca = new URLSearchParams()
    for (const [chiave, v] of Object.entries(parametri)) {
      if (v !== undefined && chiave !== 'vista') cerca.set(chiave, v)
    }
    if (valore === 'timeline') cerca.set('vista', 'timeline')
    const testo = cerca.toString()
    return testo ? `/progetti?${testo}` : '/progetti'
  }

  return (
    <div role="group" aria-label="Vista dei progetti" className={cn('inline-flex self-end', className)}>
      {VISTE.map(({ valore, etichetta, Icona }, i) => {
        const attiva = valore === vista
        return (
          <Link
            key={valore}
            href={href(valore)}
            aria-current={attiva ? 'page' : undefined}
            className={cn(
              'inline-flex h-11 items-center gap-1.5 border px-3 text-sm transition-colors focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              i === 0 ? 'rounded-l-lg' : '-ml-px rounded-r-lg',
              attiva
                ? 'z-[1] border-foreground/30 bg-accent font-medium text-foreground'
                : 'border-input bg-input/30 text-muted-foreground hover:text-foreground',
            )}
          >
            <Icona className="size-4" aria-hidden="true" />
            {etichetta}
          </Link>
        )
      })}
    </div>
  )
}
