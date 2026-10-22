import type { ReactNode } from 'react'

import { SchedeInsight } from '@/components/insight/schede-insight'
import { leggeComeAdmin } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'

/**
 * The Insight of the last 24 hours is the second tab of «Setter» (admin) and
 * of «Oggi» (setter), 1.38.0: the first tab is their own page, /setting or
 * /today, which carries the same tabs. The page, its loading state and its
 * error all sit under the tabs, so they never jump. The admin and every active
 * setter (the page checks it again).
 */
export default async function LayoutInsight({ children }: { children: ReactNode }) {
  // the business coach reads it as the admin does, a tab of his «Setter» (22/10/2026)
  const profilo = await requireRuolo(['admin', 'setter', 'business_coach'])
  return (
    <div>
      <SchedeInsight ruolo={leggeComeAdmin(profilo.ruolo) ? 'admin' : 'setter'} attiva="insight" />
      {children}
    </div>
  )
}
