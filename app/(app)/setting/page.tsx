import { TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'

import { AggiungiReport } from '@/app/(app)/setting/aggiungi-report'
import { ModificaReport } from '@/app/(app)/setting/modifica-report'
import {
  CAMPI_PROPOSTA,
  COLONNE_PROPOSTA,
  PROPOSTE_MAX,
  haNumeri,
  numeriDi,
  type NumeriProposta,
  type PropostaInstagram,
} from '@/app/(app)/today/proposta-instagram'
import { LegendaSezione } from '@/components/metriche/legenda-sezione'
import { EtichettaConNota } from '@/components/metriche/nota'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { CommentiMarketing, type RigaCommento, type RigaMotivo } from '@/components/setting/commenti-marketing'
import { SchedeInsight } from '@/components/insight/schede-insight'
import { ProposteInstagram } from '@/components/setter/proposte-instagram'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formatData, formatNumero, formatPercentuale, formatRapporto } from '@/lib/format'
import { LEGENDA_CLOSER, LEGENDA_SETTING, type VoceLegenda } from '@/lib/metriche/legenda'
import { leggiPeriodo } from '@/lib/periodo'
import { LIMITE_MARKETING } from '@/lib/setting/commento'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type CampoReport =
  | 'dm_outbound'
  | 'dm_inbound'
  | 'follow_up'
  | 'dm_totali'
  | 'conversazioni'
  | 'call_proposte'
  | 'discovery_prenotate'

type Colonna = { campo: CampoReport | 'strategy_prenotate'; voce: VoceLegenda; forte?: true }

// strategy calls are not done with leads (Dany, 29/09/2026): the setter books
// discovery calls. Past days may still carry some, and "Call prenotate" counts
// them: a column of history, shown only when the period has any
const STRATEGY_STORICO: VoceLegenda = LEGENDA_SETTING.strategy_storico

// the setter's report in the order he thinks of it: the DM and their total
// (a database column), then the conversations and the calls
function colonneReport(conStrategy: boolean): Colonna[] {
  const S = LEGENDA_SETTING
  return [
    { campo: 'dm_outbound', voce: S.dm_outbound },
    { campo: 'dm_inbound', voce: S.dm_inbound },
    { campo: 'follow_up', voce: S.follow_up },
    { campo: 'dm_totali', voce: S.dm_totali, forte: true },
    { campo: 'conversazioni', voce: S.conversazioni },
    { campo: 'call_proposte', voce: S.call_proposte },
    { campo: 'discovery_prenotate', voce: S.discovery_prenotate },
    ...(conStrategy ? [{ campo: 'strategy_prenotate', voce: STRATEGY_STORICO } as const] : []),
  ]
}

// DM totali stands out as a band down the table: it is the sum of the three before
const BANDA = 'bg-muted/60'
// the day column stays in view while the table scrolls sideways
const GIORNO = 'sticky left-0 z-10 bg-card px-3 text-left whitespace-nowrap'

/** A short label for a narrow cell: the full name moves into the note. */
function breve(voce: VoceLegenda, etichetta: string): VoceLegenda {
  return { etichetta, spiegazione: `${voce.etichetta}: ${voce.spiegazione}` }
}

/** Header tooltip on a desktop: full name and definition. */
function titolo(voce: VoceLegenda): string {
  return `${voce.etichetta}: ${voce.spiegazione}`
}

/** A zero stays readable but steps back: the days with activity stand out. */
function classeZero(valore: number | null): string | undefined {
  return Number(valore) === 0 ? 'text-muted-foreground' : undefined
}

type MetricheSetter = {
  dm_outbound: number
  dm_inbound: number
  follow_up: number
  dm_totali: number
  conversazioni: number
  tasso_conversazione: number | null
  call_prenotate: number
  prenotate_inbound: number
  prenotate_outbound: number
  tasso_prenotazione: number | null
  dm_per_call: number | null
  call_svolte: number
  show_rate: number | null
  close_rate: number | null
}

