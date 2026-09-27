'use client'

import { useSyncExternalStore } from 'react'

import { formatCronometro } from '@/lib/tempo'
import { cn } from '@/lib/utils'

// One shared clock for every running display: one interval, however many
// timers are on screen. Display only: the saved minutes come from the database.
let adesso = 0
const ascoltatori = new Set<() => void>()
let intervallo: ReturnType<typeof setInterval> | null = null

function avvisa() {
  adesso = Date.now()
  for (const ascolta of ascoltatori) ascolta()
}

function iscriviti(ascolta: () => void) {
  ascoltatori.add(ascolta)
  if (!intervallo) {
    intervallo = setInterval(avvisa, 1000)
    queueMicrotask(avvisa)
  }
  return () => {
    ascoltatori.delete(ascolta)
    if (ascoltatori.size === 0 && intervallo) {
      clearInterval(intervallo)
      intervallo = null
    }
  }
}

/** Milliseconds since epoch, ticking every second; 0 before the first tick and on the server. */
function useAdesso() {
  return useSyncExternalStore(
    iscriviti,
    () => adesso,
    () => 0,
  )
}

/** "01:02:03" since `inizio`, ticking. "--:--:--" until the clock has started. */
export function Cronometro({ inizio, className }: { inizio: string; className?: string }) {
  const ora = useAdesso()
  const testo = ora === 0 ? '--:--:--' : formatCronometro((ora - new Date(inizio).getTime()) / 1000)

  return (
    <span className={cn('num', className)} data-testid="cronometro">
      {testo}
    </span>
  )
}
