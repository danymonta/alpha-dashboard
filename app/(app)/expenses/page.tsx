import { Banknote } from 'lucide-react'

import { CopiaRicorrenti, EliminaCosto, ModificaCosto, NuovoCosto } from '@/app/(app)/expenses/costi-client'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiMesi, oggiRoma } from '@/lib/date'
import { formato, formatMese as formatMeseIt } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { PROVVIGIONI } from '@/lib/i18n/testi/provvigioni'
import { leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function CostiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const oggi = oggiRoma()
  const lingua = await getLingua()
  const t = PROVVIGIONI[lingua].costi
  const ETICHETTA_CATEGORIA = ETICHETTE[lingua].categoriaCosto
  const { formatData, formatEuro, formatMese } = formato(lingua)
  const periodo = leggiPeriodo(await searchParams, oggi, lingua)
  // new costs default to today, or to the last day of a past period
  const dataPredefinita = periodo.a < oggi ? periodo.a : oggi
  const supabase = await createClient()

  const [{ data: costi, error }, { data: riepilogo, error: erroreRiepilogo }] = await Promise.all([
    supabase
      .from('expenses')
      .select('id, data, categoria, descrizione, importo, ricorrente')
      .gte('data', periodo.da)
      .lte('data', periodo.a)
      .order('data', { ascending: false }),
    supabase.rpc('riepilogo_costi_periodo', { p_da: periodo.da, p_a: periodo.a }),
  ])
  if (error || erroreRiepilogo) throw new Error(t.errore)

  // the rollup row (categoria null) is the period total computed by SQL
  const totale = riepilogo.find((r) => r.categoria === null)
  const perCategoria = riepilogo.filter((r) => r.categoria !== null)

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizione}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/expenses" />
        {/* recurring costs are copied month to month: only a single whole month offers it */}
        {periodo.mese ? (
          <CopiaRicorrenti mese={periodo.mese} meseSorgente={formatMeseIt(aggiungiMesi(periodo.mese, -1))} />
        ) : null}
      </div>

      <div className="rounded-xl bg-card p-4" data-testid="totale-costi">
        <p className="text-xs text-muted-foreground">
          {periodo.mese ? t.totaleMese(formatMese(periodo.mese)) : t.totale(periodo.frase)}
        </p>
        <p className="num text-3xl font-semibold">{formatEuro(totale?.totale ?? 0)}</p>
        {perCategoria.length > 0 ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3">
            {perCategoria.map((r) => (
              <div key={r.categoria}>
                <dt className="text-xs text-muted-foreground">{ETICHETTA_CATEGORIA[r.categoria!]}</dt>
                <dd className="num text-base font-medium">{formatEuro(r.totale)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.aggiungi}</h2>
        <NuovoCosto dataPredefinita={dataPredefinita} massima={oggi} />
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t.elenco(periodo.mese !== null, costi.length)}
        </h2>
        {costi.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <Banknote className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">{t.vuoto(periodo.frase)}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {periodo.mese ? t.aggiungiOCopia : t.aggiungiOCambia}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card">
            {costi.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p lang="it" className="truncate text-sm font-medium">
                    {c.descrizione}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatData(c.data)} · {ETICHETTA_CATEGORIA[c.categoria]}
                    {c.ricorrente ? t.ricorrente : ''}
                  </p>
                </div>
                <p className="num text-right text-sm font-medium">{formatEuro(c.importo)}</p>
                <div className="-mr-1.5 flex shrink-0">
                  <ModificaCosto costo={c} massima={oggi} />
                  <EliminaCosto id={c.id} descrizione={c.descrizione} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
