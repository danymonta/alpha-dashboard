import { History, Plus, RefreshCw, SearchX, TriangleAlert } from 'lucide-react'

import { InterrompiPercorso } from '@/app/(app)/clients/[id]/interrompi-percorso'
import { ModificaCliente } from '@/app/(app)/clients/[id]/modifica-cliente'
import { StoricoPercorsi, type Percorso } from '@/app/(app)/clients/[id]/storico-percorsi'
import { StatoClienteBadge } from '@/components/cliente/stato-cliente'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formatData, formatEuro } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_FONTE } from '@/lib/validation/call'

export const dynamic = 'force-dynamic'

export default async function SchedaClientePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRuolo(['admin'])
  const { id } = await params
  const supabase = await createClient()
  const oggi = oggiRoma()

  const [{ data: cliente }, { data: valore }, vendite, importi, { data: persone }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, nome, cognome, email, telefono, instagram_handle, fonte, note, created_at, setter_id, closer_id, setter:profiles!clients_setter_id_fkey(nome), closer:profiles!clients_closer_id_fkey(nome)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('v_clienti')
      .select('stato, valore_firmato, incassato, da_incassare, in_ritardo, data_fine_ultima, numero_vendite')
      .eq('client_id', id)
      .maybeSingle(),
    // every sale is a period of the path, with its instalments: the client's history
    supabase
      .from('sales')
      .select(
        'id, tipo, data_vendita, data_inizio, data_fine, created_at, valore_contratto, prodotto_personalizzato, prodotto:products(nome, durata_mesi), rate:payments(id, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, metodo)',
      )
      .eq('client_id', id)
      .order('numero_rata', { referencedTable: 'payments' })
      .order('created_at', { referencedTable: 'payments' }),
    // the money of each period, summed in SQL (v_vendite, security_invoker)
    supabase
      .from('v_vendite')
      .select('sale_id, incassato, da_incassare, in_ritardo, rate_incassate, rate_totali')
      .eq('client_id', id),
    supabase.from('profiles').select('id, nome, ruolo, attivo').in('ruolo', ['admin', 'setter', 'closer']).order('nome'),
  ])
  if (vendite.error || importi.error) throw new Error('Impossibile caricare lo storico del cliente')

  if (!cliente || !valore) {
    return (
      <div className="max-w-3xl">
        <IntestazionePagina titolo="Cliente" indietro={{ href: '/clients', etichetta: 'Clienti' }} />
        <StatoVuoto
          Icona={SearchX}
          titolo="Cliente non trovato"
          descrizione="Il cliente non esiste o è stato rimosso."
          azione={<LinkBottone href="/clients" variant="outline">Torna ai clienti</LinkBottone>}
        />
      </div>
    )
  }

  const nome = [cliente.nome, cliente.cognome].filter(Boolean).join(' ')

  const perVendita = new Map(importi.data.map((i) => [i.sale_id, i]))
  const percorsi: Percorso[] = vendite.data.map((v) => {
    const i = perVendita.get(v.id)
    return {
      id: v.id,
      tipo: v.tipo,
      prodotto: v.prodotto?.nome ?? v.prodotto_personalizzato ?? '–',
      durata_mesi: v.prodotto?.durata_mesi ?? null,
      data_vendita: v.data_vendita,
      data_inizio: v.data_inizio,
      data_fine: v.data_fine,
      created_at: v.created_at,
      valore_contratto: v.valore_contratto,
      rate: v.rate,
      incassato: i?.incassato ?? null,
      da_incassare: i?.da_incassare ?? null,
      in_ritardo: i?.in_ritardo ?? null,
      rate_incassate: i?.rate_incassate ?? null,
      rate_totali: i?.rate_totali ?? null,
    }
  })
  // the path still running (or not started yet) that ends last: the one "Interrompi il percorso" ends
  const inCorso =
    percorsi
      .filter((p) => p.data_fine >= oggi)
      .sort((a, b) => b.data_fine.localeCompare(a.data_fine))
      .map(({ id, data_inizio, data_fine }) => ({ id, data_inizio, data_fine }))[0] ?? null

  const contatti: [string, string][] = [
    ['Email', cliente.email ?? '–'],
    ['Telefono', cliente.telefono ?? '–'],
    ['Instagram', cliente.instagram_handle ?? '–'],
    ['Fonte', cliente.fonte ? ETICHETTA_FONTE[cliente.fonte] : '–'],
    ['Setter', cliente.setter?.nome ?? '–'],
    ['Closer', cliente.closer?.nome ?? '–'],
    ['Cliente dal', formatData(cliente.created_at.slice(0, 10))],
  ]

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        titolo={nome}
        indietro={{ href: '/clients', etichetta: 'Clienti' }}
        azione={
          // renewal and upsell need a first sale: without one, the only way is a "nuovo"
          (valore.numero_vendite ?? 0) === 0 ? (
            <LinkBottone href={`/sales/new?cliente=${id}&tipo=nuovo`}>
              <Plus className="size-4" aria-hidden="true" />
              Registra la prima vendita
            </LinkBottone>
          ) : (
            <div className="flex flex-wrap gap-2">
              {/* a renewal is a new sale: the form starts the day after the last period ends */}
              <LinkBottone href={`/sales/new?cliente=${id}&tipo=rinnovo`}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Ha rinnovato
              </LinkBottone>
              <LinkBottone href={`/sales/new?cliente=${id}&tipo=upsell`} variant="outline">
                Upsell
              </LinkBottone>
              {inCorso ? <InterrompiPercorso vendita={inCorso} cliente={nome} oggi={oggi} /> : null}
            </div>
          )
        }
      />

      <div className="rounded-xl bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Valore nel tempo (incassato)</p>
            {/* the one gold number of the screen: what this client has really paid */}
            <p className="num text-3xl font-semibold text-gold">{formatEuro(valore.incassato)}</p>
          </div>
          <StatoClienteBadge stato={valore.stato!} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
          <div>
            <dt className="text-xs text-muted-foreground">Firmato</dt>
            <dd className="num text-base font-medium">{formatEuro(valore.valore_firmato)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Da incassare</dt>
            <dd className="num text-base font-medium">{formatEuro(valore.da_incassare)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fine percorso</dt>
            <dd className="num text-base font-medium">{formatData(valore.data_fine_ultima)}</dd>
          </div>
        </dl>
        {Number(valore.in_ritardo) > 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-status-warning">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {formatEuro(valore.in_ritardo)} in ritardo
          </p>
        ) : null}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Contatti</h2>
          <ModificaCliente
            cliente={{
              id: cliente.id,
              nome: cliente.nome,
              cognome: cliente.cognome,
              email: cliente.email,
              telefono: cliente.telefono,
              instagram_handle: cliente.instagram_handle,
              fonte: cliente.fonte,
              setter_id: cliente.setter_id,
              closer_id: cliente.closer_id,
              note: cliente.note,
            }}
            // a former collaborator stays selectable where they already are
            setters={(persone ?? [])
              .filter((p) => (p.ruolo === 'setter' || p.ruolo === 'admin') && (p.attivo || p.id === cliente.setter_id))
              .map(({ id, nome }) => ({ id, nome }))}
            closers={(persone ?? [])
              .filter((p) => (p.ruolo === 'admin' || p.ruolo === 'closer') && (p.attivo || p.id === cliente.closer_id))
              .map(({ id, nome }) => ({ id, nome }))}
          />
        </div>
        <dl className="divide-y divide-border rounded-xl bg-card px-3">
          {contatti.map(([etichetta, v]) => (
            <div key={etichetta} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <dt className="text-sm text-muted-foreground">{etichetta}</dt>
              <dd className="truncate text-right text-sm">{v}</dd>
            </div>
          ))}
          {cliente.note ? (
            <div className="py-3">
              <dt className="text-sm text-muted-foreground">Note</dt>
              <dd className="mt-1 text-sm whitespace-pre-line">{cliente.note}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Storico percorsi ({percorsi.length})
        </h2>
        {percorsi.length > 0 ? (
          <StoricoPercorsi percorsi={percorsi} oggi={oggi} />
        ) : (
          // the action is the header's "Registra la prima vendita": one link, not two
          <StatoVuoto
            Icona={History}
            titolo="Nessun percorso registrato"
            descrizione="Con «Registra la prima vendita» parte lo storico: ogni rinnovo si aggiunge sopra e i periodi passati restano qui."
          />
        )}
      </section>
    </div>
  )
}
