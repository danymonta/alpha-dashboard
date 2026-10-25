import { Sparkles } from 'lucide-react'

import { etichetta } from '@/lib/call/analisi/icp-call'
import type { DallaCallVista } from '@/lib/call/analisi/vista'
import type { Lingua } from '@/lib/i18n/lingua'
import { ANALISI_TESTI, CATEGORIE_CALL } from '@/lib/i18n/testi/analisi-call'

/**
 * «Dalla call» on the card of the call the setter booked (1.37.0, CLAUDE.md section 31): whether the
 * lead was in target, what he knew arriving, what surprised him, on what he stopped (categories,
 * never a figure), and, only for the call's setter, 1-3 suggestions for his own DMs. About the lead
 * and the script, never about the setter as a person; no recording, no transcript, no performance,
 * no price, no health.
 */
export function DallaCall({
  dalla,
  spunti,
  lingua = 'it',
}: {
  dalla: DallaCallVista
  spunti: string[] | null
  lingua?: Lingua
}) {
  const ANALISI = ANALISI_TESTI[lingua]
  const { CATEGORIE_OBIEZIONI, SAPEVA } = CATEGORIE_CALL[lingua]
  const T = ANALISI.dallaCall
  const target = dalla.in_target === 'si' ? T.inTarget : dalla.in_target === 'no' ? T.nonInTarget : T.daVerificare
  const fermato = dalla.obiezioni.map((o) => etichetta(CATEGORIE_OBIEZIONI, o.categoria))
  return (
    <section className="mt-1 space-y-1.5 pl-[4.25rem] text-sm" data-testid="dalla-call" aria-label={T.titolo}>
      <h4 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Sparkles className="size-3.5" aria-hidden="true" />
        {T.titolo}
      </h4>
      <p>{target}</p>
      {dalla.sapeva.length > 0 ? (
        <p>
          <span className="text-muted-foreground">{T.sapeva}:</span> {dalla.sapeva.map((s) => etichetta(SAPEVA, s)).join(', ')}
        </p>
      ) : null}
      {dalla.sorprese.length > 0 ? (
        <p>
          <span className="text-muted-foreground">{T.sorprese}:</span> <span lang="it">{dalla.sorprese.join('; ')}</span>
        </p>
      ) : null}
      {fermato.length > 0 ? (
        <p>
          <span className="text-muted-foreground">{T.sifermato}:</span> {fermato.join(', ').toLowerCase()}
        </p>
      ) : null}
      {spunti && spunti.length > 0 ? (
        <div data-testid="spunti-per-te">
          <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{T.spunti}</h5>
          <ul lang="it" className="mt-0.5 list-disc space-y-0.5 pl-5">
            {spunti.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{T.soloTuoi}</p>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{ANALISI.letta}</p>
    </section>
  )
}
