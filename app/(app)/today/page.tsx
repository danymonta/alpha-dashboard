import { ChevronLeft, ChevronRight, UserCheck } from 'lucide-react'
import Link from 'next/link'

import {
  CAMPI_PROPOSTA,
  COLONNE_PROPOSTA,
  PROPOSTE_MAX,
  firmaProposte,
  haNumeri,
  numeriDi,
  risposteDi,
  type NumeriProposta,
  type PropostaInstagram,
  type RisposteCommento,
} from '@/app/(app)/today/proposta-instagram'
import { ReportForm } from '@/app/(app)/today/report-form'
import { SceltaGiorno } from '@/app/(app)/today/scelta-giorno'
import { LegendaSezione } from '@/components/metriche/legenda-sezione'
import { GiorniSenzaCommento } from '@/components/setter/giorni-senza-commento'
import { ProposteInstagram } from '@/components/setter/proposte-instagram'
import { SchedeInsight } from '@/components/insight/schede-insight'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, dataReportValida, oggiRoma } from '@/lib/date'
import { etichettaGiornoIn } from '@/lib/i18n/date'
import { getLingua } from '@/lib/i18n/server'
import { OGGI } from '@/lib/i18n/testi/oggi'
import { decisaDaUnAltroIn } from '@/lib/i18n/testi/proposte'
import type { Lingua } from '@/lib/i18n/lingua'
import { legende } from '@/lib/metriche/legenda-en'
import { giorniSenzaCommento } from '@/lib/setting/commenti-mancanti'
import { createClient } from '@/lib/supabase/server'
import { REPORT_VUOTO, valoriDaRiga, type ValoriReport } from '@/lib/validation/report'

export const dynamic = 'force-dynamic'

