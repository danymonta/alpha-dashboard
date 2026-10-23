'use client'

import { CalendarDays, Table2, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { useTesti } from '@/components/i18n/lingua-provider'
import { RECAP } from '@/lib/i18n/testi/recap'
import { cookieVistaRecap, type VistaRecap } from '@/lib/recap/vista'
import { cn } from '@/lib/utils'

const VISTE: { valore: VistaRecap; Icona: LucideIcon }[] = [
  { valore: 'calendario', Icona: CalendarDays },
  { valore: 'tabella', Icona: Table2 },
]

/** Never in the way: without cookies the switch still works through the address. */
function ricorda(vista: VistaRecap) {
  try {
    document.cookie = cookieVistaRecap(vista, window.location.protocol === 'https:')
  } catch {
    // cookies blocked: nothing remembered
  }
}

/**
 * «Calendario | Tabella» of the sales recap (1.59.0): two links, so the view lives in the
 * address (?vista=tabella) next to the month, which it keeps. The tap also remembers it in a
 * cookie of this browser, before the navigation leaves.
 */
export function SceltaVistaRecap({ vista, mese, className }: { vista: VistaRecap; mese: string | null; className?: string }) {
  const t = useTesti(RECAP)
  function href(valore: VistaRecap) {
    const cerca = new URLSearchParams()
    if (mese) cerca.set('mese', mese)
    cerca.set('vista', valore)
    return `/recap?${cerca.toString()}`
  }

  return (
    <div role="group" aria-label={t.vista} className={cn('inline-flex', className)}>
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
