import { ChevronRight, Megaphone } from 'lucide-react'
import Link from 'next/link'

import { VERSIONE_CORRENTE } from '@/lib/changelog/versioni'

/**
 * The way to the changelog with the version in use (CLAUDE.md section 23):
 * in Impostazioni for the admin, in the profile for everyone.
 */
export function VoceNovita({ descrizione, testId }: { descrizione: string; testId: string }) {
  return (
    <Link
      href="/changelog"
      className="flex min-h-16 items-center gap-3 rounded-xl bg-card p-4 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      data-testid={testId}
    >
      <Megaphone className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Novità</span>
        <span className="block text-sm text-muted-foreground">
          {VERSIONE_CORRENTE ? <span className="num">Versione {VERSIONE_CORRENTE.versione} · </span> : null}
          {descrizione}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  )
}
