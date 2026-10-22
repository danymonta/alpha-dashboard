'use client'

import { ChartGantt, LayoutGrid, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { useLingua } from '@/components/i18n/lingua-provider'
import { PROGETTI } from '@/lib/i18n/testi/progetti'
import { cookieVista, type VistaProgetti } from '@/lib/progetti-timeline'
import { cn } from '@/lib/utils'

const VISTE: { valore: VistaProgetti; Icona: LucideIcon }[] = [
  { valore: 'elenco', Icona: LayoutGrid },
  { valore: 'timeline', Icona: ChartGantt },
]

/** Never in the way: without cookies the switch still works through the address. */
function ricorda(vista: VistaProgetti) {
  try {
    document.cookie = cookieVista(vista, window.location.protocol === 'https:')
  } catch {
    // cookies blocked: nothing remembered
  }
}

/**
 * "Elenco | Timeline" on /progetti (05/10/2026): two links, so the view lives
 * in the URL (?vista=timeline) next to the filters, which it keeps. The tap
 * also remembers it in a cookie of this browser, before the navigation
 * leaves: /progetti without ?vista opens the view chosen last.
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
  const t = PROGETTI[useLingua()]
  function href(valore: VistaProgetti) {
    const cerca = new URLSearchParams()
    for (const [chiave, v] of Object.entries(parametri)) {
      if (v !== undefined && chiave !== 'vista') cerca.set(chiave, v)
    }
    if (valore === 'timeline') cerca.set('vista', 'timeline')
    // the timeline came from the memory, not the address: the same address would show it again
    else if (vista === 'timeline' && !parametri.vista) cerca.set('vista', 'elenco')
    const testo = cerca.toString()
    return testo ? `/progetti?${testo}` : '/progetti'
  }

  return (
    <div role="group" aria-label={t.vista} className={cn('inline-flex self-end', className)}>
      {VISTE.map(({ valore, Icona }, i) => {
        const attiva = valore === vista
        return (
          <Link
            key={valore}
            href={href(valore)}
            aria-current={attiva ? 'page' : undefined}
            onClick={() => ricorda(valore)}
            className={cn(
              'inline-flex h-11 items-center gap-1.5 border px-3 text-sm transition-colors focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              i === 0 ? 'rounded-l-lg' : '-ml-px rounded-r-lg',
              attiva
                ? 'z-[1] border-foreground/30 bg-accent font-medium text-foreground'
                : 'border-input bg-input/30 text-muted-foreground hover:text-foreground',
            )}
          >
            <Icona className="size-4" aria-hidden="true" />
            {t.viste[valore]}
          </Link>
        )
      })}
    </div>
  )
}
