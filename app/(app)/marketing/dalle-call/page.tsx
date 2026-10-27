import { LoaderCircle, MessageCircleWarning, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import { LinkBottone } from '@/components/link-bottone'
import { AggiornaMentreAnalizza, CercaFathom } from '@/components/marketing/dalle-call/cerca-fathom'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { getLingua } from '@/lib/i18n/server'
import { DALLE_CALL } from '@/lib/i18n/testi/dalle-call'
import { angoloCategoria, conteggiObiezioni, nomeCategoria, topicDalleCall, type AnalisiPerTopic } from '@/lib/marketing/dalle-call'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const PERIODI = [14, 30, 90] as const

/**
 * «Dalle call» (Dany, 27/10/2026): the objections of the sales calls as topics
 * for the stories. Admin only (the call analyses are the admin's and the
 * closer's, CLAUDE.md section 31): the Marketing area's tab shows only to him.
 * Reads the analyses Claude already made on its own, never asks Claude.
 */
export default async function DalleCallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const lingua = await getLingua()
  const t = DALLE_CALL[lingua]
  const parametro = Number((await searchParams).giorni)
  const giorni = (PERIODI as readonly number[]).includes(parametro) ? parametro : 30
  const oggi = oggiRoma()
  const da = aggiungiGiorni(oggi, -(giorni - 1))
  const supabase = await createClient()

  const dal = `${da}T00:00:00+00:00`
  const [numeri, analisi, inCorso, senza, situazione] = await Promise.all([
    supabase.rpc('call_numeri_periodo', { p_da: da, p_a: oggi, p_per: 'totale' }),
    supabase
      .from('call_analisi')
      .select('obiezioni, spunti_contenuto, calls!inner(programmata_il)')
      .eq('stato', 'pronta')
      .gte('calls.programmata_il', dal)
      .order('analizzata_il', { ascending: false })
      .limit(300),
    supabase
      .from('call_analisi')
      .select('call_id, calls!inner(programmata_il)', { count: 'exact', head: true })
      .in('stato', ['in_coda', 'in_corso'])
      .gte('calls.programmata_il', dal),
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('stato', 'svolta')
      .not('esito', 'is', null)
      .is('link_registrazione', null)
      .gte('programmata_il', dal),
    supabase.rpc('call_lavori_situazione'),
  ])
  if (numeri.error || analisi.error) throw new Error(t.errore)
  const inAnalisi = inCorso.count ?? 0
  const senzaRegistrazione = senza.count ?? 0
  const lavori = (situazione.data ?? {}) as { analisi_attive?: boolean; in_pausa_spesa?: boolean }

  const totale = (numeri.data ?? [])[0]
  const topic = topicDalleCall((analisi.data ?? []) as unknown as AnalisiPerTopic[], conteggiObiezioni(totale?.obiezioni))

  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={lingua === 'en' ? `${t.descrizione} ${t.inItaliano}` : t.descrizione}
      />

      <nav aria-label={t.periodo} className="flex flex-wrap gap-2">
        {PERIODI.map((n) => (
          <Link
            key={n}
            href={`/marketing/dalle-call?giorni=${n}`}
            aria-current={n === giorni ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3.5 text-sm hover:bg-accent',
              n === giorni && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
            )}
          >
            {t.giorni(n)}
          </Link>
        ))}
      </nav>

      <section className="space-y-3 rounded-xl bg-card p-4" aria-label={t.cerca} data-testid="dalle-call-fathom">
        {totale ? (
          <p className="text-sm font-medium" data-testid="dalle-call-riepilogo">
            {t.riepilogo(totale.analizzate ?? 0, totale.svolte ?? 0)}
          </p>
        ) : null}
        {senzaRegistrazione > 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="dalle-call-senza">
            {t.senzaRegistrazione(senzaRegistrazione)}
          </p>
        ) : null}
        {inAnalisi > 0 ? (
          <p className="flex items-center gap-2 text-sm" role="status" data-testid="dalle-call-in-analisi">
            <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            {t.inAnalisi(inAnalisi)}
          </p>
        ) : null}
        {lavori.analisi_attive === false || lavori.in_pausa_spesa ? (
          <p className="flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
            <span>
              {lavori.analisi_attive === false ? t.analisiSpente : t.limiteSpesa}{' '}
              <Link href="/settings/fathom" className="underline underline-offset-2">
                {t.impostazioni}
              </Link>
            </span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <CercaFathom giorni={giorni} />
        </div>
        <p className="text-xs text-muted-foreground">{t.soloLeTue}</p>
        <AggiornaMentreAnalizza attive={inAnalisi > 0} />
      </section>

      {topic.length === 0 ? (
        <StatoVuoto
          Icona={MessageCircleWarning}
          titolo={t.vuoto}
          descrizione={t.vuotoDescrizione}
          azione={inAnalisi > 0 ? undefined : <LinkBottone href="/calls" variant="outline">{t.vaiCall}</LinkBottone>}
        />
      ) : (
        <ol className="space-y-3" data-testid="topic-call">
          {topic.map((tp) => (
            <li key={tp.categoria} className="space-y-3 rounded-xl bg-card p-4" aria-label={nomeCategoria(tp.categoria, lingua)}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="text-base font-semibold">{nomeCategoria(tp.categoria, lingua)}</h2>
                <span className="num text-sm text-muted-foreground">{t.callCon(tp.quante)}</span>
              </div>
              <div className="rounded-lg border-l-4 border-primary bg-muted/40 p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.topic}</p>
                <p className="mt-1 text-sm font-medium">{angoloCategoria(tp.categoria, lingua)}</p>
              </div>
              {tp.esempi.length ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t.cosaDicono}</p>
                  <ul lang="it" className="mt-1 list-disc space-y-1 pl-5 text-sm break-words">
                    {tp.esempi.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {tp.risposta ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t.comeRispondere}</p>
                  <p lang="it" className="mt-1 text-sm break-words">
                    {tp.risposta}
                  </p>
                </div>
              ) : null}
              {tp.idee.length ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t.ideeClaude}</p>
                  <ul className="mt-1 space-y-2">
                    {tp.idee.map((i) => (
                      <li key={i.idea} lang="it" className="text-sm break-words">
                        <span className="font-medium">{i.idea}</span>
                        {i.perche ? <span className="block text-muted-foreground">{i.perche}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
