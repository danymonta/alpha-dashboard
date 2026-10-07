import type { ReactNode } from 'react'

import { LegendaSezione } from '@/components/metriche/legenda-sezione'
import { EtichettaConNota } from '@/components/metriche/nota'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { LinkLegenda } from '@/components/setter/link-legenda'
import { MieGiornate, VOCE_STRATEGY_STORICO, VOCI_GIORNATE } from '@/components/setter/mie-giornate'
import { MieiClienti } from '@/components/setter/miei-clienti'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formatEuro, formatNumero, formatPercentuale, formatRapporto } from '@/lib/format'
import { LEGENDA_CLOSER, LEGENDA_SETTER, LEGENDA_SETTING, type VoceLegenda } from '@/lib/metriche/legenda'
import { leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** The legend at the bottom: the link under the title jumps here. */
const ID_LEGENDA = 'legenda-miei-numeri'

type Voce = {
  id: string
  /** the legend entry: the label gets its "i" */
  etichetta: VoceLegenda
  valore: string
  /** a muted line under the value, e.g. what part of it comes from history */
  nota?: ReactNode
}

/** A label over its value; the "i" says what the number counts. */
function Numero({ id, etichetta, valore, nota }: Voce) {
  return (
    <div>
      <dt className="flex min-h-5 items-center text-xs text-muted-foreground">
        <EtichettaConNota voce={etichetta} />
      </dt>
      <dd className="num text-lg font-semibold" data-testid={`numero-${id}`}>
        {valore}
      </dd>
      {nota ? (
        <dd className="text-xs text-muted-foreground" data-testid={`nota-${id}`}>
          {nota}
        </dd>
      ) : null}
    </div>
  )
}

function Numeri({ voci }: { voci: Voce[] }) {
  return voci.map((v) => <Numero key={v.id} {...v} />)
}

/** A small caption inside a block: which day the numbers below are counted on. */
function Sottogruppo({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</p>
}

/**
 * One source of numbers: the setter's report or the calls in the app. The
 * subtitle names the source, so two numbers with similar names never look
 * like the same one counted twice.
 */
function Blocco({
  id,
  titolo,
  fonte,
  spiegazione,
  children,
}: {
  id: string
  titolo: string
  fonte: string
  spiegazione: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`titolo-${id}`} className="rounded-xl bg-card p-4" data-testid={id}>
      <div className="mb-4">
        <h2 id={`titolo-${id}`} className="text-sm font-medium">
          {titolo}
        </h2>
        <p className="text-xs text-muted-foreground" data-testid="fonte">
          <span className="font-medium text-foreground">{fonte}</span>: {spiegazione}
        </p>
      </div>
      {children}
    </section>
  )
}

/** Legend entries in order, once each: the cards and the tables share some. */
function uniche(voci: VoceLegenda[]): VoceLegenda[] {
  return [...new Set(voci)]
}

export default async function IMieiNumeriPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['setter'])
  const oggi = oggiRoma()
  const periodo = leggiPeriodo(await searchParams, oggi)
  const supabase = await createClient()

  // security definer, filtered on the caller: only this setter's totals and sales
  const [{ data: n, error }, clienti, giornate] = await Promise.all([
    supabase.rpc('miei_numeri_periodo', { p_da: periodo.da, p_a: periodo.a }).single(),
    supabase.rpc('mie_vendite_setter'),
    supabase.rpc('giornate_setter', { p_da: periodo.da, p_a: periodo.a }),
  ])
  if (error || !n || clienti.error || giornate.error) throw new Error('Impossibile caricare i tuoi numeri')

  const S = LEGENDA_SETTING
  const C = LEGENDA_CLOSER
  const M = LEGENDA_SETTER

  // Strategy calls are history (the setter books discovery calls), but old
  // reports may hold some: "Call prenotate" counts them, so say how many. The
  // number is the total row of giornate_setter (data null), from SQL.
  const strategyStorico = Number(giornate.data?.find((r) => !r.data)?.strategy_prenotate ?? 0)

  // Source 1, his report. Dany: "DM inbound, DM outbound, follow up e poi il totalone"
  const dm: Voce[] = [
    { id: 'dm_outbound', etichetta: S.dm_outbound, valore: formatNumero(n.dm_outbound) },
    { id: 'dm_inbound', etichetta: S.dm_inbound, valore: formatNumero(n.dm_inbound) },
    { id: 'follow_up', etichetta: S.follow_up, valore: formatNumero(n.follow_up) },
  ]
  const report: Voce[] = [
    { id: 'conversazioni', etichetta: S.conversazioni, valore: formatNumero(n.conversazioni) },
    { id: 'tasso_conversazione', etichetta: S.tasso_conversazione, valore: formatPercentuale(n.tasso_conversazione) },
    { id: 'call_proposte', etichetta: S.call_proposte, valore: formatNumero(n.call_proposte) },
    {
      id: 'call_prenotate',
      etichetta: S.call_prenotate,
      valore: formatNumero(n.call_prenotate),
      nota:
        strategyStorico > 0 ? (
          <>
            di cui <span className="num">{formatNumero(strategyStorico)}</span> strategy dallo storico
          </>
        ) : null,
    },
    { id: 'tasso_prenotazione', etichetta: S.tasso_prenotazione, valore: formatPercentuale(n.tasso_prenotazione) },
    { id: 'dm_per_call', etichetta: S.dm_per_call, valore: formatRapporto(n.dm_per_call) },
  ]
  // Source 2, the calls in the app: bookings by the day they were booked (not a
  // split of "Call prenotate", which he writes in his report)...
  const prenotazioni: Voce[] = [
    { id: 'prenotate_inbound', etichetta: S.prenotate_inbound, valore: formatNumero(n.prenotate_inbound) },
    { id: 'prenotate_outbound', etichetta: S.prenotate_outbound, valore: formatNumero(n.prenotate_outbound) },
  ]
  // ...and how they went, by the day of the call (miei_numeri_periodo)
  const agenda: Voce[] = [
    { id: 'call_fissate', etichetta: M.call_fissate, valore: formatNumero(n.call_fissate) },
    { id: 'call_svolte', etichetta: C.call, valore: formatNumero(n.call_svolte) },
    { id: 'no_show', etichetta: C.no_show, valore: formatNumero(n.no_show) },
    { id: 'show_rate', etichetta: C.show_rate, valore: formatPercentuale(n.show_rate) },
    { id: 'chiuse', etichetta: C.chiuse, valore: formatNumero(n.chiuse) },
    { id: 'close_rate', etichetta: C.close_rate, valore: formatPercentuale(n.close_rate) },
  ]
  const legenda = uniche([
    ...dm.map((v) => v.etichetta),
    S.dm_totali,
    ...report.map((v) => v.etichetta),
    ...VOCI_GIORNATE.report,
    ...(strategyStorico > 0 ? [VOCE_STRATEGY_STORICO] : []),
    ...prenotazioni.map((v) => v.etichetta),
    ...agenda.map((v) => v.etichetta),
    ...VOCI_GIORNATE.call,
  ])

  return (
    <div className="space-y-5">
      {/* the day-by-day tables are wide like the Excel: only they leave the narrow column */}
      <div className="max-w-2xl space-y-5">
        <IntestazionePagina
          titolo="I miei numeri"
          descrizione={
            <>
              Le tue metriche del periodo e le tue provvigioni.
              <span className="mt-1.5 block">
                <LinkLegenda idLegenda={ID_LEGENDA} />
              </span>
            </>
          }
        />
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/my-numbers" />

        <section className="rounded-xl bg-card p-4" data-testid="mie-provvigioni">
          <p className="text-sm text-muted-foreground">Provvigioni maturate {periodo.frase}</p>
          <p className="text-5xl font-semibold tracking-tight text-gold">{formatEuro(n.provvigioni_maturate)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {/* payouts refer to a month: a range counts every month it touches (miei_numeri_periodo) */}
            {periodo.mese ? 'Pagate per questo mese' : 'Pagate per i mesi del periodo'}:{' '}
            <span className="num text-foreground">{formatEuro(n.provvigioni_pagate)}</span>
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Maturano quando il cliente paga, non alla firma: contano anche le rate pagate nei mesi dopo, e i rinnovi solo se la tua
            regola provvigionale li prevede. Il dettaglio per cliente:{' '}
            {/* an inline link: its touch area grows to 44px without moving the text */}
            <a
              href="#titolo-miei-clienti"
              className="relative rounded-sm text-foreground underline underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-[''] hover:text-foreground/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              vedi i tuoi clienti
            </a>
            .
          </p>
        </section>

        <Blocco
          id="miei-numeri-setting"
          titolo="Setting"
          fonte="Dal tuo report"
          spiegazione="i numeri che scrivi ogni giorno in «Oggi»."
        >
          {/* the three kinds of DM, then their sum under a line, like a column addition */}
          <dl className="grid grid-cols-3 gap-3">
            <Numeri voci={dm} />
            <div className="col-span-3 border-t border-border pt-3">
              <dt className="flex min-h-5 items-center text-sm text-muted-foreground">
                <EtichettaConNota voce={S.dm_totali} />
              </dt>
              <dd className="num text-3xl font-semibold tracking-tight" data-testid="numero-dm_totali">
                {formatNumero(n.dm_totali)}
              </dd>
            </div>
          </dl>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <Numeri voci={report} />
          </dl>
        </Blocco>

        <Blocco
          id="miei-numeri-call"
          titolo="Le tue call"
          fonte="Dalle call in agenda"
          spiegazione="per giorno di prenotazione quelle che hai fissato con «Nuova call»; per giorno della call tutte quelle col tuo nome, anche le call di follow-up che fissa il closer, con l’esito registrato dal closer. Non si compilano a mano."
        >
          <Sottogruppo>Per giorno di prenotazione</Sottogruppo>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Numeri voci={prenotazioni} />
          </dl>
          <div className="mt-4 border-t border-border pt-4">
            <Sottogruppo>Per giorno della call</Sottogruppo>
            <dl className="grid grid-cols-3 gap-3">
              <Numeri voci={agenda} />
            </dl>
          </div>
        </Blocco>
      </div>

      {/* security definer, filtered on the caller: his report, his calls, his clients */}
      <MieGiornate righe={giornate.data ?? []} />

      <div className="max-w-2xl space-y-5">
        <MieiClienti righe={clienti.data ?? []} />
        {/* clear of the phone's top bar when the link at the top jumps here */}
        <div id={ID_LEGENDA} className="scroll-mt-24">
          <LegendaSezione voci={legenda} />
        </div>
      </div>
    </div>
  )
}
