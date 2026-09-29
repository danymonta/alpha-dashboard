import { PackageX, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'

import type { RataAnteprima } from '@/app/(app)/sales/new/actions'
import {
  NuovaVenditaForm,
  type IniziVendita,
  type PercorsoPrecedente,
} from '@/app/(app)/sales/new/nuova-vendita-form'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { percorsoDiRitorno } from '@/lib/auth/origine'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, oggiRoma, stessoGiornoTraMesi } from '@/lib/date'
import { formatData, formatImportoInput } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { leggiPianoPredefinito } from '@/lib/validation/anagrafiche'
import { GIORNI_INIZIO_PRIMA, TIPI_VENDITA, inizioMassimo, type TipoVendita } from '@/lib/validation/vendita'

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

type VenditaPassata = {
  tipo: TipoVendita
  product_id: string | null
  prodotto_personalizzato: string | null
  data_inizio: string
  data_fine: string
  valore_contratto: number
  created_at: string
  prodotto: { nome: string } | null
}

/** The period a renewal extends: the path (not an upsell) that ends last. */
function ultimoPercorso(vendite: VenditaPassata[]): VenditaPassata | null {
  const piuTardi = (a: VenditaPassata, b: VenditaPassata) =>
    b.data_fine.localeCompare(a.data_fine) || b.created_at.localeCompare(a.created_at)
  const percorsi = vendite.filter((v) => v.tipo !== 'upsell')
  return [...(percorsi.length > 0 ? percorsi : vendite)].sort(piuTardi)[0] ?? null
}

/** "Marco De Luca" -> nome "Marco", cognome "De Luca". Only a prefill, editable. */
function dividiNome(completo: string) {
  const [nome = '', ...resto] = completo.trim().split(/\s+/)
  return { nome, cognome: resto.join(' ') }
}

export default async function NuovaVenditaPage({
  searchParams,
}: {
  searchParams: Promise<{ call?: string; cliente?: string; tipo?: string; da?: string }>
}) {
  const profilo = await requireRuolo(['closer', 'admin'])
  const { call: callId, cliente: clienteId, tipo, da } = await searchParams
  // "?da=": the page the call was closed from (the closer's day), only a path of this app
  const tornaA = percorsoDiRitorno(da)
  // back to where the sale starts from: that page, the closed call, the client's page, or the sales list
  const indietro: Indietro = tornaA
    ? { href: tornaA, etichetta: 'Indietro' }
    : callId
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

  const oggi = oggiRoma()
  let clienteEsistente: { id: string; nome: string } | null = null
  let prefill = { nome: '', cognome: '', instagram_handle: '' }
  let riepilogo: [string, string][] = []
  let percorsoPrecedente: PercorsoPrecedente | null = null
  let iniziali: IniziVendita | null = null
  let anteprimaIniziale: RataAnteprima[] | null = null
  // the day the sale is signed: today, or the day of the closed call
  let dataVenditaIniziale = oggi

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

    // A call closed on a past day (from the closer's day) is signed that day: the
    // closer's row then shows the close, the cash and the revenue together
    const giornoCall = oggiRoma(new Date(call.programmata_il))
    dataVenditaIniziale = giornoCall < oggi ? giornoCall : oggi

    riepilogo = [
      ['Setter', call.setter?.nome ?? '–'],
      ['Closer', call.closer?.nome ?? '–'],
      ['Call del', formatData(giornoCall)],
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

    // "Ha rinnovato": the new period starts the day after the last one, with the same product
    if (tipo === 'rinnovo') {
      const { data: passate } = await supabase
        .from('sales')
        .select('tipo, product_id, prodotto_personalizzato, data_inizio, data_fine, valore_contratto, created_at, prodotto:products(nome)')
        .eq('client_id', cliente.id)
      const ultimo = ultimoPercorso(passate ?? [])
      if (ultimo) {
        const giornoDopo = aggiungiGiorni(ultimo.data_fine, 1)
        // the form takes a start from a month before the sale date to a year after
        // (a renewal signed early): outside that window the renewal starts today
        const partenza: PercorsoPrecedente['partenza'] =
          giornoDopo < aggiungiGiorni(oggi, -GIORNI_INIZIO_PRIMA)
            ? 'oggi_finito'
            : giornoDopo > inizioMassimo('rinnovo', oggi)
              ? 'oggi_lontano'
              : 'giorno_dopo'
        percorsoPrecedente = {
          prodotto: ultimo.prodotto?.nome ?? ultimo.prodotto_personalizzato ?? '–',
          data_inizio: ultimo.data_inizio,
          data_fine: ultimo.data_fine,
          valore_contratto: ultimo.valore_contratto,
          partenza,
        }

        // the same product only while it is still sold; the rest as if chosen by hand
        const prodotto = prodotti.find((p) => p.id === ultimo.product_id)
        const piano = prodotto ? leggiPianoPredefinito(prodotto.piano_predefinito) : null
        iniziali = {
          data_inizio: partenza === 'giorno_dopo' ? giornoDopo : oggi,
          product_id: prodotto?.id,
          valore_contratto: prodotto ? formatImportoInput(prodotto.prezzo_listino) : '',
          piano: piano?.length ? 'personalizzato' : 'uguale',
          rate: (piano ?? []).map((r) => ({
            scadenza: stessoGiornoTraMesi(oggi, r.mese),
            importo: formatImportoInput(r.importo),
          })),
        }
        // the equal-split preview, from the same function the form asks
        if (prodotto && !piano?.length) {
          const { data } = await supabase.rpc('piano_rate', {
            p_valore: prodotto.prezzo_listino,
            p_numero_rate: 1,
            p_data_vendita: oggi,
          })
          anteprimaIniziale = data ?? null
        }
      }
    }
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

  // opened from a client (sheet, Rinnovi, Panoramica: those links name the type):
  // after saving, back to the client's history, where the new period shows on top
  const ritorno =
    tornaA ??
    (clienteEsistente && !callId && profilo.ruolo === 'admin' && TIPI_VENDITA.includes(tipo as TipoVendita)
      ? `/clients/${clienteEsistente.id}`
      : null)

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
        oggi={oggi}
        dataVenditaIniziale={dataVenditaIniziale}
        prodotti={prodotti.map((p) => ({ ...p, piano_predefinito: leggiPianoPredefinito(p.piano_predefinito) }))}
        callId={callId ?? null}
        clienteEsistente={clienteEsistente}
        prefill={prefill}
        tipoIniziale={tipoIniziale}
        iniziali={iniziali}
        anteprimaIniziale={anteprimaIniziale}
        percorsoPrecedente={percorsoPrecedente}
        ritorno={ritorno}
      />
    </Pagina>
  )
}
