'use client'

import { usePathname } from 'next/navigation'

import { ConteggioEsiti } from '@/components/shell/conteggio-esiti'
import { SchedePagina } from '@/components/shell/schede-pagina'
import { nomeSchedaPost } from '@/lib/marketing/parole-post'

/**
 * The tabs of the Marketing area (1.33.0): «Piano editoriale» (until 21/10/2026 «Contenuti»), the calendar, and
 * «Post di Instagram», the posts of the account and their links to it, and
 * (1.36.0) «Analisi», the numbers and Claude's reading of the reels, and (1.37.0) «Spunti», the weekly brief. In the area's layout, so they stay still between its pages.
 * «Post di Instagram» carries the number of posts to link, said in its name
 * («Post di Instagram, 5 da collegare»), the digit hidden from screen readers.
 */
export function SchedeMarketing({ daCollegare }: { daCollegare: number }) {
  const pathname = usePathname()
  const schede = [
    { href: '/marketing/contenuti', etichetta: 'Piano editoriale' },
    {
      href: '/marketing/instagram',
      etichetta: 'Post di Instagram',
      nome: daCollegare > 0 ? nomeSchedaPost(daCollegare) : undefined,
      badge: <ConteggioEsiti numero={daCollegare} testId="conteggio-da-collegare" />,
    },
    { href: '/marketing/analisi', etichetta: 'Analisi' },
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
