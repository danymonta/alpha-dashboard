'use client'

import { usePathname } from 'next/navigation'

import { SchedePagina } from '@/components/shell/schede-pagina'

/**
 * The tabs of the Marketing area (1.33.0): «Piano editoriale» (until 21/10/2026 «Contenuti»), the calendar, and
 * «Pubblicati» (25/10/2026, in place of «Post di Instagram» and «Analisi»), the published posts with their
 * insights and Claude's reading of the reels, and (1.37.0) «Spunti», the brief. In the area's layout, so they stay
 * still between its pages. No tab carries a number.
 */
export function SchedeMarketing() {
  const pathname = usePathname()
  const schede = [
    { href: '/marketing/contenuti', etichetta: 'Piano editoriale' },
    { href: '/marketing/pubblicati', etichetta: 'Pubblicati' },
    { href: '/marketing/spunti', etichetta: 'Spunti' },
  ]

  return (
    <SchedePagina
      etichetta="Sezioni del Marketing"
      schede={schede.map((scheda) => ({
        ...scheda,
        attiva: pathname === scheda.href || pathname.startsWith(`${scheda.href}/`),
      }))}
    />
  )
}