/** One number of a setter card; `nota` is a muted line under the value. */
type Cella = { voce: VoceLegenda; valore: string; nota?: string }

/**
 * The two sources of a setter's numbers, never mixed: what he writes in his
 * daily report (the three kinds of DM, their total, the rest) and the calls
 * recorded in the app. `strategy`: the period's strategy calls from the
 * history, already inside "Call prenotate" (giornate_setter, SQL).
 */
function numeriSetter(r: MetricheSetter, strategy: number) {
  const S = LEGENDA_SETTING
  return {
    dm: [
      { voce: S.dm_outbound, valore: formatNumero(r.dm_outbound) },
      { voce: S.dm_inbound, valore: formatNumero(r.dm_inbound) },
      { voce: S.follow_up, valore: formatNumero(r.follow_up) },
    ],
    dmTotali: { voce: S.dm_totali, valore: formatNumero(r.dm_totali) },
    report: [
      { voce: S.conversazioni, valore: formatNumero(r.conversazioni) },
      { voce: breve(S.tasso_conversazione, 'Tasso conv.'), valore: formatPercentuale(r.tasso_conversazione) },
      {
        voce: S.call_prenotate,
        valore: formatNumero(r.call_prenotate),
        nota: strategy > 0 ? `di cui ${formatNumero(strategy)} strategy dallo storico` : undefined,
      },
      { voce: breve(S.tasso_prenotazione, 'Tasso pren.'), valore: formatPercentuale(r.tasso_prenotazione) },
      { voce: breve(S.dm_per_call, 'DM per call'), valore: formatRapporto(r.dm_per_call) },
    ],
    call: [
      { voce: S.prenotate_inbound, valore: formatNumero(r.prenotate_inbound) },
      { voce: S.prenotate_outbound, valore: formatNumero(r.prenotate_outbound) },
      { voce: LEGENDA_CLOSER.call, valore: formatNumero(r.call_svolte) },
      { voce: LEGENDA_CLOSER.show_rate, valore: formatPercentuale(r.show_rate) },
      { voce: LEGENDA_CLOSER.close_rate, valore: formatPercentuale(r.close_rate) },
    ],
  } satisfies Record<string, Cella | Cella[]>
}

function Numero({ cella, className }: { cella: Cella; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      {/* inline: on two lines ("Prenotate da DM outbound") the "i" follows the last word;
          its width sits in the padding, so it never wraps alone onto a line */}
      <dt className="pr-6 text-xs text-muted-foreground">
        <EtichettaConNota voce={cella.voce} className="inline [&>button]:ml-1 [&>button]:-mr-6 [&>button]:align-middle" />
      </dt>
      <dd className="num text-lg font-semibold">{cella.valore}</dd>
      {cella.nota ? (
        <dd className="text-xs text-muted-foreground" data-testid="nota-strategy">
          {cella.nota}
        </dd>
      ) : null}
    </div>
  )
}

function Gruppo({ titolo, fonte, children }: { titolo: string; fonte: string; children: ReactNode }) {
  return (
    <div className="border-t border-border pt-3">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titolo}</h3>
      <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{fonte}</p>
      {children}
    </div>
  )
}

/**
 * A setter's card. Half width next to the others; alone, it takes the row and
 * its numbers spread over six columns. DM totali is the card's big number, the
 * sum under its three parts like on the setter's own page.
 */
