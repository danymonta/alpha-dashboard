import type { ReactNode } from 'react'

import { PalcoWizard } from '@/app/(app)/onboarding/nuovo/palco'

/**
 * The stage of the wizard sits above its page (palco.tsx says why): the last screen must
 * survive the page drawn again by the action that started the onboarding.
 */
export default function LayoutNuovoCliente({ children }: { children: ReactNode }) {
  return <PalcoWizard>{children}</PalcoWizard>
}
