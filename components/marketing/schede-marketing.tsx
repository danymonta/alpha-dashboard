'use client'

import { usePathname } from 'next/navigation'

import { ConteggioEsiti } from '@/components/shell/conteggio-esiti'
import { LinkNav } from '@/components/shell/link-nav'
import { nomeSchedaPost } from '@/lib/marketing/parole-post'
import { cn } from '@/lib/utils'

/**
 * The tabs of the Marketing area (1.33.0): «Contenuti», the calendar, and
 * «Post di Instagram», the posts of the account and their links to it, and
 * (1.36.0) «Analisi», the numbers and Claude's reading of the reels, and (1.37.0) «Spunti», the weekly brief. In the area's layout, so they stay still between its pages.
 * «Post di Instagram» carries the number of posts to link, said in its name
 * («Post di Instagram, 5 da collegare»), the digit hidden from screen readers.
 */
export function SchedeMarketing({ daCollegare }: { daCollegare: number }) {
  const pathname = usePathname()
  const schede = [
    { href: '/marketing/contenuti', etichetta: 'Contenuti', numero: 0, nome: undefined },
    {
      href: '/marketing/instagram',
      etichetta: 'Post di Instagram',
      numero: daCollegare,
      nome: daCollegare > 0 ? nomeSchedaPost(daCollegare) : undefined,
    },
    { href: '/marketing/analisi', etichetta: 'Analisi', numero: 0, nome: undefined },
    { href: '/marketing/spunti', etichetta: 'Spunti', numero: 0, nome: undefined },
  ]

  return (
    <nav aria-label="Sezioni del Marketing" className="mb-5 border-b border-border">
      <ul className="flex gap-0.5 overflow-x-auto sm:gap-1">
        {schede.map(({ href, etichetta, numero, nome }) => {
          const attiva = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href} className="shrink-0">
              <LinkNav
                href={href}
                aria-current={attiva ? 'page' : undefined}
                aria-label={nome}
                className={cn(
                  '-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-2 text-sm transition-colors sm:px-3',
                  attiva
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {etichetta}
                <ConteggioEsiti numero={numero} testId="conteggio-da-collegare" />
              </LinkNav>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
