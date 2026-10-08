import { Sparkles } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The Instagram DM insights of the last 24 hours live in a Claude artifact
 * (Dany, 08/10/2026: «embedda semplicemente l'artefatto in un pulsante…
 * senza che sviluppi niente dentro»): a link out, nothing built here.
 */
export const INSIGHT_24H = {
  url: 'https://claude.ai/artifact/PKRVEjLi5FMv9RL1rWYHyM',
  etichetta: 'Insight delle ultime 24h',
} as const

export function LinkInsight24h() {
  return (
    <a
      href={INSIGHT_24H.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}
      data-testid="insight-24h"
    >
      <Sparkles className="size-4 text-[var(--brand-fire-flame)]" aria-hidden="true" />
      {INSIGHT_24H.etichetta}
      <span className="sr-only"> (si apre in una nuova scheda)</span>
    </a>
  )
}
