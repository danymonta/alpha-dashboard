'use client'

import Link from 'next/link'
import type { KeyboardEvent } from 'react'

import { IndicatoreLink } from '@/components/shell/link-riga'
import { CANALI, cookieCanale, hrefInsight, ID_PANNELLO_INSIGHT, idScheda, type Canale } from '@/lib/insight/canale'
import { BADGE_AGENDA, CANALE_ARIA, SCHEDE } from '@/lib/insight/parole'
import { cn } from '@/lib/utils'

/** Never in the way: without cookies the tab still works through the address. */
function ricorda(canale: Canale) {
  try {
    document.cookie = cookieCanale(canale, window.location.protocol === 'https:')
  } catch {
    // cookies blocked: nothing remembered
  }
}

/**
 * Instagram | Messenger | Agenda, as the artifact's tabs: a tablist named
 * «Canale», the arrow keys (and Home, End) move to the next tab and open it,
 * the Agenda tab counts today's calls of the newest Instagram recap. Each tab
 * is a link (?canale=…, the newest recap of that tab: the day starts again),
 * so it opens in another tab of the browser too; the tap also remembers the
 * tab in a cookie of this browser, before the navigation leaves: /insight
 * without ?canale opens the tab chosen last (the artifact's localStorage).
 */
export function SchedeCanale({ canale, callOggi }: { canale: Canale; callOggi: number }) {
  function tastiera(e: KeyboardEvent<HTMLAnchorElement>, attuale: Canale) {
    const i = CANALI.indexOf(attuale)
    const prossimo =
      e.key === 'ArrowRight'
        ? CANALI[(i + 1) % CANALI.length]
        : e.key === 'ArrowLeft'
          ? CANALI[(i + CANALI.length - 1) % CANALI.length]
          : e.key === 'Home'
            ? CANALI[0]
            : e.key === 'End'
              ? CANALI[CANALI.length - 1]
              : null
    if (!prossimo) return
    e.preventDefault()
    const scheda = document.getElementById(idScheda(prossimo))
    scheda?.focus()
    // the artifact opened the tab with the arrow: the same, through the link
    if (prossimo !== canale) scheda?.click()
  }

  return (
    // the line under the tabs is a shadow, not a border the tabs overlap: on a very narrow
    // screen the row scrolls sideways without a 1 px vertical scroll
    <div role="tablist" aria-label={CANALE_ARIA} className="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)]">
      {CANALI.map((c) => {
        const attiva = c === canale
        return (
          <Link
            key={c}
            id={idScheda(c)}
            role="tab"
            href={hrefInsight(c)}
            replace
            scroll={false}
            aria-selected={attiva}
            aria-controls={ID_PANNELLO_INSIGHT}
            tabIndex={attiva ? 0 : -1}
            onClick={() => ricorda(c)}
            onKeyDown={(e) => tastiera(e, c)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset focus-visible:outline-none sm:px-4',
              attiva
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {SCHEDE[c]}
            {c === 'agenda' && callOggi > 0 ? (
              <>
                <span className="num rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground" data-testid="badge-agenda">
                  {callOggi}
                </span>
                <span className="sr-only">{BADGE_AGENDA}</span>
              </>
            ) : null}
            {/* the tab's recap is on its way: a spinner after 120 ms */}
            <IndicatoreLink />
          </Link>
        )
      })}
    </div>
  )
}
