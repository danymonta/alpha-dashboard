import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Tono } from '@/lib/insight/toni'
import { cn } from '@/lib/utils'

/**
 * The tones of the artifact's pills on the app's tokens (CLAUDE.md section
 * 11). The critical text is --alpha-rosso-testo, readable on the tinted card
 * (--status-critical as text would not be). A tinted pill always has its icon
 * and its words: never colour alone.
 */
export const CLASSI_TONO: Record<Tono, string> = {
  critico: 'bg-status-critical/15 text-rosso-testo',
  attenzione: 'bg-status-warning/15 text-status-warning',
  ok: 'bg-status-ok/15 text-status-ok',
  neutro: 'bg-secondary text-muted-foreground',
}

export function Pillola({
  tono = 'neutro',
  Icona,
  children,
  className,
}: {
  tono?: Tono
  Icona?: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <span
      data-tono={tono}
      className={cn(
        'inline-flex min-h-6 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-normal [overflow-wrap:anywhere]',
        CLASSI_TONO[tono],
        className,
      )}
    >
      {Icona ? <Icona className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}
