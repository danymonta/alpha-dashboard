import type { ReactNode } from 'react'

import { SchedeTempo } from '@/components/pm/tempo-team/schede-tempo'
import { requireProfilo } from '@/lib/auth/session'

/**
 * The time area. The admin gets two tabs, his own time and the team's; for
 * everyone else the page is just "Il mio tempo", as before.
 */
export default async function LayoutTempo({ children }: { children: ReactNode }) {
  const profilo = await requireProfilo()
  if (profilo.ruolo !== 'admin') return children

  return (
    <div>
      <SchedeTempo />
      <div>{children}</div>
    </div>
  )
}
