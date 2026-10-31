'use client'

import { CalendarDays, Table2, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { useTesti } from '@/components/i18n/lingua-provider'
import { IndicatoreLink } from '@/components/shell/link-riga'
import { CALENDARIO_CONTENUTI } from '@/lib/i18n/testi/calendario-contenuti'
import { cookieVista, hrefVista, type VistaContenuti } from '@/lib/marketing/vista'
import { cn } from '@/lib/utils'

const VISTE: { valore: VistaContenuti; Icona: LucideIcon }[] = [
  { valore: 'tabella', Icona: Table2 },
  { valore: 'calendario', Icona: CalendarDays },
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
 * "Tabella | Calendario" of the Piano editoriale (1.69.0), as "Elenco |
 * Timeline" in Progetti: two links of the navigation, 44 px, so the view lives
 * in the address (?vista=calendario) next to the filters and the tab, which it
 * keeps. The tap also remembers it in a cookie of this device, before the
 * navigation leaves: /marketing/contenuti without ?vista opens the view chosen
 * last (and loading.tsx draws its shape).
 */
export function SceltaVista({
  vista,
  parametri,
  className,
}: {
  vista: VistaContenuti
  /** The filters, the tab and the month in the address; ?vista among them only when the address says it. */
  parametri: Record<string, string | undefined>
  className?: string
}) {
  const t = useTesti(CALENDARIO_CONTENUTI)
  return (
    <div role="group" aria-label={t.vista} className={cn('inline-flex', className)}>
      {VISTE.map(({ valore, Icona }, i) => {
        const attiva = valore === vista
        return (
          <Link
            key={valore}
            href={hrefVista(valore, vista, parametri)}
            scroll={false}
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
            <IndicatoreLink riposo={<Icona className="size-4" aria-hidden="true" />} />
            {valore === 'tabella' ? t.tabella : t.calendario}
          </Link>
        )
      })}
    </div>
  )
}
