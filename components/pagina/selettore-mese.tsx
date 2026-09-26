import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { aggiungiMesi } from '@/lib/date'
import { formatMese } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  /** 'YYYY-MM-01' */
  mese: string
  /** Current month: the future is never selectable. */
  meseCorrente: string
  percorso: string
  /** Other query params to keep while moving between months. */
  parametri?: Record<string, string | undefined>
  className?: string
}

function href(percorso: string, mese: string, parametri: Props['parametri']) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(parametri ?? {})) if (v) qs.set(k, v)
  qs.set('mese', mese.slice(0, 7))
  return `${percorso}?${qs.toString()}`
}

export function SelettoreMese({ mese, meseCorrente, percorso, parametri, className }: Props) {
  const precedente = aggiungiMesi(mese, -1)
  const successivo = aggiungiMesi(mese, 1)
  const classi =
    'flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'

  return (
    <nav aria-label="Scegli il mese" className={cn('flex items-center gap-1', className)}>
      <Link href={href(percorso, precedente, parametri)} aria-label="Mese precedente" className={classi}>
        <ChevronLeft className="size-5" aria-hidden="true" />
      </Link>
      <p className="min-w-36 text-center text-sm font-medium capitalize" aria-live="polite">
        {formatMese(mese)}
      </p>
      {successivo <= meseCorrente ? (
        <Link href={href(percorso, successivo, parametri)} aria-label="Mese successivo" className={classi}>
          <ChevronRight className="size-5" aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${classi} opacity-30 hover:bg-transparent`}>
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  )
}
