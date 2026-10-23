import { Sparkles } from 'lucide-react'

import { BottoneAggiornaDati, RigaAggiornamento } from '@/components/insight/aggiorna-dati'
import { SceltaGiorno } from '@/components/insight/scelta-giorno'
import type { Canale } from '@/lib/insight/canale'
import { getLingua } from '@/lib/i18n/server'
import { INSIGHT } from '@/lib/i18n/testi/insight'

/**
 * The Insight's header, as the artifact's: the eyebrow of the tab
 * («Percorso Alpha · Inbox Instagram»), the title with Dany's stars in the
 * flame colour (the one exception to the fire tokens on a data screen,
 * globals.css), the meta line («Aggiornato 08/10, 22:55 · ultime 24 ore»),
 * «Giorno», «Aggiorna dati» (admin and setter, 1.50.0) and the status line under it. On a phone
 * the select and the button go full width under the title.
 */
export async function IntestazioneInsight({
  canale,
  meta,
  giorni,
  giorno,
  conBottone,
}: {
  canale: Canale
  meta: string
  giorni: readonly string[]
  giorno: string | null
  /** «Aggiorna dati» here (with a recap: without one, it is the empty state’s action) */
  conBottone: boolean
}) {
  const lingua = await getLingua()
  const t = INSIGHT[lingua]
  return (
    <header className="border-b border-border pb-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase" data-testid="eyebrow-insight">
            {t.eyebrow[canale]}
          </p>
          <h1 className="flex items-center gap-2 font-heading text-xl font-semibold md:text-2xl">
            <Sparkles className="size-5 shrink-0 text-[var(--brand-fire-flame)]" aria-hidden="true" />
            {t.titolo}
          </h1>
          <p className="num text-sm text-muted-foreground" data-testid="meta-insight">
            {meta}
          </p>
          {lingua === 'en' ? <p className="text-xs text-muted-foreground">{t.inItaliano}</p> : null}
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <SceltaGiorno canale={canale} giorni={giorni} giorno={giorno} />
          {conBottone ? <BottoneAggiornaDati /> : null}
        </div>
      </div>
      <RigaAggiornamento />
    </header>
  )
}
