import { Sparkles } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The Instagram DM insights of the last 24 hours live in a Claude artifact
 * (Dany, 08/10/2026: «embedda semplicemente l'artefatto in un pulsante…
 * senza che sviluppi niente dentro»): a link out, nothing built here. The
 * admin has it in Setter, the setter in Oggi and I miei numeri («sì deve
 * avere visione anche il setter»); the artifact opens for whoever Dany
 * shares it with on claude.ai.
 */
export const INSIGHT_24H = {
  url: 'https://claude.ai/artifact/PKRVEjLi5FMv9RL1rWYHyM',
  etichetta: 'Insight delle ultime 24h',
} as const

export function LinkInsight24h({ className }: { className?: string }) {
  return (
    <a
      href={INSIGHT_24H.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: 'outline' }), 'h-11', className)}
      data-testid="insight-24h"
    >
      <Sparkles className="size-4 text-[var(--brand-fire-flame)]" aria-hidden="true" />
      {INSIGHT_24H.etichetta}
      <span className="sr-only"> (si apre in una nuova scheda)</span>
    </a>
  )
}
