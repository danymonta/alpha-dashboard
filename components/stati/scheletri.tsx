import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/*
 * Pieces of the loading states with the shape of the page (1.33.0, spec A8). A
 * skeleton stays on screen at least 300 ms at every navigation not in the cache
 * (React's own minimum): when it has the page's shape, nothing jumps when the
 * content arrives. Never a full-screen spinner.
 */

/** The whole loading state: one busy region, said once to screen readers. */
export function Scheletro({ etichetta, className, children }: { etichetta: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-5', className)} aria-busy="true" aria-live="polite">
      {children}
      <span className="sr-only">{etichetta}</span>
    </div>
  )
}

/** Title and description of IntestazionePagina, with room for its actions. */
export function ScheletroIntestazione({ azioni = 0 }: { azioni?: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {azioni > 0 ? (
        <div className="flex gap-2">
          {Array.from({ length: azioni }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-36 rounded-lg" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** SelettorePeriodo: two 44 px arrows around the period button. */
export function ScheletroPeriodo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Skeleton className="size-11 rounded-lg" />
      <Skeleton className="h-11 w-40 rounded-lg" />
      <Skeleton className="size-11 rounded-lg" />
    </div>
  )
}

/** A row of 44 px filter chips (states, views). */
export function ScheletroChip({ quanti, className }: { quanti: number; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {Array.from({ length: quanti }).map((_, i) => (
        <Skeleton key={i} className={cn('h-11 rounded-lg', i % 3 === 0 ? 'w-24' : i % 3 === 1 ? 'w-28' : 'w-20')} />
      ))}
    </div>
  )
}

/** A card of numbers: a small title, then label and value in a grid. */
export function ScheletroNumeri({
  colonne = 3,
  quanti = 3,
  titolo = true,
  grande = false,
  className,
}: {
  colonne?: 2 | 3 | 4
  quanti?: number
  titolo?: boolean
  grande?: boolean
  className?: string
}) {
  return (
    <div className={cn('space-y-4 rounded-xl bg-card p-4', className)}>
      {titolo ? <Skeleton className="h-4 w-32" /> : null}
      <div className={cn('grid gap-3', colonne === 2 ? 'grid-cols-2' : colonne === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
        {Array.from({ length: quanti }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className={cn(grande ? 'h-8 w-24' : 'h-6 w-16')} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** A list in a card: rows with a name line and a detail line, an amount on the right. */
export function ScheletroRighe({ quante, className }: { quante: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-border rounded-xl bg-card', className)}>
      {Array.from({ length: quante }).map((_, i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn('h-4', i % 2 ? 'w-36' : 'w-44')} />
            <Skeleton className="h-3 w-52 max-w-full" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Below 768 px a list of cards, above it a table with a header row (CLAUDE.md section 11). */
export function ScheletroTabella({ righe, colonne }: { righe: number; colonne: number }) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {Array.from({ length: righe }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl bg-card md:block">
        <div className="flex gap-4 border-b border-border px-3 py-3">
          {Array.from({ length: colonne }).map((_, i) => (
            <Skeleton key={i} className={cn('h-3', i === 0 ? 'flex-[2]' : 'flex-1')} />
          ))}
        </div>
        {Array.from({ length: righe }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-b-0">
            {Array.from({ length: colonne }).map((_, i) => (
              <Skeleton key={i} className={cn('h-4', i === 0 ? 'flex-[2]' : 'flex-1')} />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
