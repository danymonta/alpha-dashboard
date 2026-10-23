'use client'

import { BookOpen, ChevronDown } from 'lucide-react'

import { useLingua } from '@/components/i18n/lingua-provider'
import type { VoceLegenda } from '@/lib/metriche/legenda'
import { legende } from '@/lib/metriche/legenda-en'

/** "Cosa significa ogni numero": the definitions of a page, closed until tapped. */
export function LegendaSezione({ voci, titolo }: { voci: VoceLegenda[]; titolo?: string }) {
  const predefinito = legende(useLingua()).titolo
  return (
    <details className="group rounded-xl bg-card" data-testid="legenda">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {titolo ?? predefinito}
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <dl className="grid gap-x-6 gap-y-3 px-4 pb-4 text-sm md:grid-cols-2">
        {/* keyed by position: two entries of a page may share a label */}
        {voci.map((v, i) => (
          <div key={i}>
            <dt className="font-medium">{v.etichetta}</dt>
            <dd className="text-muted-foreground">{v.spiegazione}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
