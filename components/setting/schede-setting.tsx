'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import type { AppRole } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'

const SCHEDE = [
  { valore: 'setter', href: '/setting', etichetta: 'Setter' },
  { valore: 'closer', href: '/setting/closer', etichetta: 'Closer' },
] as const

type Scheda = (typeof SCHEDE)[number]['valore']

// only the period travels between the tabs: each tab has its own filters
const CHIAVI_PERIODO = ['mese', 'da', 'a'] as const

function Schede({ attiva, query }: { attiva: Scheda; query: string }) {
  return (
    <nav aria-label="Setter e closer" className="border-b border-border">
      <ul className="flex gap-1">
        {SCHEDE.map(({ valore, href, etichetta }) => {
          const corrente = valore === attiva
          return (
            <li key={valore} className="shrink-0">
              <Link
                href={query ? `${href}?${query}` : href}
                aria-current={corrente ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors',
                  corrente
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {etichetta}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function SchedeConPeriodo({ attiva }: { attiva: Scheda }) {
  const parametri = useSearchParams()
  const query = new URLSearchParams()
  for (const chiave of CHIAVI_PERIODO) {
    const valore = parametri.get(chiave)
    if (valore) query.set(chiave, valore)
  }
  return <Schede attiva={attiva} query={query.toString()} />
}

/**
 * Setter and closer side by side, as in Dany's Excel. Admin only: a closer has
 * just his own tab and no access to /setting, so he gets no tabs at all.
 */
export function SchedeSetting({ attiva, ruolo = 'admin' }: { attiva: Scheda; ruolo?: AppRole }) {
  if (ruolo !== 'admin') return null
  return (
    <Suspense fallback={<Schede attiva={attiva} query="" />}>
      <SchedeConPeriodo attiva={attiva} />
    </Suspense>
  )
}
