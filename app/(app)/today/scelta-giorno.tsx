'use client'

import { useRouter } from 'next/navigation'

/**
 * The date under the title is also the way to jump to any past day: tapping it
 * opens the native date picker. The future is not selectable.
 */
export function SceltaGiorno({ data, oggi }: { data: string; oggi: string }) {
  const router = useRouter()

  return (
    <input
      type="date"
      aria-label="Scegli il giorno del report"
      value={data}
      max={oggi}
      onChange={(e) => {
        const scelta = e.target.value
        if (!scelta || scelta > oggi) return
        router.push(scelta === oggi ? '/today' : `/today?data=${scelta}`)
      }}
      className="num mx-auto block h-8 rounded-md bg-transparent px-2 text-center text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [color-scheme:dark]"
    />
  )
}
