import { Banknote } from 'lucide-react'

import { CopiaRicorrenti, EliminaCosto, NuovoCosto } from '@/app/(app)/expenses/costi-client'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettoreMese } from '@/components/pagina/selettore-mese'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiMesi, fineMese, oggiRoma, parseMese, primoDelMeseISO } from '@/lib/date'
import { formatData, formatEuro, formatMese } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_CATEGORIA } from '@/lib/validation/anagrafiche'

export const dynamic = 'force-dynamic'

export default async function CostiPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  await requireRuolo(['admin'])
  const oggi = oggiRoma()
  const meseCorrente = primoDelMeseISO(oggi)
  const mese = parseMese((await searchParams).mese) ?? meseCorrente
  const ultimoGiorno = fineMese(mese)
  const supabase = await createClient()

  const [{ data: costi, error }, { data: riepilogo, error: erroreRiepilogo }] = await Promise.all([
    supabase
      .from('expenses')
      .select('id, data, categoria, descrizione, importo, ricorrente')
      .gte('data', mese)
      .lte('data', ultimoGiorno)
      .order('data', { ascending: false }),
    supabase.rpc('riepilogo_costi', { p_mese: mese }),
  ])
  if (error || erroreRiepilogo) throw new Error('Impossibile caricare i costi')

  // the rollup row (categoria null) is the month total computed by SQL
  const totale = riepilogo.find((r) => r.categoria === null)
  const perCategoria = riepilogo.filter((r) => r.categoria !== null)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <IntestazionePagina
        titolo="Costi"
        descrizione="Team, software, ads, formazione: quello che sta sotto il margine operativo."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelettoreMese mese={mese} meseCorrente={meseCorrente} percorso="/expenses" />
        <CopiaRicorrenti mese={mese} meseSorgente={formatMese(aggiungiMesi(mese, -1))} />
      </div>

      <div className="rounded-xl bg-card p-4" data-testid="totale-costi">
        <p className="text-xs text-muted-foreground">Totale costi di {formatMese(mese)}</p>
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
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Aggiungi</h2>
        <NuovoCosto dataPredefinita={mese === meseCorrente ? oggi : ultimoGiorno} massima={oggi} />
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Costi del mese ({costi.length})
        </h2>
        {costi.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <Banknote className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Nessun costo a {formatMese(mese)}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Aggiungilo qui sopra, oppure copia i ricorrenti del mese precedente.
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
                <EliminaCosto id={c.id} descrizione={c.descrizione} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
