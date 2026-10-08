import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { ReportForm } from '@/app/(app)/today/report-form'
import { SceltaGiorno } from '@/app/(app)/today/scelta-giorno'
import { LegendaSezione } from '@/components/metriche/legenda-sezione'
import { LinkInsight24h } from '@/components/setting/insight-24h'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, dataReportValida, etichettaGiorno, oggiRoma } from '@/lib/date'
import { LEGENDA_SETTING } from '@/lib/metriche/legenda'
import { createClient } from '@/lib/supabase/server'
import { REPORT_VUOTO, type ValoriReport } from '@/lib/validation/report'

export const dynamic = 'force-dynamic'

// What the form asks, then what is computed from it and from "Nuova call"
const VOCI_LEGENDA = [
  LEGENDA_SETTING.dm_outbound,
  LEGENDA_SETTING.dm_inbound,
  LEGENDA_SETTING.follow_up,
  LEGENDA_SETTING.conversazioni,
  LEGENDA_SETTING.lead_in_target,
  LEGENDA_SETTING.qualita_conversazioni,
  LEGENDA_SETTING.call_proposte,
  LEGENDA_SETTING.discovery_prenotate,
  LEGENDA_SETTING.contenuto_pubblicato,
  LEGENDA_SETTING.dm_totali,
  LEGENDA_SETTING.tasso_conversazione,
  LEGENDA_SETTING.dm_per_call,
  LEGENDA_SETTING.prenotate_inbound,
  LEGENDA_SETTING.prenotate_outbound,
]

function hrefGiorno(data: string, oggi: string) {
  return data === oggi ? '/today' : `/today?data=${data}`
}

export default async function OggiPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>
}) {
  const profilo = await requireRuolo(['setter'])
  const oggi = oggiRoma()
  const data = dataReportValida((await searchParams).data, oggi)

  const supabase = await createClient()
  const { data: report, error } = await supabase
    .from('setter_daily_reports')
    .select(
      'dm_outbound, dm_inbound, conversazioni, call_proposte, discovery_prenotate, discovery_svolte, call_qualificate, strategy_prenotate, follow_up, contenuto_pubblicato, note, lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, created_at, updated_at, dm_totali',
    )
    .eq('setter_id', profilo.id)
    .eq('data', data)
    .maybeSingle()

  if (error) throw new Error('Impossibile caricare il report')

  const iniziale: ValoriReport = report
    ? {
        dm_outbound: report.dm_outbound,
        dm_inbound: report.dm_inbound,
        conversazioni: report.conversazioni,
        call_proposte: report.call_proposte,
        discovery_prenotate: report.discovery_prenotate,
        discovery_svolte: report.discovery_svolte,
        call_qualificate: report.call_qualificate,
        strategy_prenotate: report.strategy_prenotate,
        follow_up: report.follow_up,
        contenuto_pubblicato: report.contenuto_pubblicato,
        note: report.note,
        lead_in_target: report.lead_in_target,
        qualita_conversazioni: report.qualita_conversazioni,
        cosa_frenava: report.cosa_frenava,
        domande_contenuti: report.domande_contenuti,
      }
    : REPORT_VUOTO

  const precedente = aggiungiGiorni(data, -1)
  const successivo = aggiungiGiorni(data, 1)
  const puoiAvanti = successivo <= oggi

  return (
    <div className="max-w-xl">
      <header className="mb-2 flex items-center justify-between gap-2">
        <NavGiorno
          href={hrefGiorno(precedente, oggi)}
          etichetta="Giorno precedente"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </NavGiorno>

        <div className="min-w-0 text-center">
          <h1 className="font-heading text-xl font-semibold">
            {etichettaGiorno(data, oggi)}
          </h1>
          <SceltaGiorno data={data} oggi={oggi} />
        </div>

        <NavGiorno
          href={puoiAvanti ? hrefGiorno(successivo, oggi) : null}
          etichetta="Giorno successivo"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </NavGiorno>
      </header>

      {/* the DM insights of the last 24 hours, in Dany's Claude artifact (08/10/2026) */}
      <div className="mb-4 flex justify-center">
        <LinkInsight24h className="w-full sm:w-auto" />
      </div>

      <ReportForm
        key={data}
        data={data}
        oggi={oggi}
        iniziale={iniziale}
        salvatoAlle={report?.updated_at ?? null}
        dmTotali={report ? report.dm_totali : 0}
        creatoIl={report?.created_at ?? null}
      />

      <div className="mt-6">
        <LegendaSezione voci={VOCI_LEGENDA} />
      </div>
    </div>
  )
}

function NavGiorno({
  href,
  etichetta,
  children,
}: {
  href: string | null
  etichetta: string
  children: React.ReactNode
}) {
  const classi =
    'flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground'

  if (!href) {
    return (
      <span aria-hidden="true" className={`${classi} opacity-30`}>
        {children}
      </span>
    )
  }

  return (
    <Link href={href} aria-label={etichetta} className={`${classi} hover:bg-accent hover:text-foreground`}>
      {children}
    </Link>
  )
}
