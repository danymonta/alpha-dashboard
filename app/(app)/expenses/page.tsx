import { Banknote } from 'lucide-react'

import { CopiaRicorrenti, EliminaCosto, ModificaCosto, NuovoCosto } from '@/app/(app)/expenses/costi-client'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { puoScrivere, RUOLI_COME_ADMIN } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiMesi, oggiRoma } from '@/lib/date'
import { formatData, formatEuro, formatMese } from '@/lib/format'
import { leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_CATEGORIA } from '@/lib/validation/anagrafiche'

export const dynamic = 'force-dynamic'

export default async function CostiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // the admin, and the business coach in read only (22/10/2026)
  const profilo = await requireRuolo(RUOLI_COME_ADMIN)
  const scrive = puoScrivere(profilo.ruolo)
  const oggi = oggiRoma()
  const periodo = leggiPeriodo(await searchParams, oggi)
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
  if (error || erroreRiepilogo) throw new Error('Impossibile caricare i costi')

  // the rollup row (categoria null) is the period total computed by SQL
  const totale = riepilogo.find((r) => r.categoria === null)
  const perCategoria = riepilogo.filter((r) => r.categoria !== null)

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        titolo="Costi"
        descrizione="Team, software, ads, formazione: quello che sta sotto il margine operativo."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/expenses" />
        {/* recurring costs are copied month to month: only a single whole month offers it */}
        {periodo.mese && scrive ? (
          <CopiaRicorrenti mese={periodo.mese} meseSorgente={formatMese(aggiungiMesi(periodo.mese, -1))} />
        ) : null}
      </div>

      <div className="rounded-xl bg-card p-4" data-testid="totale-costi">
        <p className="text-xs text-muted-foreground">
          Totale costi {periodo.mese ? `di ${formatMese(periodo.mese)}` : periodo.frase}
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

      {scrive ? (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Aggiungi</h2>
          <NuovoCosto dataPredefinita={dataPredefinita} massima={oggi} />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Costi del {periodo.mese ? 'mese' : 'periodo'} ({costi.length})
        </h2>
        {costi.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <Banknote className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Nessun costo {periodo.frase}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {!scrive
                ? 'Cambia periodo per vedere gli altri.'
                : periodo.mese
                  ? 'Aggiungilo qui sopra, oppure copia i ricorrenti del mese precedente.'
                  : 'Aggiungilo qui sopra, oppure cambia periodo.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card">
            {costi.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.descrizione}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatData(c.data)} · {ETICHETTA_CATEGORIA[c.categoria]}
                    {c.ricorrente ? ' · ricorrente' : ''}
                  </p>
                </div>
                <p className="num text-right text-sm font-medium">{formatEuro(c.importo)}</p>
                {scrive ? (
                  <div className="-mr-1.5 flex shrink-0">
                    <ModificaCosto costo={c} massima={oggi} />
                    <EliminaCosto id={c.id} descrizione={c.descrizione} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
