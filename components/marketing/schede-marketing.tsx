'use client'

import { usePathname } from 'next/navigation'

import { useLingua } from '@/components/i18n/lingua-provider'
import { SchedePagina } from '@/components/shell/schede-pagina'
import { MARKETING } from '@/lib/i18n/testi/marketing'

/**
 * The tabs of the Marketing area (1.33.0): «Piano editoriale» (until 21/10/2026 «Contenuti»), the calendar, and
 * «Pubblicati» (25/10/2026, in place of «Post di Instagram» and «Analisi»), the published posts with their
 * insights and Claude's reading of the reels, and (1.37.0) «Spunti», the brief. In the area's layout, so they stay
 * still between its pages. No tab carries a number.
 */
export function SchedeMarketing({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname()
  const t = MARKETING[useLingua()].schede
  const schede = [
    { href: '/marketing/contenuti', etichetta: t.piano },
    { href: '/marketing/pubblicati', etichetta: t.pubblicati },
    { href: '/marketing/spunti', etichetta: t.spunti },
    // the objections of the calls (27/10/2026): the admin only
    ...(admin ? [{ href: '/marketing/dalle-call', etichetta: t.dalleCall }] : []),
  ]

  return (
    <SchedePagina
      etichetta={t.aria}
      schede={schede.map((scheda) => ({
        ...scheda,
        attiva: pathname === scheda.href || pathname.startsWith(`${scheda.href}/`),
      }))}
    />
  )
}
