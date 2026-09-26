import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { ReportForm } from '@/app/(app)/today/report-form'
import { requireRuolo } from '@/lib/auth/session'
import {
  aggiungiGiorni,
  dataReportValida,
  etichettaGiorno,
  finestraReport,
  oggiRoma,
} from '@/lib/date'
import { formatData } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { REPORT_VUOTO, type ValoriReport } from '@/lib/validation/report'

export const dynamic = 'force-dynamic'

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
  const { minima } = finestraReport(oggi)

  const supabase = await createClient()
  const { data: report, error } = await supabase
    .from('setter_daily_reports')
    .select(
      'dm_outbound, dm_inbound, conversazioni, call_proposte, discovery_prenotate, discovery_svolte, call_qualificate, strategy_prenotate, follow_up, contenuto_pubblicato, note, updated_at',
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
      }
    : REPORT_VUOTO

  const precedente = aggiungiGiorni(data, -1)
  const successivo = aggiungiGiorni(data, 1)
  const puoiIndietro = precedente >= minima
  const puoiAvanti = successivo <= oggi

  return (
    <div className="mx-auto max-w-xl">
      <header className="mb-2 flex items-center justify-between gap-2">
        <NavGiorno
          href={puoiIndietro ? hrefGiorno(precedente, oggi) : null}
          etichetta="Giorno precedente"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </NavGiorno>

        <div className="min-w-0 text-center">
          <h1 className="font-heading text-xl font-semibold">
            {etichettaGiorno(data, oggi)}
          </h1>
          <p className="num text-sm text-muted-foreground">{formatData(data)}</p>
        </div>

        <NavGiorno
          href={puoiAvanti ? hrefGiorno(successivo, oggi) : null}
          etichetta="Giorno successivo"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </NavGiorno>
      </header>

      <ReportForm
        key={data}
        data={data}
        oggi={oggi}
        iniziale={iniziale}
        salvatoAlle={report?.updated_at ?? null}
      />
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
