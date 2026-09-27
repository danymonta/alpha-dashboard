import { PackageX, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'

import { NuovaVenditaForm } from '@/app/(app)/sales/new/nuova-vendita-form'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { leggiPianoPredefinito } from '@/lib/validation/anagrafiche'
import { TIPI_VENDITA, type TipoVendita } from '@/lib/validation/vendita'

export const dynamic = 'force-dynamic'

type Indietro = { href: string; etichetta: string }

function Pagina({
  descrizione,
  indietro,
  children,
}: {
  descrizione?: string
  indietro: Indietro
  children: ReactNode
}) {
  return (
    <div className="max-w-xl space-y-6">
      <IntestazionePagina titolo="Nuova vendita" descrizione={descrizione} indietro={indietro} />
      {children}
    </div>
  )
}

function Impossibile({
  titolo,
  descrizione,
  azione,
  indietro,
}: {
  titolo: string
  descrizione: string
  azione: ReactNode
  indietro: Indietro
}) {
  return (
    <Pagina indietro={indietro}>
      <StatoVuoto Icona={SearchX} titolo={titolo} descrizione={descrizione} azione={azione} />
    </Pagina>
  )
}

const tornaAlleCall = (
  <LinkBottone href="/calls" variant="outline">
    Torna alle mie call
  </LinkBottone>
)

/** "Marco De Luca" -> nome "Marco", cognome "De Luca". Only a prefill, editable. */
function dividiNome(completo: string) {
  const [nome = '', ...resto] = completo.trim().split(/\s+/)
  return { nome, cognome: resto.join(' ') }
}

export default async function NuovaVenditaPage({
  searchParams,
}: {
  searchParams: Promise<{ call?: string; cliente?: string; tipo?: string }>
}) {
  const profilo = await requireRuolo(['closer', 'admin'])
  const { call: callId, cliente: clienteId, tipo } = await searchParams
  // back to where the sale starts from: the closed call, the client's page, or the sales list
  const indietro: Indietro = callId
    ? { href: '/calls', etichetta: 'Le mie call' }
    : clienteId && profilo.ruolo === 'admin'
      ? { href: `/clients/${clienteId}`, etichetta: 'Scheda cliente' }
      : profilo.ruolo === 'admin'
        ? { href: '/sales', etichetta: 'Vendite' }
        : { href: '/my-sales', etichetta: 'Le mie vendite' }
  const supabase = await createClient()

  const { data: prodotti, error: erroreProdotti } = await supabase
    .from('products')
    .select('id, nome, durata_mesi, prezzo_listino, piano_predefinito')
    .eq('attivo', true)
    .order('durata_mesi')
  if (erroreProdotti) throw new Error('Impossibile caricare i prodotti')

  let clienteEsistente: { id: string; nome: string } | null = null
  let prefill = { nome: '', cognome: '', instagram_handle: '' }
  let riepilogo: [string, string][] = []

  if (callId) {
    const { data: call } = await supabase
      .from('calls')
      .select(
        'id, esito, lead_id, programmata_il, lead:leads(nome, instagram_handle), setter:profiles!calls_setter_id_fkey(nome), closer:profiles!calls_closer_id_fkey(nome)',
      )
      .eq('id', callId)
      .maybeSingle()

    if (!call) {
      return (
        <Impossibile
          indietro={indietro}
          titolo="Call non trovata"
          descrizione="La call non esiste o non è assegnata a te."
          azione={tornaAlleCall}
        />
      )
    }
    if (call.esito !== 'chiusa') {
      return (
        <Impossibile
          indietro={indietro}
          titolo="La call non risulta chiusa"
          descrizione="Una vendita nasce da una call con esito «Chiusa». Registra prima l’esito."
          azione={tornaAlleCall}
        />
      )
    }

    const { data: venditaEsistente } = await supabase
      .from('sales')
      .select('id')
      .eq('call_id', call.id)
      .maybeSingle()
    if (venditaEsistente) {
      return (
        <Impossibile
          indietro={indietro}
          titolo="Vendita già registrata"
          descrizione="Questa call ha già la sua vendita: aprila per vedere il piano rate."
          azione={
            <LinkBottone href={`/sales/${venditaEsistente.id}`}>Apri la vendita</LinkBottone>
          }
        />
      )
    }

    const { data: cliente } = await supabase
      .from('clients')
      .select('id, nome, cognome')
      .eq('lead_id', call.lead_id)
      .order('created_at')
      .limit(1)
      .maybeSingle()

    if (cliente) {
      clienteEsistente = { id: cliente.id, nome: [cliente.nome, cliente.cognome].filter(Boolean).join(' ') }
    } else if (call.lead) {
      prefill = {
        ...dividiNome(call.lead.nome),
        instagram_handle: call.lead.instagram_handle?.replace(/^@/, '') ?? '',
      }
    }

    riepilogo = [
      ['Setter', call.setter?.nome ?? '–'],
      ['Closer', call.closer?.nome ?? '–'],
      ['Call del', formatData(oggiRoma(new Date(call.programmata_il)))],
    ]
  } else if (clienteId) {
    const { data: cliente } = await supabase
      .from('clients')
      .select('id, nome, cognome')
      .eq('id', clienteId)
      .maybeSingle()
    if (!cliente) {
      return (
        <Impossibile
          indietro={indietro}
          titolo="Cliente non trovato"
          descrizione="Il cliente non esiste o non è tra i tuoi."
          azione={tornaAlleCall}
        />
      )
    }
    clienteEsistente = { id: cliente.id, nome: [cliente.nome, cliente.cognome].filter(Boolean).join(' ') }
  }

  if (prodotti.length === 0) {
    return (
      <Pagina indietro={indietro}>
        <StatoVuoto
          Icona={PackageX}
          titolo="Nessun prodotto attivo"
          descrizione="Serve almeno un prodotto attivo (ad esempio «Percorso Alpha 3 mesi») per registrare una vendita. Si gestiscono in Impostazioni."
        />
      </Pagina>
    )
  }

  const tipoIniziale: TipoVendita =
    clienteEsistente && TIPI_VENDITA.includes(tipo as TipoVendita)
      ? (tipo as TipoVendita)
      : clienteEsistente && !callId
        ? 'rinnovo'
        : 'nuovo'

  return (
    <Pagina indietro={indietro} descrizione={callId ? 'Precompilata dalla call appena chiusa.' : undefined}>
      {riepilogo.length > 0 ? (
        <dl className="divide-y divide-border rounded-xl bg-card px-3" data-testid="precompilata">
          {riepilogo.map(([etichetta, valore]) => (
            <div key={etichetta} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <dt className="text-sm text-muted-foreground">{etichetta}</dt>
              <dd className="text-right text-sm">{valore}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <NuovaVenditaForm
        oggi={oggiRoma()}
        prodotti={prodotti.map((p) => ({ ...p, piano_predefinito: leggiPianoPredefinito(p.piano_predefinito) }))}
        callId={callId ?? null}
        clienteEsistente={clienteEsistente}
        prefill={prefill}
        tipoIniziale={tipoIniziale}
      />
    </Pagina>
  )
}
