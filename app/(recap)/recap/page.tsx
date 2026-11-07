import { CalendarDays } from 'lucide-react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import { LinkBottone } from '@/components/link-bottone'
import { SelettoreMese } from '@/components/pagina/selettore-mese'
import { TileKpi } from '@/components/panoramica/tile-kpi'
import { CalendarioRecap } from '@/components/recap/calendario-recap'
import { RiepilogoRecap } from '@/components/recap/riepilogo-recap'
import { SceltaVistaRecap } from '@/components/recap/scelta-vista-recap'
import { TabellaRecap } from '@/components/recap/tabella-recap'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_RECAP } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma, parseMese, primoDelMeseISO } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { RECAP } from '@/lib/i18n/testi/recap'
import { leggiRecapMese, meseVuoto } from '@/lib/recap/recap'
import { COOKIE_VISTA_RECAP, vistaRecapIniziale } from '@/lib/recap/vista'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: RECAP[await getLingua()].titolo }
}

function primo(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/**
 * Recap vendite (1.58.0; by month and by day from 1.59.0, Dany 23/10/2026: «rifai la dashboard
 * per Max… stile calendario dove si vede il mese cosa è successo ogni giorno… visualizzazione a
 * calendario o a tabella»): the business coach's one page, and the admin's view of it. The tiles
 * of the month against the month before, the month as a calendar (or as the Excel sheet) with
 * every day's detail, and the ratio boxes of the sheet with the app's definitions. Team totals
 * only: never a name, a client, costs, margin or commissions. Every number comes from
 * recap_mese() (SQL); here only formatting and layout.
 */
export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(RUOLI_RECAP)
  const lingua = await getLingua()
  const t = RECAP[lingua]
  const { formatEuro, formatMese, formatNomeMese, formatNumero, formatPercentuale } = formato(lingua)

  const parametri = await searchParams
  const oggi = oggiRoma()
  const meseCorrente = primoDelMeseISO(oggi)
  // the current month and the past ones: the future has nothing to tell yet
  const richiesto = parseMese(primo(parametri.mese))
  const mese = richiesto !== null && richiesto <= meseCorrente ? richiesto : meseCorrente
  const meseNelLink = richiesto !== null && richiesto <= meseCorrente ? mese.slice(0, 7) : null
  const vistaNellUrl = primo(parametri.vista)
  const vista = vistaRecapIniziale(vistaNellUrl, (await cookies()).get(COOKIE_VISTA_RECAP)?.value)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('recap_mese', { p_mese: mese })
  if (error || data === null) throw new Error(t.errore)

  const r = leggiRecapMese(data)
  const v = r.valori
  const confronto = t.confronto(formatNomeMese(r.precedenteDa))
  // the day of the database decides what is past, today and future
  const giornoDiOggi = r.oggi || oggi

  const intestazione = (
    <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">{t.titolo}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t.descrizione}</p>
      </div>
      <SelettoreMese
        mese={mese}
        meseCorrente={meseCorrente}
        percorso="/recap"
        parametri={{ vista: vistaNellUrl ? vista : undefined }}
        className="md:-mr-3"
      />
    </header>
  )

  if (meseVuoto(r)) {
    return (
      <div className="space-y-5">
        {intestazione}
        <StatoVuoto
          Icona={CalendarDays}
          titolo={t.vuotoTitolo(formatMese(mese))}
          descrizione={t.vuotoDescrizione}
          azione={
            <LinkBottone href="/recap" variant="outline">
              {t.vuotoAzione}
            </LinkBottone>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {intestazione}

      {/* the answer first: the cash the calls brought in, the one gold number */}
      <div className="grid gap-3 lg:grid-cols-[1.4fr_2fr]" data-testid="recap-kpi">
        <TileKpi
          hero
          vetro
          etichetta={{ etichetta: t.cash, spiegazione: t.cashNota }}
          valore={formatEuro(v.cash_nuovi_clienti, { compatto: true })}
          delta={r.delta.cash_nuovi_clienti}
          confronto={confronto}
          className="flex flex-col justify-center"
        />
        <div className="grid grid-cols-2 content-start gap-3">
          <TileKpi
            etichetta={{ etichetta: t.revenue, spiegazione: t.revenueNota }}
            valore={formatEuro(v.revenue_nuovi, { compatto: true })}
            delta={r.delta.revenue_nuovi}
            confronto={confronto}
          />
          <TileKpi
            etichetta={{ etichetta: t.chiuse, spiegazione: t.chiuseNota }}
            valore={formatNumero(v.chiuse)}
            delta={r.delta.chiuse}
            confronto={confronto}
          >
            <p className="mt-1 text-xs text-muted-foreground num">{t.closeRate(formatPercentuale(v.close_rate))}</p>
          </TileKpi>
          <TileKpi
            etichetta={{ etichetta: t.svolte, spiegazione: t.svolteNota }}
            valore={formatNumero(v.call_svolte)}
            delta={r.delta.call_svolte}
            confronto={confronto}
          >
            <p className="mt-1 text-xs text-muted-foreground num">{t.showRate(formatPercentuale(v.show_rate))}</p>
          </TileKpi>
          <TileKpi
            etichetta={{ etichetta: t.prenotate, spiegazione: t.prenotateNota }}
            valore={formatNumero(v.call_prenotate)}
            delta={r.delta.call_prenotate}
            confronto={confronto}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" data-testid="recap-setting">
        <TileKpi
          etichetta={{ etichetta: t.dm, spiegazione: t.dmNota }}
          valore={formatNumero(v.dm_totali)}
          delta={r.delta.dm_totali}
          confronto={confronto}
        >
          <p className="mt-1 text-xs text-muted-foreground num">
            {t.dmParti(formatNumero(v.dm_outbound), formatNumero(v.dm_inbound), formatNumero(v.follow_up))}
          </p>
        </TileKpi>
        <TileKpi
          etichetta={{ etichetta: t.conversazioni, spiegazione: t.conversazioniNota }}
          valore={formatNumero(v.conversazioni)}
          delta={r.delta.conversazioni}
          confronto={confronto}
        />
      </div>

      <div className="flex justify-end">
        <SceltaVistaRecap vista={vista} mese={meseNelLink} />
      </div>

      {vista === 'tabella' ? (
        <TabellaRecap giorni={r.giorni} totali={r.totali} oggi={giornoDiOggi} lingua={lingua} />
      ) : (
        <CalendarioRecap giorni={r.giorni} oggi={giornoDiOggi} />
      )}

      <RiepilogoRecap
        corrente={r.riepilogo}
        precedente={r.riepilogoPrecedente}
        mesePrima={formatNomeMese(r.precedenteDa)}
        lingua={lingua}
      />
    </div>
  )
}
