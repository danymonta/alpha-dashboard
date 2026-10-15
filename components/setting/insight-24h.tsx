import { Sparkles } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The Instagram DM insights of the last 24 hours. Until 1.34.0 a link out to
 * the Claude artifact "Recap DM Alpha" (Dany, 08/10/2026); from 1.35.0 the
 * page of the app itself, /insight (CLAUDE.md section 29): same place, same
 * look, same tab. The admin has it in Setter, the setter in Oggi and I miei
 * numeri («sì deve avere visione anche il setter»).
 */
export const INSIGHT_24H = {
  etichetta: 'Insight delle ultime 24h',
} as const

export function LinkInsight24h({ className }: { className?: string }) {
  return (
    <Link
      href="/insight"
      className={cn(buttonVariants({ variant: 'outline' }), 'h-11', className)}
      data-testid="insight-24h"
    >
      <Sparkles className="size-4 text-[var(--brand-fire-flame)]" aria-hidden="true" />
      {INSIGHT_24H.etichetta}
    </Link>
  )
}
