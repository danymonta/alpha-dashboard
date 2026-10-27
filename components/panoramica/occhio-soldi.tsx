'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useTransition } from 'react'

import { impostaSoldiNascosti } from '@/app/actions/soldi'
import { useTesti } from '@/components/i18n/lingua-provider'
import { OCCHIO_SOLDI } from '@/lib/i18n/testi/dalle-call'
import { cn } from '@/lib/utils'

/**
 * The money eye (Dany, 27/10/2026): one tap hides every money number of the Panoramica on this
 * device, another brings them back. The words say where the tap leads, never the icon alone.
 */
export function OcchioSoldi({ nascosti, className }: { nascosti: boolean; className?: string }) {
  const t = useTesti(OCCHIO_SOLDI)
  const [inCorso, avvia] = useTransition()
  const Icona = nascosti ? Eye : EyeOff
  return (
    <button
      type="button"
      data-testid="occhio-soldi"
      aria-busy={inCorso || undefined}
      disabled={inCorso}
      onClick={() => avvia(() => impostaSoldiNascosti(!nascosti))}
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60',
        className,
      )}
    >
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      {nascosti ? t.mostra : t.nascondi}
    </button>
  )
}
