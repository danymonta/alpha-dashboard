import Link from 'next/link'

import { BadgePunteggio } from '@/components/marketing/analisi/badge-punteggio'
import type { Lingua } from '@/lib/i18n/lingua'
import { POST_INSTAGRAM } from '@/lib/i18n/testi/post-instagram'
import { hrefAnalisiReel } from '@/lib/marketing/analisi/pannello'
import type { TipoPost } from '@/lib/marketing/abbinamento'
import type { PunteggioBreve } from '@/lib/marketing/punteggio/leggi'

/**
 * The score of the post's reel, where the post is shown (the content panel; 1.39.0): the
 * badge and the link to its panel in Pubblicati, where the score is made and read in full. It asks Claude for nothing:
 * the score is only read. A reel without one says «Non valutato» and still links to its panel, where
 * «Analizza» is; a carousel or a photo has no score (the guide has no table for them).
 */
export function PunteggioDelPost({
  tipo,
  mediaId,
  punteggio,
  lingua = 'it',
}: {
  tipo: TipoPost
  mediaId: string
  punteggio: PunteggioBreve | null | undefined
  lingua?: Lingua
}) {
  const t = POST_INSTAGRAM[lingua].punteggio
  if (tipo !== 'reel') {
    return (
      <p className="text-xs text-muted-foreground" data-testid="punteggio-post-solo-reel">
        {t.soloReel}
      </p>
    )
  }
  return (
    <p className="flex flex-wrap items-center gap-x-3" data-testid="punteggio-post">
      <BadgePunteggio totale={punteggio?.totale} fascia={punteggio?.fascia} vuoto={t.nonValutato} lingua={lingua} />
      <Link
        href={hrefAnalisiReel(mediaId)}
        className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 hover:text-foreground"
      >
        {t.apriPubblicati}
      </Link>
    </p>
  )
}
