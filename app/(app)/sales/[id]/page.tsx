import { SearchX } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoRata } from '@/components/pagamento/stato-rata'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formatData, formatEuro } from '@/lib/format'
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
      'id, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, note, cliente:clients(nome, cognome, instagram_handle), prodotto:products(nome), setter:profiles!sales_setter_id_fkey(nome), closer:profiles!sales_closer_id_fkey(nome), rate:payments(id, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato)',
    )
    .eq('id', id)
    .order('numero_rata', { referencedTable: 'payments' })
    .maybeSingle()

  const tornaIndietro = profilo.ruolo === 'admin' ? '/sales' : '/my-sales'

  if (!vendita) {
    return (
      <div className="mx-auto max-w-2xl">
        <IntestazionePagina titolo="Vendita" />
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
  const nomeCliente = [vendita.cliente?.nome, vendita.cliente?.cognome].filter(Boolean).join(' ')

  const dettagli: [string, string][] = [
    ['Tipo', ETICHETTA_TIPO_VENDITA[vendita.tipo]],
    ['Prodotto', vendita.prodotto?.nome ?? '–'],
    ['Data vendita', formatData(vendita.data_vendita)],
    ['Percorso', `${formatData(vendita.data_inizio)} → ${formatData(vendita.data_fine)}`],
    ['Closer', vendita.closer?.nome ?? '–'],
    ['Setter', vendita.setter?.nome ?? '–'],
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <IntestazionePagina
        titolo={nomeCliente || 'Vendita'}
        descrizione={vendita.cliente?.instagram_handle ?? undefined}
      />

      <div className="rounded-xl bg-card p-4">
        <p className="text-xs text-muted-foreground">Valore del contratto</p>
        {/* the one gold number of the screen */}
        <p className="num text-3xl font-semibold text-gold">{formatEuro(vendita.valore_contratto)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {vendita.numero_rate === 1 ? 'Pagamento unico' : `${vendita.numero_rate} rate mensili`}
        </p>
      </div>

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
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Piano rate
        </h2>
        <ul className="divide-y divide-border rounded-xl bg-card" data-testid="piano-rate">
          {vendita.rate.map((rata) => (
            <li key={rata.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
              <span className="num w-8 shrink-0 text-sm text-muted-foreground">{rata.numero_rata}ª</span>
              <div className="min-w-0 flex-1">
                <p className="num text-sm">{formatData(rata.scadenza)}</p>
                <StatoRata stato={rata.stato} scadenza={rata.scadenza} oggi={oggi} className="text-xs" />
              </div>
              <span className="num text-right text-sm font-medium">
                {formatEuro(rata.importo_incassato ?? rata.importo_previsto)}
              </span>
            </li>
          ))}
        </ul>
        <p className="px-1 text-xs text-muted-foreground">
          «Segna rata incassata» e la modifica delle rate arrivano con la prossima schermata.
        </p>
      </section>
    </div>
  )
}