function SchedaSetter({ id, r, strategy, largo }: { id: string; r: MetricheSetter & { nome: string }; strategy: number; largo: boolean }) {
  const n = numeriSetter(r, strategy)
  // two columns on a phone and in the half-width card: a label with its "i" never wraps badly
  const griglia = largo ? 'grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 md:grid-cols-6' : 'grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3'
  return (
    <section aria-labelledby={id} className={cn('space-y-4 rounded-xl bg-card p-4', largo && 'md:col-span-2')}>
      <h2 id={id} className="text-sm font-medium">{r.nome}</h2>
      <Gruppo titolo="Dal report" fonte="Quello che il setter scrive ogni giorno nel report.">
        {/* the three kinds of DM, then their sum: under a line, or on its right when the card is wide */}
        <dl className={cn('grid grid-cols-3 gap-3', largo && 'md:grid-cols-6')}>
          {n.dm.map((c) => (
            <Numero key={c.voce.etichetta} cella={c} />
          ))}
          <div
            className={cn(
              'col-span-3 min-w-0 border-t border-border pt-3',
              largo && 'md:border-t-0 md:border-l md:pt-0 md:pl-4',
            )}
          >
            <dt className="text-sm text-muted-foreground">
              <EtichettaConNota voce={n.dmTotali.voce} />
            </dt>
            <dd className="num text-3xl font-semibold tracking-tight" data-testid="dm-totali">
              {n.dmTotali.valore}
            </dd>
          </div>
        </dl>
        <dl className={cn(griglia, 'mt-4 border-t border-border pt-4')}>
          {n.report.map((c) => (
            <Numero key={c.voce.etichetta} cella={c} />
          ))}
        </dl>
      </Gruppo>
      <Gruppo
        titolo="Dalle call"
        fonte="Le call registrate nell’app. Le prenotate da DM inbound e outbound contano il giorno in cui la call è stata fissata; svolte, show rate e close rate il giorno della call."
      >
        {/* items-end: a label on two lines ("Prenotate da DM outbound") keeps the values in a row */}
        <dl className={cn(griglia, 'items-end')}>
          {n.call.map((c) => (
            <Numero key={c.voce.etichetta} cella={c} />
          ))}
        </dl>
      </Gruppo>
    </section>
  )
}

// the page's numbers in reading order: the report, the calls, then the rest of the table
const LEGENDA_PAGINA: VoceLegenda[] = [
  LEGENDA_SETTING.dm_outbound,
  LEGENDA_SETTING.dm_inbound,
  LEGENDA_SETTING.follow_up,
  LEGENDA_SETTING.dm_totali,
  LEGENDA_SETTING.conversazioni,
  LEGENDA_SETTING.tasso_conversazione,
  LEGENDA_SETTING.call_prenotate,
  LEGENDA_SETTING.tasso_prenotazione,
  LEGENDA_SETTING.dm_per_call,
  LEGENDA_SETTING.prenotate_inbound,
  LEGENDA_SETTING.prenotate_outbound,
  LEGENDA_CLOSER.call,
  LEGENDA_CLOSER.show_rate,
  LEGENDA_CLOSER.close_rate,
  LEGENDA_SETTING.call_proposte,
  LEGENDA_SETTING.discovery_prenotate,
  LEGENDA_SETTING.contenuto_pubblicato,
  LEGENDA_SETTING.lead_in_target,
  LEGENDA_SETTING.qualita_conversazioni,
]

/** The section's title: where the focus goes once the last day is decided. */
const ID_DA_APPROVARE = 'titolo-da-approvare'

type PropostaDelSetter = PropostaInstagram & { setter_id: string; setter: { nome: string } | null }

/**
 * The setters' days proposed from the Instagram DMs and still to decide
 * (Dany, 08/10/2026: "Anche tu, con una scheda e la notifica"), with each
 * setter's own numbers of that day where he wrote some (by proposal), for the
 * section on top of the page. A failed read is an error, never "nothing to
 * decide" or "no numbers" (a confirmation would then replace his numbers
 * unseen).
 */
