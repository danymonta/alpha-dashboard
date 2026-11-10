import { CalendarX2, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import { AnnunciProvider } from '@/components/insight/annunci'
import { FattiProvider } from '@/components/insight/fatti'
import { ListaCalendly } from '@/components/setter/lista-calendly'
import { linkSenzaPrenotazione, type LinkSenzaPrenotazione } from '@/lib/insight/calendly'
import type { Fonte } from '@/lib/insight/canale'
import { leggiRecap } from '@/lib/insight/recap'
import { getFormato, getLingua } from '@/lib/i18n/server'
import { CALENDLY } from '@/lib/i18n/testi/calendly'
import { createClient } from '@/lib/supabase/server'

/** The most a channel shows here: the rest stays in the Insight. */
const MAX_PER_CANALE = 15

type Blocco = { fonte: Fonte; giorno: string; righe: LinkSenzaPrenotazione[]; altri: number; fatti: string[] }

/**
 * «Calendly mandato, call non prenotata» in Oggi (1.75.0, Dany, 10/11/2026):
 * from the latest recap of each channel, the leads that got the link and did
 * not book, with the follow-up the Insight suggests and its «Fatto». Read with
 * the setter's session (insight_recap, insight_fatto: RLS), never more than
 * the Insight shows him. Nothing to show: nothing on the page.
 */
export async function CalendlySenzaPrenotazione({ oggi }: { oggi: string }) {
  const lingua = await getLingua()
  const t = CALENDLY[lingua]
  const { formatData } = await getFormato()
  const supabase = await createClient()

  const blocchi: Blocco[] = []
  let errore = false
  for (const fonte of ['instagram', 'messenger'] as const) {
    const { data: riga, error } = await supabase
      .from('insight_recap')
      .select('giorno, dati')
      .eq('canale', fonte)
      .order('giorno', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      errore = true
      continue
    }
    const recap = riga ? leggiRecap(riga.dati) : null
    if (!riga || !recap) continue
    const tutte = linkSenzaPrenotazione(recap, oggi)
    if (tutte.length === 0) continue
    const { data: fatti } = await supabase
      .from('insight_fatto')
      .select('chiave')
      .eq('giorno', riga.giorno)
      .eq('canale', fonte)
      .eq('fatto', true)
    blocchi.push({
      fonte,
      giorno: riga.giorno,
      righe: tutte.slice(0, MAX_PER_CANALE),
      altri: Math.max(0, tutte.length - MAX_PER_CANALE),
      fatti: (fatti ?? []).map((f) => f.chiave),
    })
  }

  if (blocchi.length === 0) {
    return errore ? (
      <p className="mb-4 flex items-start gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
        {t.errore}
      </p>
    ) : null
  }

  return (
    <section aria-labelledby="calendly-titolo" className="mb-6 space-y-3" data-testid="calendly-senza-prenotazione">
      <div>
        <h2 id="calendly-titolo" className="flex items-center gap-2 font-heading text-base font-semibold">
          <CalendarX2 className="size-4 text-status-warning" aria-hidden="true" />
          {t.titolo}
          <span className="num rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {blocchi.reduce((n, b) => n + b.righe.length + b.altri, 0)}
          </span>
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t.descrizione}</p>
      </div>
      <AnnunciProvider>
        {blocchi.map((b) => (
          <div key={b.fonte} className="space-y-2">
            {blocchi.length > 1 ? (
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t.canali[b.fonte]} · {t.da(formatData(b.giorno))}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t.da(formatData(b.giorno))}</p>
            )}
            <FattiProvider fonte={b.fonte} giorno={b.giorno} iniziali={b.fatti}>
              <ListaCalendly fonte={b.fonte} righe={b.righe} />
            </FattiProvider>
            {b.altri > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t.altri(b.altri)}{' '}
                <Link href={`/insight?canale=${b.fonte}`} className="underline underline-offset-4">
                  {t.apriInsight}
                </Link>
              </p>
            ) : null}
          </div>
        ))}
      </AnnunciProvider>
    </section>
  )
}
