import { SearchX, TriangleAlert } from 'lucide-react'

import { RataAzioni } from '@/app/(app)/sales/[id]/rata-azioni'

import { LinkBottone } from '@/components/link-bottone'
import { AggiungiRata } from '@/app/(app)/sales/[id]/aggiungi-rata'
import { ModificaVendita } from '@/app/(app)/sales/[id]/modifica-vendita'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoRata } from '@/components/pagamento/stato-rata'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma, stessoGiornoTraMesi } from '@/lib/date'
import { formatData, formatEuro, formatPercentuale } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_TIPO_VENDITA } from '@/lib/validation/vendita'

export const dynamic = 'force-dynamic'

export default async function DettaglioVenditaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profilo = await requireRuolo(['admin', 'closer'])
  const { id } = await params
  const supabase = await createClient()

  // RLS: the admin reads every sale, the closer only the ones he closed
  const { data: vendita } = await supabase
    .from('sales')
    .select(
      'id, tipo, product_id, prodotto_personalizzato, setter_id, closer_id, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, note, cliente:clients(nome, cognome, instagram_handle), prodotto:products(nome), setter:profiles!sales_setter_id_fkey(nome), closer:profiles!sales_closer_id_fkey(nome), rate:payments(id, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, metodo)',
    )
    .eq('id', id)
    .order('numero_rata', { referencedTable: 'payments' })
    .order('created_at', { referencedTable: 'payments' })
    .maybeSingle()

  // money summary computed in SQL (v_vendite, security_invoker)
  const { data: riepilogo } = await supabase
    .from('v_vendite')
    .select('incassato, da_incassare, in_ritardo, rate_in_ritardo, scarto_piano')
    .eq('sale_id', id)
    .maybeSingle()

  const admin = profilo.ruolo === 'admin'
  // the edit sheet's lists: admin only, former collaborators stay where they already are
  const [catalogo, persone, provvigione] = admin
    ? await Promise.all([
        supabase.from('products').select('id, nome, attivo').order('nome'),
        supabase.from('profiles').select('id, nome, ruolo, attivo').in('ruolo', ['admin', 'setter', 'closer']).order('nome'),
        // the setter's share of this sale, summed in SQL (admin only)
        supabase.rpc('provvigioni_per_vendita', { p_sale_id: id }),
      ])
    : [null, null, null]

  const tornaIndietro = admin ? '/sales' : '/my-sales'
  const indietro = {
    href: tornaIndietro,
    etichetta: profilo.ruolo === 'admin' ? 'Vendite' : 'Le mie vendite',
  }

  if (!vendita) {
    return (
      <div className="max-w-2xl">
        <IntestazionePagina titolo="Vendita" indietro={indietro} />
        <StatoVuoto
          Icona={SearchX}
          titolo="Vendita non trovata"
          descrizione="La vendita non esiste o non è tra le tue."
          azione={
            <LinkBottone href={tornaIndietro} variant="outline">
              Torna alle vendite
            </LinkBottone>
          }
        />
      </div>
    )
  }

  const oggi = oggiRoma()
  // filled button only on the first instalment still to collect, in plan order
  const primaDaIncassare = vendita.rate.find((r) => r.stato === 'prevista' || r.stato === 'fallita')?.id
  const nomeCliente = [vendita.cliente?.nome, vendita.cliente?.cognome].filter(Boolean).join(' ')

  const dettagli: [string, string][] = [
    ['Tipo', ETICHETTA_TIPO_VENDITA[vendita.tipo]],
    ['Prodotto', vendita.prodotto?.nome ?? vendita.prodotto_personalizzato ?? '–'],
    ['Data vendita', formatData(vendita.data_vendita)],
    ['Percorso', `${formatData(vendita.data_inizio)} → ${formatData(vendita.data_fine)}`],
    ['Closer', vendita.closer?.nome ?? '–'],
    ['Setter', vendita.setter?.nome ?? '–'],
  ]
  const quota = provvigione?.data?.[0]
  if (admin && vendita.setter_id) {
    dettagli.push([
      'Provvigione setter',
      quota
        ? `${quota.percentuale === null ? 'regole diverse' : formatPercentuale(quota.percentuale)} di ${formatEuro(quota.incassato)} = ${formatEuro(quota.provvigione)}`
        : 'nessuna finora',
    ])
  }

  return (
    <div className="max-w-2xl space-y-6">
      <IntestazionePagina
        titolo={nomeCliente || 'Vendita'}
        descrizione={vendita.cliente?.instagram_handle ?? undefined}
        indietro={indietro}
        azione={
          admin ? (
            <ModificaVendita
              descrizione={`la vendita di ${nomeCliente || 'questo cliente'}`}
              vendita={{
                id: vendita.id,
                tipo: vendita.tipo,
                product_id: vendita.product_id,
                prodotto_personalizzato: vendita.prodotto_personalizzato,
                valore_contratto: vendita.valore_contratto,
                data_vendita: vendita.data_vendita,
                data_inizio: vendita.data_inizio,
                data_fine: vendita.data_fine,
                setter_id: vendita.setter_id,
                closer_id: vendita.closer_id,
                note: vendita.note,
              }}
              prodotti={(catalogo?.data ?? [])
                .filter((p) => p.attivo || p.id === vendita.product_id)
                .map(({ id, nome }) => ({ id, nome }))}
              setters={(persone?.data ?? [])
                .filter((p) => p.ruolo === 'setter' && (p.attivo || p.id === vendita.setter_id))
                .map(({ id, nome }) => ({ id, nome }))}
              closers={(persone?.data ?? [])
                .filter((p) => (p.ruolo === 'admin' || p.ruolo === 'closer') && (p.attivo || p.id === vendita.closer_id))
                .map(({ id, nome }) => ({ id, nome }))}
            />
          ) : undefined
        }
      />

      <div className="rounded-xl bg-card p-4">
        <p className="text-xs text-muted-foreground">Valore del contratto</p>
        {/* the one gold number of the screen */}
        <p className="num text-3xl font-semibold text-gold">{formatEuro(vendita.valore_contratto)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {vendita.numero_rate === 1 ? 'Pagamento unico' : `${vendita.numero_rate} rate mensili`}
        </p>

        {riepilogo ? (
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4" data-testid="riepilogo-incassi">
            <div>
              <dt className="text-xs text-muted-foreground">Incassato</dt>
              <dd className="num text-base font-medium">{formatEuro(riepilogo.incassato)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Da incassare</dt>
              <dd className="num text-base font-medium">{formatEuro(riepilogo.da_incassare)}</dd>
            </div>
            <div>
              {/* the warning sits on the label: the amount stays a plain number, gold is the contract value */}
              <dt
                className={`flex items-center gap-1 text-xs ${
                  (riepilogo.rate_in_ritardo ?? 0) > 0 ? 'text-status-warning' : 'text-muted-foreground'
                }`}
              >
                {(riepilogo.rate_in_ritardo ?? 0) > 0 ? (
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
                In ritardo
              </dt>
              <dd className="num text-base font-medium text-foreground">{formatEuro(riepilogo.in_ritardo)}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      {riepilogo && Number(riepilogo.scarto_piano) !== 0 ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-status-warning/10 px-3 py-2.5 text-sm text-status-warning"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Il piano rate non torna con il contratto: scarto di {formatEuro(riepilogo.scarto_piano)}.
        </p>
      ) : null}

      <dl className="divide-y divide-border rounded-xl bg-card px-3">
        {dettagli.map(([etichetta, valore]) => (
          <div key={etichetta} className="flex min-h-11 items-center justify-between gap-3 py-2">
            <dt className="text-sm text-muted-foreground">{etichetta}</dt>
            <dd className="num text-right text-sm">{valore}</dd>
          </div>
        ))}
        {vendita.note ? (
          <div className="py-3">
            <dt className="text-sm text-muted-foreground">Note</dt>
            <dd className="mt-1 text-sm whitespace-pre-line">{vendita.note}</dd>
          </div>
        ) : null}
      </dl>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Piano rate · i soldi da incassare
          </h2>
          {admin ? (
            <AggiungiRata
              saleId={vendita.id}
              scadenzaProposta={
                vendita.rate.length > 0
                  ? stessoGiornoTraMesi(vendita.rate[vendita.rate.length - 1].scadenza, 1)
                  : vendita.data_vendita
              }
            />
          ) : null}
        </div>
        <ul className="divide-y divide-border rounded-xl bg-card" data-testid="piano-rate">
          {vendita.rate.map((rata) => (
            <li
              key={rata.id}
              aria-label={`Rata ${rata.numero_rata}${rata.stato === 'rimborsata' ? ' rimborso' : ''}`}
              className="px-3 py-2 md:flex md:items-center md:gap-3"
            >
              <div className="flex min-h-11 items-center gap-3 md:flex-1">
                <span className="num w-8 shrink-0 text-sm text-muted-foreground">
                  {rata.numero_rata}ª
                </span>
                <div className="min-w-0 flex-1">
                  <p className="num text-sm">
                    {formatData(rata.stato === 'prevista' || rata.stato === 'fallita' ? rata.scadenza : rata.incassato_il)}
                  </p>
                  <StatoRata stato={rata.stato} scadenza={rata.scadenza} oggi={oggi} className="text-xs" />
                </div>
                <span className="num text-right text-sm font-medium">
                  {formatEuro(rata.importo_incassato ?? rata.importo_previsto)}
                </span>
              </div>
              {/* fixed width from md up: amounts line up whatever the actions */}
              <div className="md:w-52 md:shrink-0">
                {rata.stato !== 'rimborsata' ? (
                  <RataAzioni
                    rata={rata}
                    admin={admin}
                    oggi={oggi}
                    principale={rata.id === primaDaIncassare}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
