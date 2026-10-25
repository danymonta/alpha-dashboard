'use client'

import { BookOpen } from 'lucide-react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { legende } from '@/lib/metriche/legenda-en'

/**
 * "Cosa significa ogni numero" near the top of a page: jumps to the legend at
 * the bottom (a wrapper with this id around LegendaSezione) and opens it.
 * Without JavaScript it still jumps; the legend opens with one more tap.
 */
export function LinkLegenda({ idLegenda }: { idLegenda: string }) {
  const titolo = legende(useLingua()).titolo
  return (
    <a
      href={`#${idLegenda}`}
      onClick={() => {
        const dettagli = document.getElementById(idLegenda)?.querySelector('details')
        if (dettagli) dettagli.open = true
      }}
      // an inline link: its touch area grows to 44px without moving the text
      className="relative inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground underline underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-[''] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <BookOpen className="size-3.5 shrink-0" aria-hidden="true" />
      {titolo}
    </a>
  )
}