// What the form asks, then what is computed from it and from "Nuova call"
function vociLegenda(lingua: Lingua) {
  const LEGENDA_SETTING = legende(lingua).setting
  return [
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
}

/** The page title: where the focus goes once the last proposal is decided. */
const ID_TITOLO = 'titolo-giorno'

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
  const lingua = await getLingua()
  const t = OGGI[lingua]

  const supabase = await createClient()
  const [{ data: report, error }, proposte, decisaDelGiorno, senzaCommento] = await Promise.all([
    supabase
      .from('setter_daily_reports')
      .select(
        'dm_outbound, dm_inbound, conversazioni, call_proposte, discovery_prenotate, discovery_svolte, call_qualificate, strategy_prenotate, follow_up, contenuto_pubblicato, note, lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, created_at, updated_at, dm_totali',
      )
      .eq('setter_id', profilo.id)
      .eq('data', data)
      .maybeSingle(),
    // the proposals from the Instagram DMs still to decide (Dany, 08/10/2026): only his, by RLS too
    supabase
      .from('report_proposte_instagram')
      .select(COLONNE_PROPOSTA)
      .eq('setter_id', profilo.id)
      .eq('stato', 'da_confermare')
      .order('data', { ascending: false })
      .limit(PROPOSTE_MAX + 1)
      .overrideTypes<PropostaInstagram[], { merge: false }>(),
    // a decision on the open day rewrites its numbers: the form below reloads them.
    // Who decided: the admin decides too (08/10/2026), and the setter sees it
    supabase
      .from('report_proposte_instagram')
      .select('deciso_il, stato, corretta, deciso_da, decisore:profiles!report_proposte_instagram_deciso_da_fkey(nome)')
      .eq('setter_id', profilo.id)
      .eq('data', data)
      .neq('stato', 'da_confermare')
      .maybeSingle(),
    // his other days from 08/10/2026 without the required comment (Dany, 08/10/2026): only his, never the admin's
    giorniSenzaCommento(supabase, profilo.id, oggi, data),
  ])

  if (error) throw new Error(t.errore)

  const daDecidere = (proposte.data ?? []).slice(0, PROPOSTE_MAX)
  const { tuoi, risposte, errore: erroreTuoi } = await numeriDelSetter(
    supabase,
    profilo.id,
    daDecidere.map((p) => p.data).filter((giorno) => giorno !== data),
  )
  // his numbers and answers of the open day are already here
  if (report && haNumeri(report) && daDecidere.some((p) => p.data === data)) tuoi[data] = numeriDi(report)
  if (report) risposte[data] = risposteDi(report)
  // the cards take them by proposal
  const suoi = Object.fromEntries(daDecidere.flatMap((p) => (tuoi[p.data] ? [[p.id, tuoi[p.data]]] : [])))
  const commenti = Object.fromEntries(daDecidere.flatMap((p) => (risposte[p.data] ? [[p.id, risposte[p.data]]] : [])))

  // the open day's proposal decided by someone else (the admin): one plain line, never its numbers
  const decisaDa = decisaDelGiorno.data ? decisaDaUnAltroIn(decisaDelGiorno.data, profilo.id, lingua) : null

  const iniziale: ValoriReport = report ? valoriDaRiga(report) : REPORT_VUOTO

  // what the page shows of the proposals: the form reads it again when the app
  // comes back to the front, and the page is read again only if it changed.
  // A read that failed is never equal: back to the front, the page tries again
  const firma =
    proposte.error || decisaDelGiorno.error
      ? 'errore'
      : firmaProposte(proposte.data, decisaDelGiorno.data?.deciso_il ?? null)

  const precedente = aggiungiGiorni(data, -1)
  const successivo = aggiungiGiorni(data, 1)
  const puoiAvanti = successivo <= oggi

  return (
    <div className="max-w-xl">
      {/* the recap of the DMs of the last 24 hours is the second tab of Oggi (1.38.0) */}
      <SchedeInsight ruolo="setter" attiva="principale" />

      <header className="mb-2 flex items-center justify-between gap-2">
        <NavGiorno
          href={hrefGiorno(precedente, oggi)}
          etichetta={t.giornoPrecedente}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </NavGiorno>

        <div className="min-w-0 text-center">
          <h1 id={ID_TITOLO} tabIndex={-1} className="font-heading text-xl font-semibold outline-none">
            {etichettaGiornoIn(data, oggi, lingua)}
          </h1>
          <SceltaGiorno data={data} oggi={oggi} />
        </div>

        <NavGiorno
          href={puoiAvanti ? hrefGiorno(successivo, oggi) : null}
          etichetta={t.giornoSuccessivo}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </NavGiorno>
      </header>

      {/* his other days from 08/10/2026 still without the comment of the day: his own reminder */}
      {senzaCommento ? <GiorniSenzaCommento {...senzaCommento} oggi={oggi} lingua={lingua} /> : null}

      {decisaDa ? (
        <p
          className="mb-4 flex items-start gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground"
          data-testid="proposta-decisa-da"
        >
          <UserCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {decisaDa}
        </p>
      ) : null}

      {/* the day's numbers from the Instagram DMs, to confirm: his own days (08/10/2026) */}
      <ProposteInstagram
        proposte={daDecidere}
        suoi={suoi}
        commenti={commenti}
        oggi={oggi}
        dataAperta={data}
        altre={(proposte.data?.length ?? 0) > PROPOSTE_MAX}
        errore={!!proposte.error || erroreTuoi || !!decisaDelGiorno.error}
        idTitoloPagina={ID_TITOLO}
      />

      <ReportForm
        key={`${data}:${decisaDelGiorno.data?.deciso_il ?? ''}`}
        data={data}
        oggi={oggi}
        setterId={profilo.id}
        firmaProposte={firma}
        iniziale={iniziale}
        salvatoAlle={report?.updated_at ?? null}
        dmTotali={report ? report.dm_totali : 0}
        creatoIl={report?.created_at ?? null}
      />

      <div className="mt-6">
        <LegendaSezione voci={vociLegenda(lingua)} />
      </div>
    </div>
  )
}

/**
 * The setter's own numbers on the days of his proposals, where he wrote some:
 * the card puts them next to Instagram's. A failed read is an error, never
 * "no numbers" (a confirmation would then replace his numbers unseen).
 * With them the answers of the day (08/10/2026): the card asks the required
 * comment before a decision only when the report misses it, and its step
 * starts from what is there.
 */
async function numeriDelSetter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  setterId: string,
  giorni: string[],
): Promise<{ tuoi: Record<string, NumeriProposta>; risposte: Record<string, RisposteCommento>; errore: boolean }> {
  const tuoi: Record<string, NumeriProposta> = {}
  const risposte: Record<string, RisposteCommento> = {}
  if (giorni.length === 0) return { tuoi, risposte, errore: false }
  const { data, error } = await supabase
    .from('setter_daily_reports')
    .select(['data', ...CAMPI_PROPOSTA, 'lead_in_target', 'qualita_conversazioni', 'cosa_frenava'].join(', '))
    .eq('setter_id', setterId)
    .in('data', giorni)
    .overrideTypes<(NumeriProposta & RisposteCommento & { data: string })[], { merge: false }>()
  if (error) return { tuoi, risposte, errore: true }
  for (const riga of data ?? []) {
    if (haNumeri(riga)) tuoi[riga.data] = numeriDi(riga)
    risposte[riga.data] = risposteDi(riga)
  }
  return { tuoi, risposte, errore: false }
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
