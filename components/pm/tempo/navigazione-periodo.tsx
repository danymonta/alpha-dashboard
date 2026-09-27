import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import type { PeriodoTempo } from '@/lib/tempo'
import { cn } from '@/lib/utils'

const FRECCIA =
  'flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'

/**
 * Week by week (never into the future), back to this week, or a free range
 * through a plain GET form: works before hydration too.
 */
export function NavigazionePeriodo({
  percorso,
  periodo,
  oggi,
}: {
  percorso: string
  periodo: PeriodoTempo
  oggi: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <nav aria-label="Scegli la settimana" className="-ml-3 flex items-center gap-1">
        {periodo.precedente ? (
          <Link href={`${percorso}?settimana=${periodo.precedente}`} aria-label="Settimana precedente" className={FRECCIA}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
        ) : null}
        <div className="min-w-44 text-center" aria-live="polite">
          <p className="text-sm font-medium">{periodo.titolo}</p>
          <p className="num text-xs text-muted-foreground">{periodo.etichetta}</p>
        </div>
        {periodo.tipo === 'settimana' ? (
          periodo.successivo ? (
            <Link href={`${percorso}?settimana=${periodo.successivo}`} aria-label="Settimana successiva" className={FRECCIA}>
              <ChevronRight className="size-5" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" className={`${FRECCIA} opacity-30 hover:bg-transparent`}>
              <ChevronRight className="size-5" />
            </span>
          )
        ) : null}
      </nav>

      {!periodo.corrente ? (
        <Link href={percorso} className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}>
          Questa settimana
        </Link>
      ) : null}

      <details className="group w-full sm:w-auto">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground hover:text-foreground">
          Scegli un periodo
        </summary>
        <form method="get" action={percorso} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="space-y-1.5 text-sm">
            <span className="block">Dal</span>
            <input
              type="date"
              name="da"
              required
              max={oggi}
              defaultValue={periodo.da}
              className="num h-11 rounded-lg border border-input bg-input/30 px-2.5"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="block">Al</span>
            <input
              type="date"
              name="a"
              required
              defaultValue={periodo.a > oggi ? oggi : periodo.a}
              className="num h-11 rounded-lg border border-input bg-input/30 px-2.5"
            />
          </label>
          <button type="submit" className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}>
            Mostra
          </button>
        </form>
        <p className="mt-1.5 text-xs text-muted-foreground">Al massimo tre mesi alla volta.</p>
      </details>
    </div>
  )
}
