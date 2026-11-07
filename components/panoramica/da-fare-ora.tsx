import { CircleCheck, TriangleAlert, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

export type VoceDaFare = {
  id: string
  href: string
  /** Something waits: warning icon and words; otherwise a check. Never colour alone. */
  attenzione: boolean
  testo: string
  /** A short figure next to the words (the late amount). */
  dettaglio?: string
  /** Where the tap goes, for screen readers. */
  azione: string
}

/**
 * «Da fare adesso» (1.72.0): what needs a tap today, in one row, each a link to
 * the page where it is done. The counts come from what the page already read.
 */
export function DaFareOra({ titolo, voci }: { titolo: string; voci: VoceDaFare[] }) {
  if (voci.length === 0) return null
  return (
    <section aria-labelledby="titolo-da-fare" data-testid="da-fare">
      <h2 id="titolo-da-fare" className="mb-2 text-sm font-medium text-muted-foreground">
        {titolo}
      </h2>
      <ul className={cn('grid gap-2', voci.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {voci.map((v) => {
          const Icona = v.attenzione ? TriangleAlert : CircleCheck
          return (
            <li key={v.id}>
              <Link
                href={v.href}
                aria-label={`${v.testo}${v.dettaglio ? `, ${v.dettaglio}` : ''}. ${v.azione}`}
                data-testid={`da-fare-${v.id}`}
                className="group flex min-h-14 items-center gap-3 rounded-xl bg-card px-4 py-3 transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Icona
                  className={cn('size-5 shrink-0', v.attenzione ? 'text-status-warning' : 'text-status-ok')}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm leading-snug', v.attenzione ? 'font-medium' : 'text-muted-foreground')}>
                    {v.testo}
                  </span>
                  {v.dettaglio ? <span className="num block text-xs text-muted-foreground">{v.dettaglio}</span> : null}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
