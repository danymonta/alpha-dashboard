import Link from 'next/link'

import { BadgePunteggio } from '@/components/marketing/analisi/badge-punteggio'
import { hrefAnalisiReel } from '@/lib/marketing/analisi/pannello'
import type { TipoPost } from '@/lib/marketing/abbinamento'
import type { PunteggioBreve } from '@/lib/marketing/punteggio/leggi'

/**
 * The score of the post's reel, where the post is shown (Post di Instagram, the content panel; 1.39.0): the
 * badge and the link to its analysis, where the score is made and read in full. It asks Claude for nothing:
 * the score is only read. A reel without one says «Non valutato» and still links to the analysis, where
 * «Analizza» is; a carousel or a photo has no score (the guide has no table for them).
 */
export function PunteggioDelPost({ tipo, mediaId, punteggio }: { tipo: TipoPost; mediaId: string; punteggio: PunteggioBreve | null | undefined }) {
  if (tipo !== 'reel') {
    return (
      <p className="text-xs text-muted-foreground" data-testid="punteggio-post-solo-reel">
        Il punteggio vale per i reel.
      </p>
    )
  }
  return (
    <p className="flex flex-wrap items-center gap-x-3" data-testid="punteggio-post">
      <BadgePunteggio totale={punteggio?.totale} fascia={punteggio?.fascia} />
      <Link
        href={hrefAnalisiReel(mediaId)}
        className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 hover:text-foreground"
      >
        {punteggio ? 'Apri l’analisi' : 'Apri l’analisi del reel'}
      </Link>
    </p>
  )
}
