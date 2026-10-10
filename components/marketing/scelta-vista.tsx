'use client'

import { CalendarDays, Table2, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { IndicatoreLink } from '@/components/shell/link-riga'
import { cookieVista, type VistaContenuti } from '@/lib/marketing/vista'
import { cn } from '@/lib/utils'

const VISTE: { valore: VistaContenuti; etichetta: string; Icona: LucideIcon }[] = [
  { valore: 'tabella', etichetta: 'Tabella', Icona: Table2 },
  { valore: 'calendario', etichetta: 'Calendario', Icona: CalendarDays },
]

/** Never in the way: without cookies the switch still works through the address. */
function ricorda(vista: VistaContenuti) {
  try {
    document.cookie = cookieVista(vista, window.location.protocol === 'https:')
  } catch {
    // cookies blocked: nothing remembered
  }
}

/**
 * "Tabella | Calendario" on the content calendar, as "Elenco | Timeline" in
 * Progetti: two links, so the view lives in the URL (?vista=calendario) next
 * to the filters, which it keeps. The tap also remembers it in a cookie of
 * this browser, before the navigation leaves: /marketing/contenuti without
 * ?vista opens the view chosen last.
 */
export function SceltaVista({
  vista,
  parametri,
  className,
}: {
  vista: VistaContenuti
  /** The filters and the month in the address; ?vista among them only when the address says it. */
  parametri: Record<string, string | undefined>
  className?: string
}) {
  function href(valore: VistaContenuti) {
    const cerca = new URLSearchParams()
    for (const [chiave, v] of Object.entries(parametri)) {
      // the month belongs to the calendar only
      if (v !== undefined && chiave !== 'vista' && (chiave !== 'mese' || valore === 'calendario')) cerca.set(chiave, v)
    }
    if (valore === 'calendario') cerca.set('vista', 'calendario')
    // the calendar came from the memory, not the address: the same address would show it again
    else if (vista === 'calendario' && !parametri.vista) cerca.set('vista', 'tabella')
    const testo = cerca.toString()
    return testo ? `/marketing/contenuti?${testo}` : '/marketing/contenuti'
  }

  return (
    <div role="group" aria-label="Vista dei contenuti" className={cn('inline-flex', className)}>
      {VISTE.map(({ valore, etichetta, Icona }, i) => {
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
            {/* the other view is on its way: the icon becomes a spinner after 120 ms */}
            <IndicatoreLink riposo={<Icona className="size-4" />} />
            {etichetta}
          </Link>
        )
      })}
    </div>
  )
}
