import { RefreshCw, SearchX, TriangleAlert } from 'lucide-react'

import { ModificaCliente } from '@/app/(app)/clients/[id]/modifica-cliente'
import { StatoClienteBadge } from '@/components/cliente/stato-cliente'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { ElencoVendite } from '@/components/vendite/elenco-vendite'
import { requireRuolo } from '@/lib/auth/session'
import { formatData, formatEuro } from '@/lib/format'
import { caricaVendite } from '@/lib/queries/vendite'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_FONTE } from '@/lib/validation/call'

export const dynamic = 'force-dynamic'

export default async function SchedaClientePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRuolo(['admin'])
  const { id } = await params
  const supabase = await createClient()

  const [{ data: cliente }, { data: valore }, vendite, { data: persone }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, nome, cognome, email, telefono, instagram_handle, fonte, note, created_at, setter_id, closer_id, setter:profiles!clients_setter_id_fkey(nome), closer:profiles!clients_closer_id_fkey(nome)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('v_clienti')
      .select('stato, valore_firmato, incassato, da_incassare, in_ritardo, data_fine_ultima')
      .eq('client_id', id)
      .maybeSingle(),
    caricaVendite({ clientId: id }),
    supabase.from('profiles').select('id, nome, ruolo, attivo').in('ruolo', ['admin', 'setter', 'closer']).order('nome'),
  ])

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
          <div className="flex flex-wrap gap-2">
            <LinkBottone href={`/sales/new?cliente=${id}&tipo=rinnovo`}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Registra rinnovo
            </LinkBottone>
            <LinkBottone href={`/sales/new?cliente=${id}&tipo=upsell`} variant="outline">
              Upsell
            </LinkBottone>
          </div>
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
              .filter((p) => p.ruolo === 'setter' && (p.attivo || p.id === cliente.setter_id))
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
          Storico vendite ({vendite.length})
        </h2>
        {vendite.length > 0 ? (
          <ElencoVendite righe={vendite} mostraPersone mostraCliente={false} />
        ) : (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Nessuna vendita registrata.
          </p>
        )}
      </section>
    </div>
  )
}
