import { PiggyBank, Plus } from 'lucide-react'

import {
  CopiaSpeseRicorrenti,
  EliminaSpesaPersonale,
  ID_MODULO_SPESA,
  ModificaSpesaPersonale,
  NuovaSpesaPersonale,
} from '@/app/(app)/spese-personali/spese-client'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiMesi, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { SPESE_PERSONALI } from '@/lib/i18n/testi/spese-personali'
import { leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'
import { isCategoriaSpesaPersonale } from '@/lib/validation/spese-personali'

export const dynamic = 'force-dynamic'

/**
 * Spese personali (1.68.0, Dany 31/10/2026): the admin's own expenses, apart from the
 * business. Built like Costi; totals per category come from SQL
 * (riepilogo_spese_personali). No business number reads these rows.
 */
export default async function SpesePersonaliPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const oggi = oggiRoma()
  const lingua = await getLingua()
  const t = SPESE_PERSONALI[lingua]
  const { formatData, formatEuro, formatMese } = formato(lingua)
  const periodo = leggiPeriodo(await searchParams, oggi, lingua)
  // new expenses default to today, or to the last day of a past period
  const dataPredefinita = periodo.a < oggi ? periodo.a : oggi
  const supabase = await createClient()

  const [{ data: spese, error }, { data: riepilogo, error: erroreRiepilogo }] = await Promise.all([
    supabase
      .from('spese_personali')
      .select('id, data, categoria, descrizione, importo, ricorrente')
      .gte('data', periodo.da)
      .lte('data', periodo.a)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.rpc('riepilogo_spese_personali', { p_da: periodo.da, p_a: periodo.a }),
  ])
  if (error || erroreRiepilogo) throw new Error(t.errore)

  const etichetta = (categoria: string) => (isCategoriaSpesaPersonale(categoria) ? t.categorie[categoria] : categoria)
  // the rollup row (categoria null) is the period total computed by SQL
  const totale = riepilogo.find((r) => r.categoria === null)
  const perCategoria = riepilogo.filter((r) => r.categoria !== null)

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina titolo={t.titolo} descrizione={t.descrizione} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/spese-personali" />
        {/* recurring expenses are copied month to month: only a single whole month offers it */}
        {periodo.mese ? (
          <CopiaSpeseRicorrenti mese={periodo.mese} meseSorgente={formatMese(aggiungiMesi(periodo.mese, -1))} />
        ) : null}
      </div>

      <div className="rounded-xl bg-card p-4" data-testid="totale-spese-personali">
        <p className="text-xs text-muted-foreground">
          {periodo.mese ? t.totaleMese(formatMese(periodo.mese)) : t.totale(periodo.frase)}
        </p>
        <p className="num text-3xl font-semibold">{formatEuro(totale?.totale ?? 0)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t.fuoriDaiConti}</p>
        {perCategoria.length > 0 ? (
          <dl
            className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3"
            aria-label={t.perCategoria}
          >
            {perCategoria.map((r) => (
              <div key={r.categoria}>
                <dt className="text-xs text-muted-foreground">{etichetta(r.categoria)}</dt>
                <dd className="num text-base font-medium">{formatEuro(r.totale)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.aggiungiTitolo}</h2>
        <NuovaSpesaPersonale dataPredefinita={dataPredefinita} massima={oggi} />
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t.elenco(periodo.mese !== null, spese.length)}
        </h2>
        {spese.length === 0 ? (
          <StatoVuoto
            Icona={PiggyBank}
            titolo={t.vuoto(periodo.frase)}
            descrizione={periodo.mese ? t.vuotoMese : t.vuotoPeriodo}
            azione={
              <a
                href={`#${ID_MODULO_SPESA}`}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Plus className="size-4" aria-hidden="true" />
                {t.vaiAlModulo}
              </a>
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card">
            {spese.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p lang="it" className="truncate text-sm font-medium">
                    {s.descrizione}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatData(s.data)} · {etichetta(s.categoria)}
                    {s.ricorrente ? t.ricorrenteRiga : ''}
                  </p>
                </div>
                <p className="num text-right text-sm font-medium">{formatEuro(s.importo)}</p>
                <div className="-mr-1.5 flex shrink-0">
                  <ModificaSpesaPersonale
                    spesa={{ ...s, categoria: isCategoriaSpesaPersonale(s.categoria) ? s.categoria : 'altro' }}
                    massima={oggi}
                  />
                  <EliminaSpesaPersonale id={s.id} descrizione={s.descrizione} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
