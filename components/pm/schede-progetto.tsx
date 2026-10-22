'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { StrisciaScorrevole } from '@/components/pagina/striscia-scorrevole'
import { cn } from '@/lib/utils'

const SCHEDE = [
  { percorso: '', chiave: 'panoramica' },
  { percorso: '/attivita', chiave: 'attivita' },
  { percorso: '/gantt', chiave: 'gantt' },
  { percorso: '/tempo', chiave: 'tempo' },
  { percorso: '/note', chiave: 'note' },
  { percorso: '/membri', chiave: 'membri' },
] as const

type Etichette = Record<(typeof SCHEDE)[number]['chiave'] | 'aria', string>

/** Tabs of a project. Each tab is its own route, so each part loads on its own. */
export function SchedeProgetto({ id, etichette }: { id: string; etichette: Etichette }) {
  const pathname = usePathname()
  const base = `/progetti/${id}`

  return (
    // on a phone the tabs stay in reach while scrolling, right under the top bar
    <nav
      aria-label={etichette.aria}
      className="sticky top-[var(--altezza-topbar,65px)] z-10 -mx-4 border-b border-border bg-background md:static md:mx-0"
    >
      {/* the fade is a mask on the tabs only: the sticky background stays opaque */}
      <StrisciaScorrevole attivo={pathname} className="px-4 md:px-0">
        <ul className="flex gap-1">
          {SCHEDE.map(({ percorso, chiave }) => {
            const href = `${base}${percorso}`
            const attiva = percorso === '' ? pathname === base : pathname.startsWith(href)
            return (
              <li key={chiave} className="shrink-0">
                <Link
                  href={href}
                  aria-current={attiva ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors',
                    attiva
                      ? 'border-primary font-medium text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {etichette[chiave]}
                </Link>
              </li>
            )
          })}
        </ul>
      </StrisciaScorrevole>
    </nav>
  )
}
