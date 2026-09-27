import { TriangleAlert, Wallet } from 'lucide-react'
import Link from 'next/link'

import { RataAzioni } from '@/app/(app)/sales/[id]/rata-azioni'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { StatoRata } from '@/components/pagamento/stato-rata'
import { BottoneWhatsApp } from '@/components/pagamento/whatsapp'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { formatData, formatEuro, formatMese } from '@/lib/format'
import { linkWhatsApp, messaggioRata } from '@/lib/whatsapp'
import { hrefPeriodo, leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const VISTE = {
  ritardo: 'In ritardo',
  prossime: 'Prossimi 30 giorni',
  previste: 'Tutte da incassare',
  incassate: 'Incassate nel mese',
} as const
type Vista = keyof typeof VISTE

export default async function IncassiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const parametri = await searchParams
  const richiesta = Array.isArray(parametri.vista) ? parametri.vista[0] : parametri.vista
  const vista: Vista = richiesta && richiesta in VISTE ? (richiesta as Vista) : 'ritardo'
  const oggi = oggiRoma()
  // only the "incassate" view is bound to a period
  const periodo = leggiPeriodo(parametri, oggi)
  const etichettaVista = (v: Vista) =>
    v === 'incassate' ? (periodo.mese ? 'Incassate nel mese' : 'Incassate nel periodo') : VISTE[v]
  const tra30 = aggiungiGiorni(oggi, 30)
  const supabase = await createClient()

  const base = () =>
    supabase
      .from('v_rate')
      .select('payment_id, sale_id, client_id, cliente, numero_rata, scadenza, importo_previsto, incassato_il, importo_incassato, metodo, stato, giorni_ritardo', { count: 'exact' })

  const filtra = (q: ReturnType<typeof base>, v: Vista) => {
    if (v === 'ritardo') return q.eq('in_ritardo', true).order('scadenza')
    if (v === 'prossime') return q.eq('stato', 'prevista').gte('scadenza', oggi).lte('scadenza', tra30).order('scadenza')
    if (v === 'previste') return q.eq('stato', 'prevista').order('scadenza')
    return q.in('stato', ['incassata', 'rimborsata']).gte('incassato_il', periodo.da).lte('incassato_il', periodo.a).order('incassato_il', { ascending: false })
  }

  const [righe, fasce, previsione, ...conteggi] = await Promise.all([
    filtra(base(), vista).limit(300),
    supabase.rpc('da_incassare'),
    supabase.rpc('previsione_cassa', { p_mesi: 3 }),
    ...(Object.keys(VISTE) as Vista[]).map((v) =>
      filtra(
        supabase.from('v_rate').select('payment_id', { count: 'exact', head: true }) as unknown as ReturnType<typeof base>,
        v,
      ),
    ),
  ])
  if (righe.error || fasce.error || previsione.error) throw new Error('Impossibile caricare gli incassi')

  // the client's phone for the WhatsApp reminder (only on instalments still due)
  const idClienti = [...new Set(righe.data.filter((r) => r.stato === 'prevista').map((r) => r.client_id).filter(Boolean))]
  const { data: contatti } = idClienti.length
    ? await supabase.from('clients').select('id, telefono').in('id', idClienti as string[])
    : { data: [] as { id: string; telefono: string | null }[] }
  const telefono = new Map((contatti ?? []).map((c) => [c.id, c.telefono]))

  const perFascia = Object.fromEntries((fasce.data ?? []).map((f) => [f.fascia, f]))
  const nVista = Object.fromEntries((Object.keys(VISTE) as Vista[]).map((v, i) => [v, conteggi[i].count ?? 0]))

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo="Incassi"
        descrizione={
          <>
            I soldi, rata per rata: quando scade ogni pagamento e se è entrato. Segna incassata da qui. Il contratto da cui
            nasce ogni rata è in{' '}
            <Link href="/sales" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              Vendite
            </Link>
            .
          </>
        }
      />

      <dl className="grid grid-cols-3 gap-3 rounded-xl bg-card p-4" data-testid="riepilogo-da-incassare">
        <div>
          <dt className="flex items-center gap-1 text-xs text-status-warning">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            In ritardo
          </dt>
          <dd className="num text-lg font-semibold md:text-2xl">{formatEuro(perFascia.in_ritardo?.totale, { compatto: true })}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Prossimi 30 giorni</dt>
          <dd className="num text-lg font-semibold md:text-2xl">{formatEuro(perFascia.prossimi_30?.totale, { compatto: true })}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Oltre</dt>
          <dd className="num text-lg font-semibold md:text-2xl">{formatEuro(perFascia.oltre?.totale, { compatto: true })}</dd>
        </div>
      </dl>

      <section aria-labelledby="titolo-previsione" className="rounded-xl bg-card p-4" data-testid="previsione-cassa" data-tour="previsione-cassa">
        <h2 id="titolo-previsione" className="text-sm font-medium">
          Previsione di cassa
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Quanto entra nei prossimi mesi dalle rate già previste. Quelle in ritardo sono a parte: sono dovute, non pianificate.
        </p>
        <dl className="grid grid-cols-3 gap-3">
          {(previsione.data ?? []).map((m, i) => (
            <div key={m.mese}>
              <dt className="text-xs text-muted-foreground">{formatMese(m.mese)}</dt>
              <dd className="num text-lg font-semibold md:text-2xl">{formatEuro(Number(m.previsto) + (i === 0 ? Number(m.incassato) : 0), { compatto: true })}</dd>
              <dd className="num text-xs text-muted-foreground">
                {i === 0
                  ? `${formatEuro(m.incassato, { compatto: true })} già entrati · ${formatEuro(m.previsto, { compatto: true })} in arrivo`
                  : `${m.rate_previste} ${m.rate_previste === 1 ? 'rata' : 'rate'}`}
              </dd>
            </div>
          ))}
        </dl>
        {previsione.data?.[0] && Number(previsione.data[0].in_ritardo) > 0 ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-status-warning">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            <span className="num">
              In più {formatEuro(previsione.data[0].in_ritardo)} in ritardo su {previsione.data[0].rate_in_ritardo}{' '}
              {previsione.data[0].rate_in_ritardo === 1 ? 'rata' : 'rate'}
            </span>
          </p>
        ) : null}
      </section>

      <nav aria-label="Viste" className="flex flex-wrap gap-2">
        {(Object.keys(VISTE) as Vista[]).map((v) => (
          <Link
            key={v}
            href={
              v === 'ritardo'
                ? '/payments'
                : v === 'incassate'
                  ? hrefPeriodo('/payments', periodo, { vista: v })
                  : `/payments?vista=${v}`
            }
            aria-current={v === vista ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm',
              v === vista
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {etichettaVista(v)}
            <span className="num text-xs opacity-80">{nVista[v]}</span>
          </Link>
        ))}
      </nav>

      {vista === 'incassate' ? (
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/payments" parametri={{ vista: 'incassate' }} />
      ) : null}

      {righe.data.length === 0 ? (
        <StatoVuoto
          Icona={Wallet}
          titolo={
            vista === 'ritardo'
              ? 'Nessuna rata in ritardo'
              : vista === 'incassate'
                ? `Nessun incasso ${periodo.frase}`
                : 'Nessuna rata in questa vista'
          }
          descrizione={vista === 'ritardo' ? 'Tutti i clienti sono in pari con i pagamenti.' : 'Cambia vista o periodo.'}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card" data-testid="elenco-rate">
          {righe.data.map((r) => (
            <li
              key={r.payment_id}
              aria-label={`${r.cliente} rata ${r.numero_rata}`}
              className="px-3 py-2 md:flex md:items-center md:gap-3"
            >
              <div className="flex min-h-11 items-center gap-3 md:flex-1">
                <div className="min-w-0 flex-1">
                  <Link href={`/sales/${r.sale_id}`} className="block truncate text-sm font-medium hover:underline">
                    {r.cliente}
                  </Link>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>Rata {r.numero_rata}</span>
                    <span>·</span>
                    <span className="num">
                      {r.stato === 'prevista' || r.stato === 'fallita'
                        ? `scade il ${formatData(r.scadenza)}`
                        : `incassata il ${formatData(r.incassato_il)}`}
                    </span>
                    {r.giorni_ritardo ? <span className="text-status-warning">· {r.giorni_ritardo} giorni di ritardo</span> : null}
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-sm font-medium">{formatEuro(r.importo_incassato ?? r.importo_previsto)}</p>
                  <StatoRata stato={r.stato!} scadenza={r.scadenza!} oggi={oggi} className="text-xs" />
                </div>
              </div>
              {/* fixed width from md up: amounts line up whatever the actions */}
              <div className="flex items-center justify-end gap-2 md:w-64 md:shrink-0">
                {r.stato === 'prevista' ? (
                  <BottoneWhatsApp
                    compatto
                    etichetta={`Scrivi a ${r.cliente} su WhatsApp per la rata ${r.numero_rata}`}
                    href={linkWhatsApp(
                      r.client_id ? telefono.get(r.client_id) : null,
                      messaggioRata({
                        nome: r.cliente,
                        numero_rata: r.numero_rata!,
                        importo: Number(r.importo_previsto),
                        scadenza: r.scadenza!,
                        oggi,
                      }),
                    )}
                  />
                ) : null}
                {r.stato !== 'rimborsata' ? (
                  <RataAzioni
                    rata={{
                      id: r.payment_id!,
                      numero_rata: r.numero_rata!,
                      scadenza: r.scadenza!,
                      importo_previsto: r.importo_previsto!,
                      stato: r.stato!,
                      importo_incassato: r.importo_incassato,
                      incassato_il: r.incassato_il,
                      metodo: r.metodo,
                    }}
                    admin
                    oggi={oggi}
                    // filled button only where it is urgent: the late view
                    principale={vista === 'ritardo'}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
