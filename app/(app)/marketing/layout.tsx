import type { ReactNode } from 'react'

import { SchedeMarketing } from '@/components/marketing/schede-marketing'
import { RUOLI_MARKETING_LETTURA } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'

/**
 * The Marketing area (1.33.0): its tabs stay still between its pages
 * («Piano editoriale», «Pubblicati», «Spunti»). The admin, the video editor
 * and marketing (every page checks it again). Every action of the area
 * revalidates this layout.
 */
export default async function LayoutMarketing({ children }: { children: ReactNode }) {
  // the business coach too, in read only (22/10/2026)
  await requireRuolo(RUOLI_MARKETING_LETTURA)

  return (
    <div>
      <SchedeMarketing />
      {children}
    </div>
  )
}
