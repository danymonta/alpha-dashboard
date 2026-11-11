import { CalendarCheck, CalendarX2, MessagesSquare, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { quando } from '@/app/(app)/settings/instagram/quando'
import { AggiornaCalendario } from '@/components/calendario/aggiorna-calendario'
import { CopiaRiepilogo } from '@/components/calendario/copia-riepilogo'
import { SchedeInsight } from '@/components/insight/schede-insight'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { DeltaKpi } from '@/components/panoramica/tile-kpi'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { etichettaGiornoBreveIn } from '@/lib/i18n/date'
import { getLingua } from '@/lib/i18n/server'
import { CONTATTI, traduciErroreCalendario } from '@/lib/i18n/testi/contatti'
import { leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/** What setting_contatti answers (20261107090000): counts and ratios from SQL, formatted here. */
type Valori = {
  dm_outbound: number
  dm_inbound: number
  follow_up: number
  dm_totali: number
  conversazioni: number
  call_proposte: number
  prenotate: number
  prenotate_dal_calendario: number
  in_target: number
  senza_dati: number
  giorni_calendario: number
  in_agenda: number
  cancellate: number
  svolte: number
  no_show: number
  chiuse: number
  tasso_conversazione: number | null
  dm_per_prenotata: number | null
  conversazioni_per_prenotata: number | null
  prenotate_su_proposte: number | null
  quota_in_target: number | null
  dm_per_in_target: number | null
  show_rate: number | null
  close_rate: number | null
  chiuse_su_prenotate: number | null
}
type Giorno = {
  giorno: string
  dm_outbound: number
  dm_inbound: number
  follow_up: number
  conversazioni: number
  call_proposte: number
  prenotate: number
  in_target: number | null
  da_calendario: boolean
  svolte: number
  chiuse: number
}
type Risposta = {
  valori: Valori
  delta: Record<string, number | null>
  giorni: Giorno[]
  calendario: {
    collegato: boolean
    dal: string | null
    ultimo_sync_il: string | null
    ultimo_esito: 'ok' | 'fallito' | null
    ultimo_errore: string | null
    eventi_letti: number | null
  } | null
}

/** A count of the funnel: the value, what is under it, the change against the period before. */
async function Numero({
  etichetta,
  valore,
  delta,
  confronto,
  oro = false,
  children,
}: {
  etichetta: string
  valore: string
  delta: number | null | undefined
  confronto: string
  oro?: boolean
  children?: ReactNode
}) {
  return (
    <div className={cn('rounded-xl bg-card p-4', oro && 'ring-1 ring-gold/30')}>
      <p className="text-sm text-muted-foreground">{etichetta}</p>
      <p className={cn('num mt-1 font-semibold tracking-tight', oro ? 'glow-oro text-4xl text-gold' : 'text-3xl')}>{valore}</p>
      {children ? <div className="mt-1 text-xs text-muted-foreground">{children}</div> : null}
      <DeltaKpi delta={delta ?? null} confronto={confronto} className="mt-2" />
    </div>
  )
}

function Rapporto({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-sm text-muted-foreground">{etichetta}</dt>
      <dd className="num text-right text-base font-semibold">{valore}</dd>
    </div>
  )
}

export default async function ContattiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const oggi = oggiRoma()
  const parametri = await searchParams
  const lingua = await getLingua()
  const t = CONTATTI[lingua]
  const { formatNumero, formatPercentuale, formatRapporto, formatData } = formato(lingua)
  const periodo = leggiPeriodo(parametri, oggi, lingua)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('setting_contatti', { p_da: periodo.da, p_a: periodo.a })
  if (error || !data) throw new Error(t.errore)
  const r = data as unknown as Risposta
  const v = r.valori
  const cal = r.calendario

  // the funnel, from the DMs to the closed calls: each step against the one before (ratios from SQL where
  // they are ratios of the page; the bar widths are only a drawing of the counts)
  const fasi: { fase: string; valore: number }[] = [
    { fase: t.dmTotali, valore: v.dm_totali },
    { fase: t.conversazioni, valore: v.conversazioni },
    { fase: t.callProposte, valore: v.call_proposte },
    { fase: t.prenotate, valore: v.prenotate },
    { fase: t.inTarget, valore: v.in_target },
    { fase: t.svolte, valore: v.svolte },
    { fase: t.chiuse, valore: v.chiuse },
  ]
  const massimo = Math.max(1, ...fasi.map((f) => f.valore))
  const passaggi: (number | null)[] = [
    null,
    v.tasso_conversazione,
    null,
    v.prenotate_su_proposte,
    v.quota_in_target,
    null,
    v.close_rate,
  ]
  const giorniAttivi = r.giorni.filter(
    (g) => g.dm_outbound + g.dm_inbound + g.follow_up + g.conversazioni + g.call_proposte + g.prenotate + g.svolte + g.chiuse > 0,
  )

  const riepilogo = t.riepilogo({
    periodo: periodo.etichetta,
    dm: formatNumero(v.dm_totali),
    out: formatNumero(v.dm_outbound),
    inb: formatNumero(v.dm_inbound),
    fup: formatNumero(v.follow_up),
    conv: formatNumero(v.conversazioni),
    proposte: formatNumero(v.call_proposte),
    prenotate: formatNumero(v.prenotate),
    target: formatNumero(v.in_target),
    quota: formatPercentuale(v.quota_in_target),
    svolte: formatNumero(v.svolte),
    chiuse: formatNumero(v.chiuse),
    dmPerCall: formatRapporto(v.dm_per_prenotata),
  })

  return (
    <div className="space-y-6">
      <SchedeInsight ruolo="admin" attiva="contatti" />
      <IntestazionePagina titolo={t.titolo} descrizione={t.descrizione} azione={<AggiornaCalendario collegato={cal?.collegato === true} />} />

      {/* where the booked calls come from: the calendar, or the setter's reports */}
      <div className="space-y-1 text-sm" data-testid="stato-calendario">
        {!cal?.collegato ? (
          <p className="flex items-start gap-2 text-muted-foreground">
            <CalendarX2 className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
            <span>
              {t.calendarioNonCollegato}{' '}
              <Link href="/settings/chiavi#calendario" className="underline underline-offset-4 hover:text-foreground">
                {t.collegaQui}
              </Link>
            </span>
          </p>
        ) : cal.ultimo_esito === 'fallito' ? (
          <p role="alert" className="flex items-start gap-2 text-status-critical">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {t.calendarioErrore}: {traduciErroreCalendario(cal.ultimo_errore ?? '', lingua)}
            </span>
          </p>
        ) : cal.ultimo_sync_il ? (
          <p className="flex items-start gap-2 text-muted-foreground">
            <CalendarCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
            {t.calendarioLetto(quando(cal.ultimo_sync_il, oggi, lingua), cal.eventi_letti ?? 0)}
          </p>
        ) : (
          <p className="flex items-start gap-2 text-muted-foreground">
            <CalendarX2 className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
            {t.calendarioMai}
          </p>
        )}
        {cal?.dal && cal.dal > periodo.da ? <p className="pl-6 text-xs text-muted-foreground">{t.dalCalendario(formatData(cal.dal))}</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/setting/contatti" />
        <CopiaRiepilogo testo={riepilogo} />
      </div>

      <section aria-labelledby="contatti-funnel" className="space-y-3">
        <h2 id="contatti-funnel" className="text-sm font-medium">
          {t.sezioneFunnel}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="contatti-numeri">
          <Numero etichetta={t.dmTotali} valore={formatNumero(v.dm_totali)} delta={r.delta.dm_totali} confronto={periodo.confronto}>
            {t.dettaglioDm(formatNumero(v.dm_outbound), formatNumero(v.dm_inbound), formatNumero(v.follow_up))}
          </Numero>
          <Numero etichetta={t.conversazioni} valore={formatNumero(v.conversazioni)} delta={r.delta.conversazioni} confronto={periodo.confronto} />
          <Numero etichetta={t.callProposte} valore={formatNumero(v.call_proposte)} delta={r.delta.call_proposte} confronto={periodo.confronto} />
          <Numero etichetta={t.prenotate} valore={formatNumero(v.prenotate)} delta={r.delta.prenotate} confronto={periodo.confronto} oro>
            {[t.cancellate(v.cancellate), t.inAgenda(v.in_agenda)].join(' · ')}
          </Numero>
          <Numero etichetta={t.inTarget} valore={formatNumero(v.in_target)} delta={r.delta.in_target} confronto={periodo.confronto}>
            {t.inTargetNota}
            {v.senza_dati > 0 ? ` · ${t.senzaDati(v.senza_dati)}` : ''}
          </Numero>
          <Numero etichetta={t.svolte} valore={formatNumero(v.svolte)} delta={r.delta.svolte} confronto={periodo.confronto}>
            {t.dalleCallApp}
          </Numero>
          <Numero etichetta={t.chiuse} valore={formatNumero(v.chiuse)} delta={r.delta.chiuse} confronto={periodo.confronto}>
            {t.dalleCallApp}
          </Numero>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="contatti-rapporti" className="rounded-xl bg-card p-4">
          <h2 id="contatti-rapporti" className="text-sm font-medium">
            {t.sezioneRapporti}
          </h2>
          <dl className="mt-2 divide-y divide-border">
            <Rapporto etichetta={t.tassoConversazione} valore={formatPercentuale(v.tasso_conversazione)} />
            <Rapporto etichetta={t.dmPerPrenotata} valore={formatRapporto(v.dm_per_prenotata)} />
            <Rapporto etichetta={t.convPerPrenotata} valore={formatRapporto(v.conversazioni_per_prenotata)} />
            <Rapporto etichetta={t.prenotateSuProposte} valore={formatPercentuale(v.prenotate_su_proposte)} />
            <Rapporto etichetta={t.quotaInTarget} valore={formatPercentuale(v.quota_in_target)} />
            <Rapporto etichetta={t.dmPerInTarget} valore={formatRapporto(v.dm_per_in_target)} />
            <Rapporto etichetta={t.showRate} valore={formatPercentuale(v.show_rate)} />
            <Rapporto etichetta={t.closeRate} valore={formatPercentuale(v.close_rate)} />
            <Rapporto etichetta={t.chiuseSuPrenotate} valore={formatPercentuale(v.chiuse_su_prenotate)} />
          </dl>
        </section>

        <section aria-labelledby="contatti-imbuto" className="rounded-xl bg-card p-4">
          <h2 id="contatti-imbuto" className="text-sm font-medium">
            {t.funnel}
          </h2>
          <ol className="mt-3 space-y-2.5" aria-hidden="true">
            {fasi.map((f, i) => (
              <li key={f.fase} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{f.fase}</span>
                  <span className="num font-semibold">
                    {formatNumero(f.valore)}
                    {passaggi[i] !== null ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{formatPercentuale(passaggi[i])}</span>
                    ) : null}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.max(f.valore > 0 ? 2 : 0, (f.valore / massimo) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
          {/* the same funnel as a table, for screen readers */}
          <table className="sr-only">
            <caption>{t.funnelTabella}</caption>
            <thead>
              <tr>
                <th scope="col">{t.fase}</th>
                <th scope="col">{t.valore}</th>
                <th scope="col">{t.passaggio}</th>
              </tr>
            </thead>
            <tbody>
              {fasi.map((f, i) => (
                <tr key={f.fase}>
                  <th scope="row">{f.fase}</th>
                  <td>{formatNumero(f.valore)}</td>
                  <td>{passaggi[i] !== null ? formatPercentuale(passaggi[i]) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section aria-labelledby="contatti-giorni" className="space-y-3">
        <h2 id="contatti-giorni" className="text-sm font-medium">
          {t.sezioneGiorni}
        </h2>
        {giorniAttivi.length === 0 ? (
          <StatoVuoto Icona={MessagesSquare} titolo={t.nessunGiorno} descrizione={t.nessunGiornoDescrizione} />
        ) : (
          <div className="overflow-x-auto rounded-xl bg-card" data-testid="contatti-giorni">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="sticky left-0 bg-card px-3 py-2 text-left font-medium">
                    {t.giorno}
                  </th>
                  {[t.dmOut, t.dmIn, t.followUp, t.conv, t.proposte, t.pren, t.target, t.svolteBreve, t.chiuseBreve].map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 text-right font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {giorniAttivi.map((g) => (
                  <tr key={g.giorno} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left font-normal whitespace-nowrap">
                      {etichettaGiornoBreveIn(g.giorno, oggi, lingua)}
                    </th>
                    {[g.dm_outbound, g.dm_inbound, g.follow_up, g.conversazioni, g.call_proposte].map((n, i) => (
                      <td key={i} className="num px-3 py-2 text-right">
                        {formatNumero(n)}
                      </td>
                    ))}
                    <td className="num px-3 py-2 text-right font-semibold">
                      {formatNumero(g.prenotate)}
                      {!g.da_calendario && g.prenotate > 0 ? (
                        <span className="block text-[11px] font-normal text-muted-foreground">{t.nonDalCalendario}</span>
                      ) : null}
                    </td>
                    <td className="num px-3 py-2 text-right">{g.in_target === null ? '–' : formatNumero(g.in_target)}</td>
                    <td className="num px-3 py-2 text-right">{formatNumero(g.svolte)}</td>
                    <td className="num px-3 py-2 text-right">{formatNumero(g.chiuse)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left">
                    {t.totale}
                  </th>
                  {[v.dm_outbound, v.dm_inbound, v.follow_up, v.conversazioni, v.call_proposte, v.prenotate, v.in_target, v.svolte, v.chiuse].map(
                    (n, i) => (
                      <td key={i} className="num px-3 py-2 text-right">
                        {formatNumero(n)}
                      </td>
                    ),
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