async function daApprovare(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{
  proposte: PropostaInstagram[]
  suoi: Record<string, NumeriProposta>
  totale: number
  errore: boolean
}> {
  const vuoto = { proposte: [], suoi: {}, totale: 0 }
  const { data, count, error } = await supabase
    .from('report_proposte_instagram')
    .select(`${COLONNE_PROPOSTA}, setter_id, setter:profiles!report_proposte_instagram_setter_id_fkey(nome)`, {
      count: 'exact',
    })
    .eq('stato', 'da_confermare')
    .order('data', { ascending: false })
    .order('setter_id')
    .limit(PROPOSTE_MAX)
    .overrideTypes<PropostaDelSetter[], { merge: false }>()
  if (error) return { ...vuoto, errore: true }

  // the most recent day first; on the same day, the setters by name
  const proposte: PropostaInstagram[] = (data ?? [])
    .map(({ setter, ...p }) => ({ ...p, setter_nome: setter?.nome ?? 'Setter' }))
    .sort((a, b) => b.data.localeCompare(a.data) || a.setter_nome.localeCompare(b.setter_nome, 'it'))
  if (proposte.length === 0) return { ...vuoto, totale: count ?? 0, errore: false }

  const righe = data ?? []
  const { data: report, error: erroreReport } = await supabase
    .from('setter_daily_reports')
    .select(['setter_id', 'data', ...CAMPI_PROPOSTA].join(', '))
    .in('setter_id', [...new Set(righe.map((p) => p.setter_id))])
    .in('data', [...new Set(righe.map((p) => p.data))])
    .overrideTypes<(NumeriProposta & { setter_id: string; data: string })[], { merge: false }>()
  if (erroreReport) return { ...vuoto, errore: true }

  const suoi: Record<string, NumeriProposta> = {}
  for (const p of righe) {
    const suo = (report ?? []).find((r) => r.setter_id === p.setter_id && r.data === p.data)
    if (haNumeri(suo)) suoi[p.id] = numeriDi(suo)
  }
  return { proposte, suoi, totale: count ?? proposte.length, errore: false }
}

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

export default async function SettingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const oggi = oggiRoma()
  const parametri = await searchParams
  const periodo = leggiPeriodo(parametri, oggi)
  // the marketing section reads one setter or everyone (?setter=)
  const setterScelto = primo(parametri.setter)
  const setter = isUuid(setterScelto) ? setterScelto : null
  const supabase = await createClient()

  // the most recent LIMITE_MARKETING days and calls with something written: the section says when it cuts
  const filtroSetter = { p_limite: LIMITE_MARKETING, ...(setter ? { p_setter: setter } : {}) }
  const [metriche, report, giornate, persone, commenti, motivi, approvare] = await Promise.all([
    supabase.rpc('metriche_setting', { p_da: periodo.da, p_a: periodo.a }),
    supabase
      .from('setter_daily_reports')
      .select('id, data, dm_outbound, dm_inbound, follow_up, dm_totali, conversazioni, call_proposte, discovery_prenotate, discovery_svolte, call_qualificate, strategy_prenotate, contenuto_pubblicato, note, lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, setter:profiles!setter_daily_reports_setter_id_fkey(nome)')
      .gte('data', periodo.da)
      .lte('data', periodo.a)
      .order('data', { ascending: false }),
    // the table's totals: every setter together (no p_setter), row with data null
    supabase.rpc('giornate_setter', { p_da: periodo.da, p_a: periodo.a }),
    // who can have a day of setting: the setters, and the admin who does it too
    supabase.from('profiles').select('id, nome, ruolo').eq('attivo', true).in('ruolo', ['setter', 'admin']).order('nome'),
    // what the leads say, for marketing: counted and listed in SQL, from the
    // setters' reports and from the closers' reasons for not closing and notes
    supabase.rpc('commenti_setter_periodo', { p_da: periodo.da, p_a: periodo.a, ...filtroSetter }),
    supabase.rpc('motivi_non_chiusura_periodo', { p_da: periodo.da, p_a: periodo.a, ...filtroSetter }),
    // the setters' days from Instagram still to decide: the admin decides them too (08/10/2026)
    daApprovare(supabase),
  ])
  if (metriche.error || report.error || giornate.error || persone.error || commenti.error || motivi.error) {
    throw new Error('Impossibile caricare il setting')
  }

  const aggiungi = (
    <AggiungiReport
      oggi={oggi}
      persone={[...persone.data].sort((a, b) => Number(a.ruolo !== 'setter') - Number(b.ruolo !== 'setter'))}
    />
  )

  const righe = metriche.data ?? []
  const correzione = (r: (typeof report.data)[number]) => (
    <ModificaReport
      data={r.data}
      setter={r.setter?.nome ?? 'Setter'}
      report={{
        id: r.id,
        dm_outbound: r.dm_outbound,
        dm_inbound: r.dm_inbound,
        conversazioni: r.conversazioni,
        call_proposte: r.call_proposte,
        discovery_prenotate: r.discovery_prenotate,
        discovery_svolte: r.discovery_svolte,
        call_qualificate: r.call_qualificate,
        strategy_prenotate: r.strategy_prenotate,
        follow_up: r.follow_up,
        contenuto_pubblicato: r.contenuto_pubblicato,
        note: r.note,
        lead_in_target: r.lead_in_target,
        qualita_conversazioni: r.qualita_conversazioni,
        cosa_frenava: r.cosa_frenava,
        domande_contenuti: r.domande_contenuti,
      }}
    />
  )
  const perSetter = righe.filter((r) => r.setter_id !== null)
  const totale = righe.find((r) => r.setter_id === null)
  const totaleReport = (giornate.data ?? []).find((r) => r.data === null)

  // strategy calls from the history: the column and the "di cui" lines appear
  // only when the period has some; each setter's share is his own total row
  const strategyTotale = Number(totaleReport?.strategy_prenotate ?? 0)
  const strategyPerSetter = new Map<string, number>()
  if (strategyTotale > 0) {
    const perUno = await Promise.all(
      perSetter.map((r) => supabase.rpc('giornate_setter', { p_da: periodo.da, p_a: periodo.a, p_setter: r.setter_id })),
    )
    perUno.forEach((risposta, i) => {
      if (risposta.error) throw new Error('Impossibile caricare il setting')
      const suo = risposta.data.find((g) => g.data === null)
      strategyPerSetter.set(perSetter[i].setter_id, Number(suo?.strategy_prenotate ?? 0))
    })
  }
  const colonne = colonneReport(strategyTotale > 0)
  const legenda = strategyTotale > 0 ? [...LEGENDA_PAGINA, STRATEGY_STORICO] : LEGENDA_PAGINA
  const schede = [...perSetter, ...(perSetter.length > 1 && totale ? [totale] : [])]

  return (
    <div className="space-y-5">
      {/* the recap of the DMs of the last 24 hours is the second tab of Setter (1.38.0) */}
      <SchedeInsight ruolo="admin" attiva="principale" />

      <IntestazionePagina
        titolo="Setter"
        descrizione="Per ogni setter: i numeri del suo report giornaliero e quelli delle call registrate nell’app."
        azione={aggiungi}
      />

      {/* the setters' days from Instagram still to decide, any period: nothing when there is none */}
      <ProposteInstagram
        per="admin"
        proposte={approvare.proposte}
        suoi={approvare.suoi}
        oggi={oggi}
        altre={approvare.totale > approvare.proposte.length}
        errore={approvare.errore}
        idTitoloPagina={ID_DA_APPROVARE}
        totale={approvare.totale}
      />

      <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/setting" parametri={setter ? { setter } : undefined} />

      {perSetter.length === 0 ? (
        <StatoVuoto
          Icona={TrendingUp}
          titolo={`Nessun report ${periodo.frase}`}
          descrizione="I numeri arrivano dalla schermata Oggi del setter, oppure da «Aggiungi giornata»."
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2" data-testid="metriche-setter">
            {schede.map((r) => {
              const id = `setter-${r.setter_id ?? 'totale'}`
              return (
                <SchedaSetter
                  key={id}
                  id={id}
                  r={r}
                  // the total card: every setter's strategy calls together
                  strategy={r.setter_id === null ? strategyTotale : (strategyPerSetter.get(r.setter_id) ?? 0)}
                  largo={schede.length === 1}
                />
              )
            })}
          </div>

          <section className="space-y-2" aria-labelledby="report-giornalieri">
            <h2 id="report-giornalieri" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Report giornalieri ({report.data.length})
            </h2>

            <ul className="space-y-2 md:hidden">
              {report.data.map((r) => (
                <li key={r.id} className="flex items-start gap-2 rounded-xl bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {formatData(r.data)} <span className="font-normal text-muted-foreground">· {r.setter?.nome}</span>
                    </p>
                    {/* raw fields of the report; DM totali is a database column */}
                    <p className="num mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">DM totali {formatNumero(r.dm_totali)}</span> · conv.{' '}
                      {formatNumero(r.conversazioni)} · prenotate {formatNumero(r.discovery_prenotate)}
                      {/* history only: the day's strategy calls, when it has some */}
                      {Number(r.strategy_prenotate) > 0 ? (
                        <>
                          {' '}
                          <span className="whitespace-nowrap">· strategy {formatNumero(r.strategy_prenotate)}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="-mt-1.5 -mr-1.5">{correzione(r)}</div>
                </li>
              ))}
            </ul>

            {/* relative: the hidden labels stay inside the scroll box, the page never scrolls sideways.
                Until the table fits (about 1280px) it scrolls in its card, the day stays pinned on the left */}
            <div className="relative hidden overflow-x-auto rounded-xl bg-card md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Report giornalieri del {periodo.mese ? 'mese' : 'periodo'}</caption>
                <thead className="text-xs leading-tight text-muted-foreground">
                  <tr className="border-b border-border">
                    <th scope="col" className={cn(GIORNO, 'py-2.5 align-bottom font-normal')}>Giorno</th>
                    <th scope="col" className="px-3 py-2.5 text-left align-bottom font-normal">Setter</th>
                    {colonne.map(({ campo, voce, forte }) => (
                      <th
                        key={campo}
                        scope="col"
                        title={titolo(voce)}
                        className={cn(
                          'px-2 py-2.5 text-right align-bottom font-normal',
                          forte && cn(BANDA, 'font-medium text-foreground'),
                        )}
                      >
                        {voce.etichetta}
                      </th>
                    ))}
                    <th
                      scope="col"
                      title={titolo(LEGENDA_SETTING.contenuto_pubblicato)}
                      className="px-3 py-2.5 text-center align-bottom font-normal"
                    >
                      Contenuto
                    </th>
                    <th scope="col" className="w-12 px-1 py-2.5"><span className="sr-only">Correggi</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.data.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className={cn(GIORNO, 'py-2 font-normal')}>{formatData(r.data)}</th>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.setter?.nome}</td>
                      {colonne.map(({ campo, forte }) => (
                        <td
                          key={campo}
                          className={cn('num px-2 py-2 text-right', forte ? cn(BANDA, 'font-semibold') : classeZero(r[campo]))}
                        >
                          {formatNumero(r[campo])}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center">{r.contenuto_pubblicato ? 'Sì' : '–'}</td>
                      <td className="px-1 py-0.5">{correzione(r)}</td>
                    </tr>
                  ))}
                </tbody>
                {totaleReport ? (
                  <tfoot>
                    <tr className="border-t border-border font-medium">
                      <th scope="row" className={cn(GIORNO, 'py-2.5')}>Totale</th>
                      <td className="px-3 py-2.5 text-muted-foreground">Tutti</td>
                      {colonne.map(({ campo, forte }) => (
                        <td key={campo} className={cn('num px-2 py-2.5 text-right', forte && cn(BANDA, 'font-semibold'))}>
                          {formatNumero(totaleReport[campo])}
                        </td>
                      ))}
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </section>

        </>
      )}

      {/* what the leads say: its own empty states, also in a period without reports */}
      <CommentiMarketing
        righe={commenti.data as RigaCommento[]}
        motivi={motivi.data as RigaMotivo[]}
        periodo={periodo.etichetta}
        setter={setter}
        persone={persone.data}
        parametri={periodo.parametri}
      />

      {perSetter.length > 0 ? <LegendaSezione voci={legenda} /> : null}
    </div>
  )
}
