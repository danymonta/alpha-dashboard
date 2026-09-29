'use client'

import { CalendarDays } from 'lucide-react'
import { useRouter } from 'next/navigation'

/**
 * "Un altro giorno" under the day's name: the native date picker, then the
 * same page on the day chosen (the closer filter, if any, is kept).
 */
export function SceltaGiorno({ data, percorso, closer }: { data: string; percorso: string; closer?: string }) {
  const router = useRouter()

  return (
    <label className="mx-auto mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg border border-input px-3 text-sm text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50 hover:bg-accent hover:text-foreground">
      <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">Un altro giorno</span>
      <input
        type="date"
        aria-label="Scegli il giorno da compilare"
        value={data}
        onChange={(e) => {
          const scelta = e.target.value
          if (!scelta) return
          const parametri = new URLSearchParams({ data: scelta })
          if (closer) parametri.set('closer', closer)
          router.push(`${percorso}?${parametri.toString()}`)
        }}
        className="num h-10 bg-transparent text-sm outline-none [color-scheme:dark]"
      />
    </label>
  )
}
