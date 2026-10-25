import { CalendarDays, ExternalLink, Link2 } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import type { Lingua } from '@/lib/i18n/lingua'
import { INSIGHT_RECAP } from '@/lib/i18n/testi/insight-recap'
import { linkContenutoCalendario, linkPost } from '@/lib/insight/link'
import type { OrigineRecap } from '@/lib/insight/recap'
import { cn } from '@/lib/utils'

/** A calendar content of the Marketing area (admin only: the page reads it with its session, never stored in the recap). */
export type ContenutoCalendario = { id: string; nome: string }

/**
 * «Arriva da: reel del 03/10 «…»» on a lead's card (1.35.0, D26, Dany: «incrocia
 * lo status dei lead che stanno arrivando»): the post the lead comes from,
 * when the DMs tell, and how («condiviso in DM», «parola chiave «ALPHA»»,
 * «risposta a una storia», «dal testo della chat»), with «Apri il post». For
 * the admin, when the post is linked to the calendar, «Nel calendario: …».
 * Icon and words, never colour alone; nothing without an origin.
 */
export function ArrivaDa({
  origine,
  contenuto,
  lingua = 'it',
}: {
  origine: OrigineRecap
  /** admin only, when the post is linked to a content of the calendar */
  contenuto?: ContenutoCalendario | null
  lingua?: Lingua
}) {
  const t = INSIGHT_RECAP[lingua]
  const post = linkPost(origine.permalink, origine.shortcode)
  // a story reply with no post behind it: one line, nothing to open
  if (origine.tipo === 'storia' && !post) {
    return (
      <p className="flex items-center gap-1.5 text-sm" data-testid="arriva-da">
        <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {t.arrivaDa.storiaSenzaPost}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="arriva-da">
      <p className="flex min-w-0 items-start gap-1.5">
        <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {t.arrivaDaPost(origine)} <span className="text-muted-foreground">· {t.viaOrigine(origine)}</span>
        </span>
      </p>
      {post ? (
        <a
          href={post}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-11 gap-1.5 px-3')}
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          {t.arrivaDa.apriPost}
          <span className="sr-only">{t.instagramNuovaScheda}</span>
        </a>
      ) : null}
      {contenuto ? <NelCalendario contenuto={contenuto} lingua={lingua} /> : null}
    </div>
  )
}

/** «Nel calendario: {Name}»: the content in its panel, in the Marketing area (admin). */
export function NelCalendario({
  contenuto,
  className,
  lingua = 'it',
}: {
  contenuto: ContenutoCalendario
  className?: string
  lingua?: Lingua
}) {
  return (
    <Link
      href={linkContenutoCalendario(contenuto.id)}
      prefetch={false}
      data-testid="nel-calendario"
      className={cn(
        'inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg text-sm underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
    >
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {INSIGHT_RECAP[lingua].arrivaDa.nelCalendario}: {contenuto.nome}
      </span>
    </Link>
  )
}
