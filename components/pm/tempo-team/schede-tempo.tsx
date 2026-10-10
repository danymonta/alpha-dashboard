'use client'

import { usePathname } from 'next/navigation'

import { LinkNav } from '@/components/shell/link-nav'
import { cn } from '@/lib/utils'

const SCHEDE = [
  { href: '/tempo', etichetta: 'Il mio tempo' },
  { href: '/tempo/team', etichetta: 'Team' },
] as const

/**
 * "Il mio tempo" and "Team" side by side. Admin only (the layout decides):
 * everyone else has just their own time and no tabs at all. Each tab has its
 * own period (a week there, a month here): nothing travels between them.
 */
export function SchedeTempo() {
  const pathname = usePathname()

  return (
    <nav aria-label="Il mio tempo e il team" className="border-b border-border">
      <ul className="flex gap-1">
        {SCHEDE.map(({ href, etichetta }) => {
          const attiva = href === '/tempo' ? pathname === '/tempo' : pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href} className="shrink-0">
              <LinkNav
                href={href}
                aria-current={attiva ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors',
                  attiva
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {etichetta}
              </LinkNav>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
