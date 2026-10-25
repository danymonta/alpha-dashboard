'use client'

import { CalendarDays } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { useTesti } from '@/components/i18n/lingua-provider'
import { OGGI } from '@/lib/i18n/testi/oggi'

/**
 * "Un altro giorno": under the title, the way to fill or correct any past day.
 * Tapping it opens the native date picker; the future is not selectable.
 */
export function SceltaGiorno({ data, oggi }: { data: string; oggi: string }) {
  const router = useRouter()
  const t = useTesti(OGGI)

  return (
    <label className="mx-auto mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg border border-input px-3 text-sm text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50 hover:bg-accent hover:text-foreground">
      <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{t.unAltroGiorno}</span>
      <input
        type="date"
        aria-label={t.scegliGiorno}
        value={data}
        max={oggi}
        onChange={(e) => {
          const scelta = e.target.value
          if (!scelta || scelta > oggi) return
          router.push(scelta === oggi ? '/today' : `/today?data=${scelta}`)
        }}
        className="num h-10 bg-transparent text-sm outline-none"
      />
    </label>
  )
}
