import type { ReactNode } from 'react'

import { SchedeTempo } from '@/components/pm/tempo-team/schede-tempo'
import { solaLettura } from '@/lib/auth/roles'
import { requireProfilo } from '@/lib/auth/session'

/**
 * The time area. The admin gets two tabs, his own time and the team's; for
 * everyone else the page is just "Il mio tempo", as before.
 */
export default async function LayoutTempo({ children }: { children: ReactNode }) {
  const profilo = await requireProfilo()
  // the business coach has no time of his own: only «Team» (22/10/2026), no tabs
  if (profilo.ruolo !== 'admin' || solaLettura(profilo.ruolo)) return children

  return (
    <div className="space-y-5">
      <SchedeTempo />
      <div>{children}</div>
    </div>
  )
}
