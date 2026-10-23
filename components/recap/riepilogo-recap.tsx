import { EtichettaConNota } from '@/components/metriche/nota'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { RECAP } from '@/lib/i18n/testi/recap'
import { GRUPPI_RIEPILOGO, type FormaNumero, type Riepilogo } from '@/lib/recap/recap'

/**
 * «Riepilogo del mese» (1.59.0): the ratio boxes under the monthly sheet of Dany's Excel
 * (setter, closer, money), with the official definitions of the app (CLAUDE.md section 9).
 * Under each number the same number of the month before, in words. Sober: no gold here.
 * Every number from recap_mese(); here only the formatting.
 */
export function RiepilogoRecap({
  corrente,
  precedente,
  mesePrima,
  lingua,
}: {
  corrente: Riepilogo
  precedente: Riepilogo
  mesePrima: string
  lingua: Lingua
}) {
  const t = RECAP[lingua]
  const f = formato(lingua)
  const stampa = (forma: FormaNumero, n: number | null) =>
    forma === 'percentuale'
      ? f.formatPercentuale(n)
      : forma === 'rapporto'
        ? f.formatRapporto(n)
        : forma === 'euro'
          ? f.formatEuro(n)
          : f.formatNumero(n)

  return (
    <section aria-labelledby="titolo-riepilogo" className="min-w-0 space-y-3" data-testid="recap-riepilogo">
      <div className="min-w-0">
        <h2 id="titolo-riepilogo" className="font-heading text-base font-semibold">
          {t.riepilogoTitolo}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t.riepilogoDescrizione}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {GRUPPI_RIEPILOGO.map(({ gruppo, voci }) => (
          <section key={gruppo} aria-labelledby={`riepilogo-${gruppo}`} className="min-w-0 rounded-xl bg-card p-4">
            <h3 id={`riepilogo-${gruppo}`} className="text-sm font-medium">
              {t.gruppi[gruppo]}
            </h3>
            <dl className="mt-2 divide-y divide-border">
              {voci.map(({ chiave, forma }) => (
                <div key={chiave} className="flex items-start justify-between gap-3 py-2">
                  <dt className="min-w-0 text-sm text-muted-foreground">
                    <EtichettaConNota voce={t.riepilogo[chiave]} />
                  </dt>
                  <dd className="shrink-0 text-right">
                    <span className="num block text-base font-semibold">{stampa(forma, corrente[chiave])}</span>
                    <span className="num block text-xs text-muted-foreground">
                      {t.mesePrima(mesePrima, stampa(forma, precedente[chiave]))}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </section>
  )
}
